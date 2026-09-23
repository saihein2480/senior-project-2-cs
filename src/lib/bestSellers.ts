/**
 * Best-selling product ranking, derived from sales history.
 *
 * There is no maintained aggregate for this: ranking means scanning the
 * `transactions` collection and summing line items per product. `/api/top-selling`
 * does the same thing with extra branch scoping and image resolution for the
 * storefront grid; this is the minimal version the Telegram bot needs — an
 * ordered list of product ids it can sort its own catalogue by.
 *
 * Server-only (Admin SDK).
 */

import { adminDb } from "./firebase-admin";

/**
 * Statuses that represent a real sale. Refunded orders stay in because the units
 * did move; excluding them would make the ranking jump around as returns land.
 */
const SOLD_STATUSES = ["completed", "partially_refunded", "refunded"];

/** The scan is expensive and the ranking barely moves minute to minute. */
const CACHE_TTL_MS = 60 * 1000;

let cached: { ids: string[]; at: number } | null = null;

/**
 * Product ids ordered by units sold, best first.
 *
 * Ties break on revenue, matching `/api/top-selling` so the bot and the website
 * agree on the order. Returns `[]` on failure rather than throwing — a missing
 * ranking should degrade to "no best sellers yet", not break the menu.
 */
export async function getBestSellerProductIds(limit = 50): Promise<string[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.ids.slice(0, limit);
  }

  if (!adminDb) {
    console.error("Cannot rank best sellers: Firebase Admin not configured");
    return [];
  }

  try {
    const snapshot = await adminDb
      .collection("transactions")
      .where("status", "in", SOLD_STATUSES)
      .get();

    const totals = new Map<string, { quantity: number; revenue: number }>();

    snapshot.docs.forEach((doc) => {
      const items = (doc.data().items || []) as Array<Record<string, unknown>>;

      items.forEach((item) => {
        // Line items carry the stock document id on either field; `groupName` is
        // a legacy fallback and is not an id, so it is not usable here.
        const productId = String(item.stockId || item.productId || "");
        if (!productId) return;

        const quantity = Number(item.quantity) || 0;
        const revenue = (Number(item.unitPrice) || 0) * quantity;

        const existing = totals.get(productId);
        if (existing) {
          existing.quantity += quantity;
          existing.revenue += revenue;
        } else {
          totals.set(productId, { quantity, revenue });
        }
      });
    });

    const ids = [...totals.entries()]
      .sort((a, b) =>
        b[1].quantity !== a[1].quantity
          ? b[1].quantity - a[1].quantity
          : b[1].revenue - a[1].revenue,
      )
      .map(([productId]) => productId);

    cached = { ids, at: Date.now() };
    return ids.slice(0, limit);
  } catch (error) {
    console.error("Error ranking best sellers:", error);
    return [];
  }
}
