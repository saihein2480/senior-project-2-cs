import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCustomerAuth } from "../contexts/CustomerAuthContext";
import { usePurchases } from "./usePurchases";
import {
  EMPTY_SIGNALS,
  getEmptySignalsSnapshot,
  getLocalSignalsSnapshot,
  subscribeToLocalSignals,
  type StoredSignals,
} from "../lib/recommendations/history";
import { subscribeToRemoteSignals } from "../lib/recommendations/remote";
import { mergeGuestSignalsInto } from "../lib/recommendations/signals";
import type { PurchaseSignal } from "../lib/recommendations/score";

export type ShopperSignals = {
  views: StoredSignals["views"];
  searches: StoredSignals["searches"];
  purchases: PurchaseSignal[];
  /** True once the shopper has browsed, searched, or bought anything. */
  hasSignals: boolean;
  /** Still resolving history for a signed-in shopper. */
  loading: boolean;
};

/** Signals held on the account, tagged with the uid they belong to. */
type RemoteEntry = { uid: string; signals: StoredSignals };

/**
 * Everything we know about this shopper's taste.
 *
 * Signed in: views and searches stream from `shopperSignals/{uid}` over a
 * Firestore listener, so the section re-ranks the moment they view a product —
 * in this tab, another tab, or on their phone. Purchases come from the
 * authenticated purchases API.
 *
 * Guest: views and searches come from this device only, read through
 * `useSyncExternalStore` so hydration stays consistent.
 */
export function useShopperSignals(): ShopperSignals {
  const { user } = useCustomerAuth();
  const uid = user?.uid || null;

  // Device store. Always subscribed: it is the guest source, and it is cheap.
  const localSignals = useSyncExternalStore(
    subscribeToLocalSignals,
    getLocalSignalsSnapshot,
    getEmptySignalsSnapshot,
  );

  // Account store. setState only ever happens inside the Firestore callback,
  // never synchronously in the effect body.
  const [remoteEntry, setRemoteEntry] = useState<RemoteEntry | null>(null);

  // Fold pre-login browsing into the account the first time we see this uid.
  useEffect(() => {
    if (!uid) return;
    void mergeGuestSignalsInto(uid);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeToRemoteSignals(uid, (signals) =>
      setRemoteEntry({ uid, signals }),
    );
  }, [uid]);

  // Tagging the entry with its uid lets us derive "not loaded yet" instead of
  // resetting state in an effect — so a shopper can never momentarily see the
  // previous account's history after a switch.
  const remoteReady = !!uid && remoteEntry?.uid === uid;

  const stored: StoredSignals = uid
    ? remoteReady
      ? (remoteEntry as RemoteEntry).signals
      : EMPTY_SIGNALS
    : localSignals;

  const { transactions, loading: purchasesLoading } = usePurchases({
    pageSize: 20,
  });

  const purchases = useMemo<PurchaseSignal[]>(() => {
    return transactions.flatMap((transaction) =>
      (transaction.items || []).map((item) => {
        // `productId` is on web-created orders; POS ones may only have a name,
        // and mmpay orders sometimes carry a synthetic `stockId`.
        const raw = item as Record<string, unknown>;
        const productId =
          typeof raw.productId === "string"
            ? raw.productId
            : typeof raw.stockId === "string"
              ? raw.stockId
              : undefined;

        return { productId, name: item.groupName };
      }),
    );
  }, [transactions]);

  const hasSignals =
    stored.views.length > 0 ||
    stored.searches.length > 0 ||
    purchases.length > 0;

  return {
    views: stored.views,
    searches: stored.searches,
    purchases,
    hasSignals,
    loading: !!uid && (!remoteReady || purchasesLoading),
  };
}
