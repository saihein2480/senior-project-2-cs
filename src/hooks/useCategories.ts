import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * Categories are owned by the POS app, which stores them as a single array on
 * `settings/categories` (see CategoryService in pos-clothing-store). The
 * storefront treats that document as the source of truth for its category
 * menu so that adding or deleting a category in the admin UI is reflected
 * here — deriving the list from product data instead would keep showing
 * categories the owner deleted and hide newly added ones.
 *
 * Data flows in two ways:
 *   1. `/api/categories` (admin SDK) is the guaranteed source. The storefront
 *      is public, and we can't assume Firestore rules expose `settings` to
 *      unauthenticated clients.
 *   2. A client-side realtime listener on the same document, which pushes
 *      instant updates when the rules *do* allow reading it. If it's denied we
 *      silently fall back to (1) plus refetch-on-focus/interval.
 */
const SETTINGS_COLLECTION = "settings";
const CATEGORIES_DOC_ID = "categories";
const POLL_INTERVAL_MS = 60 * 1000;

type CategoriesDoc = {
  categories?: string[];
  updatedAt?: string;
};

function normalise(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((c) => String(c ?? "").trim()).filter((c) => c.length > 0)
    : [];
}

async function fetchCategories(): Promise<string[]> {
  const response = await fetch("/api/categories", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  return normalise(result?.data);
}

/**
 * Admin-managed category list.
 */
export function useCategories() {
  const queryClient = useQueryClient();

  // Opportunistic realtime listener — see note above.
  useEffect(() => {
    if (!db) return;

    const ref = doc(db, SETTINGS_COLLECTION, CATEGORIES_DOC_ID);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const next = normalise((snap.data() as CategoriesDoc).categories);
        queryClient.setQueryData(["categories"], next);
      },
      () => {
        // Most likely the security rules don't expose `settings` publicly.
        // /api/categories already covers this, so there's nothing to do.
      },
    );

    return () => unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}
