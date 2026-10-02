import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { catalogUnitPrice } from "../lib/orderPricing";

/**
 * Live catalogue prices for a handful of products (a cart's worth).
 *
 * A cart line keeps the price it had when it was added, so a price change in
 * the POS, or a product being deleted, used to go unnoticed until the order
 * failed. This subscribes to just the listed `stocks` documents and reports
 * each one's current unit price, using the same rule as the order routes
 * (`catalogUnitPrice`), so checkout shows what the server will charge.
 *
 * `prices[id]` is `undefined` while loading, `null` when the product no longer
 * exists or has no sellable price.
 */
export function useCatalogPrices(productIds: string[]) {
  // Stable key so the effect only resubscribes when the set of ids changes.
  const key = useMemo(
    () => Array.from(new Set(productIds.filter(Boolean))).sort().join("|"),
    [productIds],
  );
  const [prices, setPrices] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    if (!db || ids.length === 0) return;
    const firestore = db;

    const unsubscribers = ids.map((id) =>
      onSnapshot(
        doc(firestore, "stocks", id),
        (snap) => {
          const price = snap.exists()
            ? catalogUnitPrice(snap.data() as Record<string, unknown>)
            : null;
          setPrices((prev) =>
            prev[id] === price ? prev : { ...prev, [id]: price },
          );
        },
        (error) => {
          console.error(`Could not watch price for ${id}:`, error);
          setPrices((prev) => ({ ...prev, [id]: null }));
        },
      ),
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [key]);

  const ids = key ? key.split("|") : [];
  const isLoading = ids.some((id) => prices[id] === undefined);

  return { prices, isLoading };
}
