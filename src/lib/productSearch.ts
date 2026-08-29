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
  [key: string]: unknown;
};

export type SearchProduct = {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
  image?: string;
  groupImage?: string;
  colorVariants?: ColorVariant[];
  stock: number;
  colors?: string[];
};

export type SearchFilters = {
  keyword?: string;
  category?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  style?: string; // e.g., "oversized", "slim fit"
  inStock?: boolean;
};

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

  return {
    id,
    name: (data.groupName || data.name || "").toLowerCase(),
    price: typeof data.unitPrice === "number" ? data.unitPrice : data.price || 0,
    description: (data.description || "").toLowerCase(),
    category: (data.category || "").toLowerCase(),
    image: data.colorVariants?.[0]?.image || data.image || data.groupImage,
    groupImage: data.groupImage,
    colorVariants,
    stock: data.stock || stockFromVariants || 0,
    colors: colors.map((c) => c.toLowerCase()),
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

    let products = snap.docs.map((d) =>
      mapStockDocToSearchProduct(d.id, d.data() as FirestoreStockDoc),
    );

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
      products = products.filter(
        (p) =>
          p.category?.includes(category) ||
          p.name.includes(category) ||
          p.description?.includes(category),
      );
    }

    if (filters.color) {
      const color = filters.color.toLowerCase();
      products = products.filter(
        (p) =>
          p.colors?.some((c) => c.includes(color)) ||
          p.name.includes(color) ||
          p.description?.includes(color),
      );
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

    if (filters.inStock) {
      products = products.filter((p) => p.stock > 0);
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

  // If no specific filters, use the query as keyword
  if (
    !filters.color &&
    !filters.category &&
    !filters.style &&
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
