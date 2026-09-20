/**
 * Bridge shopper vocabulary to the store's own category names.
 *
 * The catalogue uses "Top", "Pants", "Jeans", "Short Skirt" and "One Set", while
 * shoppers ask for "t-shirts", "dresses" and "trousers". Without this mapping a
 * search for "black t-shirts" filters on a category that does not exist and
 * returns nothing.
 *
 * Values are matched case-insensitively as substrings against the product's
 * category, so "skirt" still finds "Short Skirt".
 */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  // Upper body
  "t-shirt": ["top", "t-shirt", "tshirt", "tee"],
  tshirt: ["top", "t-shirt", "tshirt", "tee"],
  tee: ["top", "t-shirt", "tshirt", "tee"],
  shirt: ["top", "shirt", "blouse"],
  blouse: ["top", "blouse"],
  top: ["top"],
  tank: ["top"],
  sweater: ["top", "sweater", "knit"],
  hoodie: ["top", "hoodie", "sweatshirt"],
  sweatshirt: ["top", "sweatshirt", "hoodie"],
  jacket: ["jacket", "coat", "outer"],
  coat: ["coat", "jacket", "outer"],

  // Lower body
  pants: ["pants", "trouser"],
  trousers: ["pants", "trouser"],
  trouser: ["pants", "trouser"],
  jeans: ["jeans", "denim"],
  denim: ["jeans", "denim"],
  shorts: ["shorts", "short"],
  skirt: ["skirt"],

  // Full body
  dress: ["one set", "dress", "skirt"],
  dresses: ["one set", "dress", "skirt"],
  outfit: ["one set"],
  set: ["one set"],
  "one set": ["one set"],
  jumpsuit: ["one set"],
};

/**
 * Candidate category fragments for a shopper's word.
 * Falls back to the word itself so unmapped terms still work.
 */
export function expandCategoryQuery(query: string): string[] {
  const key = query.trim().toLowerCase();
  if (!key) return [];

  return CATEGORY_SYNONYMS[key] ?? [key];
}

/** Does a product's category satisfy the shopper's category word? */
export function categoryMatches(
  productCategory: string | undefined,
  query: string,
): boolean {
  if (!productCategory) return false;

  const haystack = productCategory.toLowerCase();
  return expandCategoryQuery(query).some((candidate) =>
    haystack.includes(candidate),
  );
}
