import type { Product } from "../../hooks/useProducts";
import type { SearchedTerm, ViewedProduct } from "./history";

/**
 * Ranking for the "You May Like" section.
 *
 * Pure functions only — no React, no DOM, no storage — so the behaviour can be
 * reasoned about and tested in isolation.
 *
 * The signal we actually rank on is category affinity, because that is the only
 * attribute every product reliably has. Note the catalogue stores a product's
 * category in `Product.description`; `Product.category` is declared on the type
 * but never populated by the Firestore mapper, so reading it would silently
 * yield nothing. `categoryOf()` below is the single place that knows this.
 */

/** A purchased line item, as it appears on a transaction. */
export type PurchaseSignal = {
  /** Present on web-created orders; POS-created ones may only have a name. */
  productId?: string;
  name?: string;
};

export type ScoreWeights = {
  purchasedCategory: number;
  viewedCategory: number;
  searchNameMatch: number;
  searchCategoryMatch: number;
  isNew: number;
};

/**
 * Purchases outrank views because money is a stronger statement than curiosity.
 * A search that literally matches a product name is close behind, since it is
 * an explicit description of what the shopper wanted.
 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  purchasedCategory: 5,
  viewedCategory: 2,
  searchNameMatch: 3,
  searchCategoryMatch: 2,
  isNew: 0.5,
};

/** Interest in a view halves roughly every two weeks. */
const VIEW_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The catalogue keeps the category in `description`. */
export function categoryOf(product: Product): string {
  return String(product.description || product.category || "").trim();
}

function normalise(value: string) {
  return value.trim().toLowerCase();
}

/** Older views count for less, without ever dropping to zero. */
function recencyWeight(timestamp: number) {
  const ageDays = Math.max(0, (Date.now() - timestamp) / MS_PER_DAY);
  return 1 / (1 + ageDays / VIEW_HALF_LIFE_DAYS);
}

/** Words worth matching on; short tokens match too much to be useful. */
function meaningfulTokens(term: string) {
  return normalise(term)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/**
 * Resolve purchased line items to catalogue ids.
 *
 * `productId` is preferred, but POS-created transactions may not carry one and
 * MyanMyanPay orders can synthesise a `stockId` that matches no product, so we
 * fall back to an exact (case-insensitive) name match.
 */
export function resolvePurchasedProductIds(
  purchases: PurchaseSignal[],
  products: Product[],
): Set<string> {
  const byId = new Set(products.map((p) => p.id));
  const byName = new Map<string, string>();
  products.forEach((p) => {
    const name = normalise(String(p.name || ""));
    if (name && !byName.has(name)) byName.set(name, p.id);
  });

  const resolved = new Set<string>();
  purchases.forEach((purchase) => {
    if (purchase.productId && byId.has(purchase.productId)) {
      resolved.add(purchase.productId);
      return;
    }
    const name = normalise(String(purchase.name || ""));
    const match = name ? byName.get(name) : undefined;
    if (match) resolved.add(match);
  });

  return resolved;
}

/**
 * Accumulate how much the shopper appears to like each category.
 * Keys are normalised category names.
 */
export function buildCategoryAffinity(input: {
  products: Product[];
  views: ViewedProduct[];
  purchasedProductIds: Set<string>;
  weights?: ScoreWeights;
}): Map<string, number> {
  const weights = input.weights || DEFAULT_WEIGHTS;
  const affinity = new Map<string, number>();

  const add = (rawCategory: string, amount: number) => {
    const key = normalise(rawCategory);
    if (!key) return;
    affinity.set(key, (affinity.get(key) || 0) + amount);
  };

  // Purchases: look the category up from the catalogue, since transaction line
  // items do not store one.
  const categoryById = new Map(
    input.products.map((p) => [p.id, categoryOf(p)] as const),
  );
  input.purchasedProductIds.forEach((productId) => {
    const category = categoryById.get(productId);
    if (category) add(category, weights.purchasedCategory);
  });

  // Views: prefer the category captured at view time, falling back to the
  // catalogue in case the product has since been recategorised.
  input.views.forEach((view) => {
    const category =
      view.category || categoryById.get(view.productId) || "";
    if (category) {
      add(category, weights.viewedCategory * recencyWeight(view.viewedAt));
    }
  });

  return affinity;
}

export type ScoredProduct = {
  product: Product;
  score: number;
  /** Why this was recommended, for the UI to explain itself. */
  reason: "purchase" | "view" | "search";
};

export type RankInput = {
  products: Product[];
  views: ViewedProduct[];
  searches: SearchedTerm[];
  purchases: PurchaseSignal[];
  /** Omit to rank the whole catalogue and let the caller paginate. */
  limit?: number;
  weights?: ScoreWeights;
};

/**
 * Already-viewed products are demoted rather than removed.
 *
 * A hard exclusion looks right until a category only holds one or two items, at
 * which point the section empties out. Scaling the score down instead keeps
 * undiscovered stock on top while letting a revisit fill the row when there is
 * nothing else to show.
 */
const SEEN_PENALTY = 0.35;

/**
 * Rank the catalogue against a shopper's signals.
 *
 * Products the shopper already bought are dropped outright — re-selling the
 * same garment is not a recommendation. Products they merely viewed are
 * demoted, not dropped.
 *
 * Only positively scored products are returned: with no affinity match this
 * yields an empty list, and the caller hides the section rather than padding it
 * with arbitrary stock.
 */
export function rankRecommendations(input: RankInput): ScoredProduct[] {
  const weights = input.weights || DEFAULT_WEIGHTS;
  const { limit } = input;

  const purchasedIds = resolvePurchasedProductIds(
    input.purchases,
    input.products,
  );
  const viewedIds = new Set(input.views.map((view) => view.productId));

  const affinity = buildCategoryAffinity({
    products: input.products,
    views: input.views,
    purchasedProductIds: purchasedIds,
    weights,
  });

  // Categories the shopper bought from, so we can label the reason.
  const purchasedCategories = new Set<string>();
  input.products.forEach((p) => {
    if (purchasedIds.has(p.id)) {
      const key = normalise(categoryOf(p));
      if (key) purchasedCategories.add(key);
    }
  });

  const searchTokens = input.searches.flatMap((entry) =>
    meaningfulTokens(entry.term),
  );

  const score = (product: Product): ScoredProduct | null => {
    const categoryKey = normalise(categoryOf(product));
    const name = normalise(String(product.name || ""));

    let total = affinity.get(categoryKey) || 0;
    let reason: ScoredProduct["reason"] =
      categoryKey && purchasedCategories.has(categoryKey)
        ? "purchase"
        : "view";

    let searchBonus = 0;
    searchTokens.forEach((token) => {
      if (name.includes(token)) searchBonus += weights.searchNameMatch;
      else if (categoryKey.includes(token)) {
        searchBonus += weights.searchCategoryMatch;
      }
    });

    if (searchBonus > total) reason = "search";
    total += searchBonus;

    if (total <= 0) return null;

    if (product.isNew) total += weights.isNew;

    // Demote things they have already seen, after the zero-check so a seen
    // product with genuine affinity still qualifies.
    if (viewedIds.has(product.id)) total *= SEEN_PENALTY;

    return { product, score: total, reason };
  };

  const ranked = input.products
    .filter((product) => !purchasedIds.has(product.id))
    .map(score)
    .filter((entry): entry is ScoredProduct => entry !== null)
    .sort((a, b) => {
      // Sorted once over the whole list, so an out-of-stock item can never
      // outrank something the shopper could actually buy.
      const aOut = (a.product.stock ?? 0) <= 0;
      const bOut = (b.product.stock ?? 0) <= 0;
      if (aOut !== bOut) return aOut ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      return String(a.product.name || "").localeCompare(
        String(b.product.name || ""),
      );
    });

  return limit === undefined ? ranked : ranked.slice(0, limit);
}
