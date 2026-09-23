/**
 * Telegram Authentication & Account Linking Service
 */

import { adminDb } from "../firebase-admin";
import crypto from "crypto";
import type { AccountLinkToken } from "./types";

/**
 * Generate a secure link token
 */
export async function generateLinkToken(telegramChatId: string): Promise<string> {
  if (!adminDb) {
    throw new Error("Firebase Admin not configured");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

  const linkTokenData: AccountLinkToken = {
    token,
    customerId: "", // Will be filled when user logs in
    telegramChatId,
    createdAt: now,
    expiresAt,
    used: false,
    direction: "telegram",
  };

  await adminDb.collection("telegramLinkTokens").doc(token).set(linkTokenData);

  console.log(`✅ Generated link token for chat ${telegramChatId}`);

  return token;
}

/**
 * Coerce a stored expiry into a Date.
 *
 * Firestore hands back a Timestamp for dates written through the Admin SDK, but
 * these documents have also been written with plain Dates and ISO strings over
 * time, so all three shapes have to be tolerated.
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return new Date(value as string | number);
}

/** Deep-link payloads are capped at 64 characters, so this token is short. */
const WEB_LINK_TOKEN_BYTES = 24; // -> 32 base64url chars
export const WEB_LINK_TOKEN_TTL_MINUTES = 15;

/**
 * Issue a link token to a signed-in customer for the storefront-initiated flow.
 *
 * The customer carries this to the bot as a `?start=link_<token>` deep link. The
 * chat id is deliberately left blank: it is only trustworthy when it arrives on
 * a real Telegram update, which is what closes the loop in `claimWebLinkToken`.
 *
 * `customerId` must already be an authenticated uid.
 */
export async function generateWebLinkToken(customerId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  if (!adminDb) {
    throw new Error("Firebase Admin not configured");
  }

  // Retire any outstanding token for this customer. Otherwise an abandoned
  // token stays claimable for its full window, and whoever holds it could bind
  // a different chat to this account later.
  const outstanding = await adminDb
    .collection("telegramLinkTokens")
    .where("customerId", "==", customerId)
    .where("direction", "==", "web")
    .where("used", "==", false)
    .get();

  if (!outstanding.empty) {
    const batch = adminDb.batch();
    outstanding.docs.forEach((doc) =>
      batch.update(doc.ref, { used: true, supersededAt: new Date() }),
    );
    await batch.commit();
  }

  const token = crypto.randomBytes(WEB_LINK_TOKEN_BYTES).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + WEB_LINK_TOKEN_TTL_MINUTES * 60 * 1000,
  );

  const linkTokenData: AccountLinkToken = {
    token,
    customerId,
    telegramChatId: "", // Filled when the bot receives the deep-link /start
    createdAt: now,
    expiresAt,
    used: false,
    direction: "web",
  };

  await adminDb.collection("telegramLinkTokens").doc(token).set(linkTokenData);

  console.log(`✅ Generated web link token for customer ${customerId}`);

  return { token, expiresAt };
}

/**
 * Claim a storefront-issued token on behalf of a Telegram chat.
 *
 * Called from the bot when it sees `/start link_<token>`. The chat id comes from
 * the Telegram update itself, so it cannot be forged by the caller — that plus
 * the token (which only the signed-in customer could have obtained) is what
 * makes the pairing trustworthy.
 */
export async function claimWebLinkToken(
  token: string,
  telegramChatId: string,
): Promise<{ valid: boolean; error?: string; customerId?: string }> {
  if (!adminDb) {
    return { valid: false, error: "Firebase Admin not configured" };
  }

  const tokenRef = adminDb.collection("telegramLinkTokens").doc(token);

  try {
    return await adminDb.runTransaction(async (tx) => {
      const tokenDoc = await tx.get(tokenRef);

      if (!tokenDoc.exists) {
        return { valid: false as const, error: "This link is not valid." };
      }

      const tokenData = tokenDoc.data() as AccountLinkToken;

      // A chat-issued token has no customer on it yet; claiming it here would
      // link an empty uid.
      if (tokenData.direction !== "web") {
        return { valid: false as const, error: "This link is not valid." };
      }

      if (tokenData.used) {
        return {
          valid: false as const,
          error: "This link has already been used. Request a new one.",
        };
      }

      const now = new Date();
      if (now > toDate(tokenData.expiresAt)) {
        return {
          valid: false as const,
          error: "This link has expired. Request a new one.",
        };
      }

      if (!tokenData.customerId) {
        return { valid: false as const, error: "This link is not valid." };
      }

      tx.update(tokenRef, {
        used: true,
        telegramChatId,
        usedAt: now,
      });

      return { valid: true as const, customerId: tokenData.customerId };
    });
  } catch (error) {
    console.error("Error claiming web link token:", error);
    return { valid: false, error: "Could not complete linking." };
  }
}

/**
 * Verify a link token and claim it for `customerId`.
 *
 * Claiming happens inside a transaction because the token is the only proof
 * that the person completing the link is the person holding the Telegram chat.
 * A read-then-write would let two concurrent requests both pass the `used`
 * check and bind the same chat to two different accounts.
 *
 * `customerId` must already be an authenticated uid — this function trusts it.
 * See the note in the link-account route.
 */
export async function verifyLinkToken(
  token: string,
  customerId: string
): Promise<{ valid: boolean; error?: string; telegramChatId?: string }> {
  if (!adminDb) {
    return { valid: false, error: "Firebase Admin not configured" };
  }

  const tokenRef = adminDb.collection("telegramLinkTokens").doc(token);

  try {
    return await adminDb.runTransaction(async (tx) => {
      const tokenDoc = await tx.get(tokenRef);

      if (!tokenDoc.exists) {
        return { valid: false as const, error: "Invalid token" };
      }

      const tokenData = tokenDoc.data() as AccountLinkToken;

      // Only a bot-issued token carries a trusted chat id. A storefront-issued
      // one has `telegramChatId: ""`, so consuming it here would "link" an empty
      // chat and leave the customer looking connected but unreachable.
      if (tokenData.direction === "web") {
        return { valid: false as const, error: "Invalid token" };
      }

      if (!tokenData.telegramChatId) {
        return { valid: false as const, error: "Invalid token" };
      }

      // Check if already used
      if (tokenData.used) {
        return { valid: false as const, error: "Token already used" };
      }

      // Check if expired
      const now = new Date();
      if (now > toDate(tokenData.expiresAt)) {
        return { valid: false as const, error: "Token expired" };
      }

      // Claim it. Spending the token before the link is written means a failed
      // link forces the customer to run /link again, which is the safe
      // direction to fail: a token that stays claimable is a token an attacker
      // can race for.
      tx.update(tokenRef, {
        used: true,
        customerId,
        usedAt: now,
      });

      return {
        valid: true as const,
        telegramChatId: tokenData.telegramChatId,
      };
    });
  } catch (error) {
    console.error("Error verifying link token:", error);
    return { valid: false, error: "Verification failed" };
  }
}

/**
 * Detach a Telegram chat from every customer except `keepCustomerId`.
 *
 * A chat id must map to at most one account. Without this, two customers who
 * both linked the same Telegram chat would each have it on their document, and
 * both would receive the other's order notifications in that one chat —
 * exactly the "notification sent to the wrong person" failure the linking flow
 * exists to prevent. `getCustomerByTelegramId` also does `.limit(1)`, so
 * inbound bot commands would resolve to an arbitrary one of them.
 */
async function releaseChatIdFromOtherCustomers(
  chatId: string,
  keepCustomerId: string,
): Promise<number> {
  if (!adminDb) return 0;

  const clashes = await adminDb
    .collection("customers")
    .where("telegramChatId", "==", chatId)
    .get();

  const stale = clashes.docs.filter((doc) => doc.id !== keepCustomerId);
  if (stale.length === 0) return 0;

  const batch = adminDb.batch();
  const now = new Date();

  stale.forEach((doc) => {
    batch.update(doc.ref, {
      telegramChatId: null,
      telegramUsername: null,
      telegramFirstName: null,
      telegramLastName: null,
      telegramLinkedAt: null,
      updatedAt: now,
    });
  });

  await batch.commit();

  console.warn(
    `⚠️ Telegram chat ${chatId} was already linked to ${stale.length} other ` +
      `customer(s) (${stale.map((d) => d.id).join(", ")}); detached them.`,
  );

  return stale.length;
}

/**
 * Link Telegram account to customer
 */
export async function linkTelegramToCustomer(
  customerId: string,
  telegramData: {
    chatId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<boolean> {
  if (!adminDb) {
    throw new Error("Firebase Admin not configured");
  }

  try {
    const now = new Date();

    // One chat id, one account. Do this before writing so the new owner is the
    // only holder even if the previous link was never cleaned up.
    await releaseChatIdFromOtherCustomers(telegramData.chatId, customerId);

    await adminDb
      .collection("customers")
      .doc(customerId)
      .update({
        telegramChatId: telegramData.chatId,
        telegramUsername: telegramData.username || null,
        telegramFirstName: telegramData.firstName || null,
        telegramLastName: telegramData.lastName || null,
        telegramLinkedAt: now,
        notificationPreferences: {
          telegram: true,
          orderUpdates: true,
          promotions: true,
          deliveryAlerts: true,
        },
        updatedAt: now,
      });

    console.log(`✅ Linked Telegram ${telegramData.chatId} to customer ${customerId}`);

    return true;
  } catch (error) {
    console.error("Error linking Telegram account:", error);
    return false;
  }
}

/**
 * Unlink Telegram account from customer
 */
export async function unlinkTelegramFromCustomer(customerId: string): Promise<boolean> {
  if (!adminDb) {
    throw new Error("Firebase Admin not configured");
  }

  try {
    await adminDb
      .collection("customers")
      .doc(customerId)
      .update({
        telegramChatId: null,
        telegramUsername: null,
        telegramFirstName: null,
        telegramLastName: null,
        telegramLinkedAt: null,
        updatedAt: new Date(),
      });

    console.log(`✅ Unlinked Telegram from customer ${customerId}`);

    return true;
  } catch (error) {
    console.error("Error unlinking Telegram account:", error);
    return false;
  }
}

/**
 * Get customer by link token
 */
export async function getCustomerByLinkToken(
  token: string
): Promise<{ customerId: string; used: boolean } | null> {
  if (!adminDb) {
    return null;
  }

  try {
    const tokenDoc = await adminDb.collection("telegramLinkTokens").doc(token).get();

    if (!tokenDoc.exists) {
      return null;
    }

    const tokenData = tokenDoc.data() as AccountLinkToken;

    return {
      customerId: tokenData.customerId,
      used: tokenData.used,
    };
  } catch (error) {
    console.error("Error getting customer by token:", error);
    return null;
  }
}
