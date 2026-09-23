import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  Query,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import { variantMatchesColor } from "./colorFamily";
import { categoryMatches } from "./categorySynonyms";

type SizeQuantity = {
  size?: string;
  quantity?: number | string;
};

type ColorVariant = {
  id?: string;
  color?: string;
  colorCode?: string;
  image?: string;
  sizeQuantities?: SizeQuantity[];
};

type FirestoreTimestampLike =
  | { toMillis?: () => number }
  | number
  | string
  | null;

type FirestoreStockDoc = {
  groupName?: string;
  name?: string;
  unitPrice?: number;
  price?: number;
  category?: string;
  description?: string;
  image?: string;
  groupImage?: string;
  colorVariants?: ColorVariant[];
  stock?: number;
  createdAt?: FirestoreTimestampLike;
  shop?: string;
  shopId?: string;
  branch?: string;
  isNew?: boolean;
  [key: string]: unknown;
};

export type SearchProduct = {
  id: string;
  /**
   * Lowercased name, used for the case-insensitive keyword and category
   * matching below. Not for display — use `displayName`.
   */
  name: string;
  /** Name exactly as the owner entered it in the POS. Use this in any UI. */
  displayName: string;
  price: number;
  description?: string;
  category?: string;
  image?: string;
  groupImage?: string;
  colorVariants?: ColorVariant[];
  stock: number;
  colors?: string[];
  isNew?: boolean;
};

export type SearchFilters = {
  keyword?: string;
  category?: string;
  color?: string;
  size?: string; // e.g., "M", "XL" — matched against variant size quantities
  minPrice?: number;
  maxPrice?: number;
  style?: string; // e.g., "oversized", "slim fit"
  inStock?: boolean;
  branch?: string; // Filter by branch ID
  isNew?: boolean; // Filter for new arrivals
};

const NEW_DAYS = Number(process?.env?.NEXT_PUBLIC_NEW_ITEM_DAYS) || 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isNewItem(createdAt: FirestoreTimestampLike): boolean {
  try {
    let createdMs = Date.now();
    if (createdAt) {
      if (
        typeof createdAt === "object" &&
        createdAt !== null &&
        "toMillis" in createdAt &&
        typeof (createdAt as { toMillis?: unknown }).toMillis === "function"
      ) {
        createdMs = (createdAt as { toMillis: () => number }).toMillis();
      } else if (typeof createdAt === "number") {
        createdMs = createdAt;
      } else {
        createdMs = new Date(String(createdAt)).getTime();
      }
    }
    return Date.now() - createdMs <= NEW_DAYS * MS_PER_DAY;
  } catch {
    return false;
  }
}

function getStockFromVariants(colorVariants: ColorVariant[] = []): number {
  return Array.isArray(colorVariants)
    ? colorVariants.reduce(
        (total: number, v: ColorVariant) =>
          total +
          (v.sizeQuantities || []).reduce(
            (t: number, s: SizeQuantity) => t + (Number(s.quantity) || 0),
            0,
          ),
        0,
      )
    : 0;
}

function mapStockDocToSearchProduct(
  id: string,
  data: FirestoreStockDoc,
): SearchProduct {
  const colorVariants = (data.colorVariants as ColorVariant[]) || [];
  const stockFromVariants = getStockFromVariants(colorVariants);
  const colors = colorVariants
    .map((v) => v.color)
    .filter((c): c is string => !!c);

  // Keep both casings: everything downstream matches on the lowercased form,
  // but showing a customer "w9939" when the catalogue says "W9939" looks broken.
  const rawName = String(data.groupName || data.name || "").trim();

  return {
    id,
    name: rawName.toLowerCase(),
    displayName: rawName,
    price: typeof data.unitPrice === "number" ? data.unitPrice : data.price || 0,
    description: (data.description || "").toLowerCase(),
    category: (data.category || "").toLowerCase(),
    image: data.colorVariants?.[0]?.image || data.image || data.groupImage,
    groupImage: data.groupImage,
    colorVariants,
    stock: data.stock || stockFromVariants || 0,
    colors: colors.map((c) => c.toLowerCase()),
    isNew: isNewItem(data.createdAt || null),
  };
}

/**
 * Search products with flexible filters
 */
export async function searchProducts(
  filters: SearchFilters,
): Promise<SearchProduct[]> {
  if (!db) {
    throw new Error("Firebase not configured");
  }

  try {
    // Fetch all products
    const q = query(collection(db, "stocks"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    // Map documents to products and keep reference to original data for filtering
    const productsWithDocs = snap.docs.map((d) => ({
      product: mapStockDocToSearchProduct(d.id, d.data() as FirestoreStockDoc),
      docData: d.data() as FirestoreStockDoc,
    }));

    // Filter by branch if specified (uses 'shop' field in database)
    let filteredProductsWithDocs = productsWithDocs;
    if (filters.branch) {
      filteredProductsWithDocs = productsWithDocs.filter(
        (item) => item.docData.shop === filters.branch
      );
      console.log(`🏪 Filtered by shop/branch: ${filters.branch}, found ${filteredProductsWithDocs.length} products`);
    }

    // Extract just the products
    let products = filteredProductsWithDocs.map((item) => item.product);

    // Remove duplicates by grouping by name (products with multiple colors)
    const uniqueProducts = new Map<string, SearchProduct>();
    for (const product of products) {
      const productName = product.name;
      if (!uniqueProducts.has(productName)) {
        uniqueProducts.set(productName, product);
      } else {
        // If duplicate exists, combine stock and colors
        const existing = uniqueProducts.get(productName)!;
        existing.stock += product.stock;
        if (product.colors) {
          existing.colors = [...new Set([...(existing.colors || []), ...product.colors])];
        }
        if (product.colorVariants) {
          existing.colorVariants = [...(existing.colorVariants || []), ...(product.colorVariants || [])];
        }
        // Preserve isNew flag if any variant is new
        if (product.isNew) {
          existing.isNew = true;
        }
      }
    }
    
    products = Array.from(uniqueProducts.values());
    
    // Debug: Log isNew status when filtering for new products
    if (filters.isNew) {
      console.log(`🔍 Products before isNew filter: ${products.length}`);
      console.log(`🔍 Sample products with isNew:`, products.slice(0, 3).map(p => ({ name: p.name, isNew: p.isNew })));
    }

    // Apply filters
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.includes(keyword) ||
          p.description?.includes(keyword) ||
          p.category?.includes(keyword),
      );
    }

    if (filters.category) {
      const category = filters.category.toLowerCase();
      // Shoppers say "t-shirt" while the catalogue says "Top", so expand the
      // term to the store's own category names before matching.
      products = products.filter(
        (p) =>
          categoryMatches(p.category, category) ||
          p.name.includes(category) ||
          p.description?.includes(category),
      );
    }

    if (filters.color) {
      const color = filters.color.toLowerCase();
      // Colour names in the catalogue are paint-chart style ("Gun Powder"), so
      // fall back to classifying each variant's hex into a basic colour family.
      products = products.filter((p) => {
        const variantMatch = (p.colorVariants || []).some((variant) =>
          variantMatchesColor(variant.color, variant.colorCode, color),
        );

        return (
          variantMatch ||
          p.colors?.some((c) => c.includes(color)) ||
          p.name.includes(color) ||
          p.description?.includes(color)
        );
      });
    }

    if (filters.style) {
      const style = filters.style.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.includes(style) ||
          p.description?.includes(style) ||
          p.category?.includes(style),
      );
    }

    if (filters.minPrice !== undefined) {
      products = products.filter((p) => p.price >= filters.minPrice!);
    }

    if (filters.maxPrice !== undefined) {
      products = products.filter((p) => p.price <= filters.maxPrice!);
    }

    // Size is held per colour variant, so check the variant stock rather than
    // the product name. Respects inStock: without it, any listed size matches.
    if (filters.size) {
      const wanted = filters.size.toUpperCase().trim();
      products = products.filter((p) =>
        (p.colorVariants || []).some((variant) =>
          (variant.sizeQuantities || []).some(
            (sq) =>
              String(sq.size).toUpperCase().trim() === wanted &&
              (filters.inStock ? Number(sq.quantity) > 0 : true),
          ),
        ),
      );
    }

    if (filters.inStock) {
      products = products.filter((p) => p.stock > 0);
    }

    if (filters.isNew) {
      products = products.filter((p: any) => p.isNew === true || p.isNew === 'true' || p.isNew === 1);
      console.log(`🔍 Products after isNew filter: ${products.length}`);
    }

    return products;
  } catch (error) {
    console.error("Error searching products:", error);
    throw error;
  }
}

/**
 * Extract search filters from natural language query
 * This is a simple keyword-based approach
 */
export function extractFiltersFromQuery(query: string): SearchFilters {
  const lowerQuery = query.toLowerCase();
  const filters: SearchFilters = { inStock: true };

  // Extract price range
  const priceMatch = lowerQuery.match(
    /(?:under|below|less than|<)\s*(\d+(?:,\d+)*)\s*(?:mmk|kyat)?/i,
  );
  if (priceMatch) {
    filters.maxPrice = parseInt(priceMatch[1].replace(/,/g, ""));
  }

  const minPriceMatch = lowerQuery.match(
    /(?:above|over|more than|>)\s*(\d+(?:,\d+)*)\s*(?:mmk|kyat)?/i,
  );
  if (minPriceMatch) {
    filters.minPrice = parseInt(minPriceMatch[1].replace(/,/g, ""));
  }

  // Price range
  const rangeMatch = lowerQuery.match(
    /(\d+(?:,\d+)*)\s*(?:to|-)\s*(\d+(?:,\d+)*)\s*(?:mmk|kyat)?/i,
  );
  if (rangeMatch) {
    filters.minPrice = parseInt(rangeMatch[1].replace(/,/g, ""));
    filters.maxPrice = parseInt(rangeMatch[2].replace(/,/g, ""));
  }

  // Extract colors
  const colors = [
    "black",
    "white",
    "red",
    "blue",
    "green",
    "yellow",
    "pink",
    "purple",
    "orange",
    "brown",
    "gray",
    "grey",
    "navy",
    "beige",
    "cream",
    "khaki",
  ];
  for (const color of colors) {
    if (lowerQuery.includes(color)) {
      filters.color = color;
      break;
    }
  }

  // Extract categories/product types
  const categories = [
    "t-shirt",
    "tshirt",
    "shirt",
    "jeans",
    "pants",
    "dress",
    "skirt",
    "jacket",
    "coat",
    "sweater",
    "hoodie",
    "shorts",
    "shoes",
    "bag",
    "accessory",
    "accessories",
  ];
  for (const category of categories) {
    if (lowerQuery.includes(category)) {
      filters.category = category;
      break;
    }
  }

  // Extract styles
  const styles = ["oversized", "slim", "fitted", "loose", "casual", "formal"];
  for (const style of styles) {
    if (lowerQuery.includes(style)) {
      filters.style = style;
      break;
    }
  }

  // Extract size. Bare "s"/"m"/"l" are far too ambiguous in a sentence, so
  // those only count when written as "size M". Distinctive tokens like XL are
  // safe on their own. Note "oversized" cannot match: there is no word boundary
  // before its "size".
  const explicitSize = lowerQuery.match(
    /\bsize\s*[:\-]?\s*(xxxl|xxl|xl|xs|s|m|l)\b/i,
  );
  const standaloneSize = lowerQuery.match(/\b(xxxl|xxl|xl|xs)\b/i);
  const sizeToken = explicitSize?.[1] || standaloneSize?.[1];
  if (sizeToken) {
    filters.size = sizeToken.toUpperCase();
  }

  // If no specific filters, use the query as keyword
  if (
    !filters.color &&
    !filters.category &&
    !filters.style &&
    !filters.size &&
    !filters.minPrice &&
    !filters.maxPrice
  ) {
    // Remove common words
    const cleanQuery = query
      .replace(/\b(show me|find|search|looking for|want|need|i want|do you have)\b/gi, "")
      .trim();
    if (cleanQuery) {
      filters.keyword = cleanQuery;
    }
  }

  return filters;
}
