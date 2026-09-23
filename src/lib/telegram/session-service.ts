/**
 * Per-chat bot session state.
 *
 * A Telegram chat has no cookies and no URL, so the equivalent of the
 * storefront's `?branch=...` query parameter has to be remembered server-side.
 * Stored in Firestore rather than memory because the webhook runs on serverless
 * functions: consecutive messages from the same customer can land on different
 * instances, so anything held in a module variable would be lost between taps.
 *
 * Kept separate from `telegramCarts` so clearing a cart cannot lose the
 * customer's branch, and vice versa.
 */

import { adminDb } from "../firebase-admin";

const COLLECTION = "telegramSessions";

export interface TelegramSession {
  /** Selected branch (shop) id, scoping every product listing. */
  branchId?: string;
  /** Cached branch name, so menus can be labelled without a second read. */
  branchName?: string;
}

/** Read a chat's session. Returns an empty session when none exists yet. */
export async function getTelegramSession(
  chatId: string,
): Promise<TelegramSession> {
  if (!adminDb) {
    console.error("Cannot read session: Firebase Admin not configured");
    return {};
  }

  try {
    const doc = await adminDb.collection(COLLECTION).doc(chatId).get();
    if (!doc.exists) return {};

    const data = doc.data() || {};
    return {
      branchId: data.branchId || undefined,
      branchName: data.branchName || undefined,
    };
  } catch (error) {
    console.error("Error reading Telegram session:", error);
    return {};
  }
}

/** Remember the customer's branch choice. */
export async function setTelegramBranch(
  chatId: string,
  branchId: string,
  branchName: string,
): Promise<boolean> {
  if (!adminDb) return false;

  try {
    await adminDb.collection(COLLECTION).doc(chatId).set(
      {
        chatId,
        branchId,
        branchName,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return true;
  } catch (error) {
    console.error("Error saving Telegram branch:", error);
    return false;
  }
}

/**
 * Resolve the chat's branch, dropping it if that branch has since been removed.
 *
 * A stale id would silently filter every listing down to nothing, which looks
 * like an empty shop rather than a stale setting — so an unknown branch is
 * treated as "not chosen" and the customer is asked again.
 */
export async function resolveSessionBranch(
  chatId: string,
): Promise<{ id: string; name: string } | null> {
  const session = await getTelegramSession(chatId);
  if (!session.branchId) return null;

  const { getShopById } = await import("../shops");
  const shop = await getShopById(session.branchId);

  if (!shop) {
    console.warn(
      `Chat ${chatId} had branch ${session.branchId}, which no longer exists`,
    );
    return null;
  }

  return { id: shop.id, name: shop.name };
}
