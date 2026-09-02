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
  };

  await adminDb.collection("telegramLinkTokens").doc(token).set(linkTokenData);

  console.log(`✅ Generated link token for chat ${telegramChatId}`);

  return token;
}

/**
 * Verify and use link token
 */
export async function verifyLinkToken(
  token: string,
  customerId: string
): Promise<{ valid: boolean; error?: string; telegramChatId?: string }> {
  if (!adminDb) {
    return { valid: false, error: "Firebase Admin not configured" };
  }

  try {
    const tokenDoc = await adminDb.collection("telegramLinkTokens").doc(token).get();

    if (!tokenDoc.exists) {
      return { valid: false, error: "Invalid token" };
    }

    const tokenData = tokenDoc.data() as AccountLinkToken;

    // Check if already used
    if (tokenData.used) {
      return { valid: false, error: "Token already used" };
    }

    // Check if expired
    const now = new Date();
    const expiresAt = tokenData.expiresAt instanceof Date 
      ? tokenData.expiresAt 
      : (tokenData.expiresAt as any)?.toDate?.() || new Date(tokenData.expiresAt);

    if (now > expiresAt) {
      return { valid: false, error: "Token expired" };
    }

    // Mark token as used
    await adminDb.collection("telegramLinkTokens").doc(token).update({
      used: true,
      customerId,
      usedAt: now,
    });

    return {
      valid: true,
      telegramChatId: tokenData.telegramChatId,
    };
  } catch (error) {
    console.error("Error verifying link token:", error);
    return { valid: false, error: "Verification failed" };
  }
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
