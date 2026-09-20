import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface TopSellingProduct {
  productId: string;
  variantId: string;
  name: string;
  category: string;
  color: string;
  colorCode?: string;
  quantitySold: number;
  revenue: number;
  image?: string;
  price?: number;
}

interface UseTopSellingOptions {
  branch?: string;
  limit?: number;
  autoLoad?: boolean;
}

/**
 * How often the ranking is re-fetched in the background.
 *
 * The aggregation runs server-side over the whole `transactions` collection,
 * so this is deliberately not aggressive. Near-instant updates come from the
 * `stocks` listener instead (see below) — this interval is just a safety net
 * for sales that somehow don't change stock levels.
 */
const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Debounce for stock-driven refreshes. A single sale can update several stock
 * documents at once, and each one fires a snapshot event.
 */
const STOCK_CHANGE_DEBOUNCE_MS = 1500;

async function fetchTopSelling(
  branch?: string,
  limit?: number,
  forceFresh = false,
): Promise<TopSellingProduct[]> {
  const url = new URL("/api/top-selling", window.location.origin);
  if (branch) url.searchParams.set("branch", branch);
  if (limit) url.searchParams.set("limit", limit.toString());
  // Bypass the server's short-lived aggregation cache when we know a sale just
  // happened, so the ranking reflects it immediately.
  if (forceFresh) url.searchParams.set("fresh", "1");

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to fetch top-selling products");
  }

  return result.data || [];
}

export function useTopSelling(options: UseTopSellingOptions = {}) {
  const { branch, limit = 20, autoLoad = true } = options;
  const queryClient = useQueryClient();

  const queryKey = ["topSelling", branch ?? "all", limit] as const;

  // Set when a sale is detected; consumed by the next fetch so it bypasses the
  // server-side aggregation cache exactly once.
  const pendingFreshRef = useRef(false);

  const query = useQuery({
    queryKey,
    queryFn: () => {
      const forceFresh = pendingFreshRef.current;
      pendingFreshRef.current = false;
      return fetchTopSelling(branch, limit, forceFresh);
    },
    enabled: autoLoad,
    // Sales rankings change whenever an order completes, so keep the window
    // for "fresh enough" short and let the triggers below drive updates.
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: autoLoad ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    placeholderData: (previous) => previous,
  });

  /**
   * Realtime trigger.
   *
   * The storefront can't subscribe to `transactions` directly — those
   * documents hold customer PII, so the aggregation is kept behind the admin
   * SDK in /api/top-selling. What the client *does* already have is a live
   * `stocks` subscription (see useProducts): completing a sale decrements the
   * sold variant's quantity, so a change to the cached products query is a
   * reliable signal that sales data just moved. We watch the query cache for
   * that instead of opening a second Firestore listener.
   */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProductsUpdatedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoLoad) return;

    const cache = queryClient.getQueryCache();

    const unsubscribe = cache.subscribe((event) => {
      const key = event.query?.queryKey;
      if (!Array.isArray(key) || key[0] !== "products") return;

      // Only react to actual data updates, not to fetch status transitions.
      const updatedAt = event.query.state.dataUpdatedAt;
      if (!updatedAt) return;

      if (lastProductsUpdatedAtRef.current === null) {
        // First observation is the initial product load, not a sale.
        lastProductsUpdatedAtRef.current = updatedAt;
        return;
      }

      if (updatedAt === lastProductsUpdatedAtRef.current) return;
      lastProductsUpdatedAtRef.current = updatedAt;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        pendingFreshRef.current = true;
        queryClient.invalidateQueries({ queryKey: ["topSelling"] });
      }, STOCK_CHANGE_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryClient, autoLoad]);

  return {
    topSelling: query.data ?? [],
    // When the query is disabled it stays "pending" forever, which would keep
    // consumers stuck on a loading state.
    loading: autoLoad && query.isPending,
    error: query.error ? (query.error as Error).message : null,
    refresh: () => {
      pendingFreshRef.current = true;
      return queryClient.invalidateQueries({ queryKey: ["topSelling"] });
    },
  };
}
