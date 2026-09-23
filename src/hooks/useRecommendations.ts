import { useMemo } from "react";
import { useProducts, type Product } from "./useProducts";
import { useShops } from "./useShops";
import { useShopperSignals } from "./useShopperSignals";
import {
  rankRecommendations,
  type ScoredProduct,
} from "../lib/recommendations/score";

export type UseRecommendationsOptions = {
  /** Branch id from the URL. Recommendations stay within the chosen branch. */
  branch?: string;
  /** Omit to get the full ranking so the caller can paginate it. */
  limit?: number;
};

export type UseRecommendationsResult = {
  recommendations: ScoredProduct[];
  /** False for a brand-new shopper, which is what hides the section. */
  hasSignals: boolean;
  loading: boolean;
};

/**
 * Rank the catalogue for the current shopper.
 *
 * Reuses the shared `["products"]` query, so this adds no network request and
 * picks up the same realtime stock updates the listing grids use.
 */
export function useRecommendations(
  options: UseRecommendationsOptions = {},
): UseRecommendationsResult {
  const { branch, limit } = options;

  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: shops = [] } = useShops();
  const { views, searches, purchases, hasSignals, loading: signalsLoading } =
    useShopperSignals();

  // A product's `shop` field holds either a branch id or a branch name
  // depending on how it was created, so match on both — same approach the
  // listing grid takes.
  const branchProducts = useMemo<Product[]>(() => {
    if (!branch) return products;
    const branchName = shops.find((shop) => shop.id === branch)?.name;

    return products.filter((product) => {
      const productShop = String(product.shop || "");
      if (!productShop) return true;
      return productShop === branch || productShop === branchName;
    });
  }, [products, shops, branch]);

  const recommendations = useMemo(() => {
    if (!hasSignals || branchProducts.length === 0) return [];
    return rankRecommendations({
      products: branchProducts,
      views,
      searches,
      purchases,
      limit,
    });
  }, [branchProducts, views, searches, purchases, hasSignals, limit]);

  return {
    recommendations,
    hasSignals,
    loading: productsLoading || signalsLoading,
  };
}
