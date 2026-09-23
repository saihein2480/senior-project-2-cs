/**
 * Branches (shops), read server-side.
 *
 * The POS owns the `shops` collection; a product belongs to exactly one branch
 * via `stocks.shop`. The storefront reaches this through `/api/shops` (proxied to
 * the POS), but the Telegram bot has no browser session so it reads the
 * collection directly with the Admin SDK.
 */

import { adminDb } from "./firebase-admin";

export interface Shop {
  id: string;
  name: string;
}

/**
 * Active branches, in a stable order.
 *
 * Read through on every call so a branch added or renamed in the POS shows up in
 * the bot immediately. Sorted by name so the index a keyboard hands out resolves
 * to the same branch when the button is pressed — Firestore does not guarantee
 * document order, and these are identified by id anyway, but a stable order keeps
 * the menu from reshuffling between views.
 *
 * Returns `[]` on failure: "no branches configured" is a state the caller has to
 * handle regardless.
 */
export async function getActiveShops(): Promise<Shop[]> {
  if (!adminDb) {
    console.error("Cannot read shops: Firebase Admin not configured");
    return [];
  }

  try {
    const snapshot = await adminDb.collection("shops").get();

    return snapshot.docs
      .map((doc) => ({
        id: doc.id,
        name: String(doc.data().name ?? "").trim(),
        status: String(doc.data().status ?? "active"),
      }))
      .filter((shop) => shop.name && shop.status !== "inactive")
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error reading shops:", error);
    return [];
  }
}

/** Look up one branch by id, or null when it no longer exists. */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const shops = await getActiveShops();
  return shops.find((shop) => shop.id === shopId) || null;
}
