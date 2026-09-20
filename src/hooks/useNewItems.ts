import { useQuery } from "@tanstack/react-query";

type NewItem = {
  id: string;
  name?: string;
  image?: string;
  groupImage?: string;
  isNew?: boolean;
};

type NewItemsResponse = {
  items: NewItem[];
  error?: string;
};

/**
 * Fetch new items with 5-minute cache
 * @param limit - Optional limit on number of items (default: all)
 */
export function useNewItems(limit?: number, branch?: string) {
  return useQuery({
    // `branch` is part of the key so switching branch refetches rather than
    // reusing another branch's carousel items.
    queryKey: ["newItems", limit, branch ?? "all"],
    queryFn: async (): Promise<NewItem[]> => {
      const url = new URL("/api/new-items", window.location.origin);
      if (branch) url.searchParams.set("branch", branch);
      if (limit) url.searchParams.set("limit", String(limit));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`New items API error: ${response.status}`);
      }
      const json: NewItemsResponse = await response.json();
      const items = json.items || [];

      // Apply limit if specified
      return limit ? items.slice(0, limit) : items;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
