import { db } from "./firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

interface SizeQuantity {
  size: string;
  quantity: number;
}

interface ColorVariant {
  id: string;
  color: string;
  colorCode?: string;
  image?: string;
  sizeQuantities: SizeQuantity[];
}

export interface ProductInfo {
  id: string;
  name: string;
  groupName?: string;
  price: number;
  category?: string;
  description?: string;
  material?: string;
  image?: string;
  colorVariants: ColorVariant[];
  availableColors: string[];
  availableSizes: string[];
  totalStock: number;
  stockByColor: Record<string, number>;
  stockBySize: Record<string, number>;
}

/**
 * Get detailed product information by ID
 */
export async function getProductById(
  productId: string
): Promise<ProductInfo | null> {
  if (!db) {
    console.error("❌ Firebase not configured");
    return null;
  }

  try {
    const docRef = doc(db, "stocks", productId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return parseProductData(productId, data);
  } catch (error) {
    console.error("Error fetching product:", error);
    return null;
  }
}

/**
 * Search for a product by name
 */
export async function findProductByName(
  productName: string
): Promise<ProductInfo | null> {
  if (!db) {
    console.error("❌ Firebase not configured");
    return null;
  }

  try {
    const querySnapshot = await getDocs(collection(db, "stocks"));
    const searchTerm = productName.toLowerCase().trim();

    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      const name = (data.groupName || data.name || "").toLowerCase();

      if (name.includes(searchTerm) || searchTerm.includes(name)) {
        return parseProductData(doc.id, data);
      }
    }

    return null;
  } catch (error) {
    console.error("Error searching product:", error);
    return null;
  }
}

/**
 * Parse product data from Firestore
 */
function parseProductData(id: string, data: any): ProductInfo {
  const colorVariants: ColorVariant[] = (data.colorVariants || []).map(
    (v: any) => ({
      id: v.id || "",
      color: v.color || "",
      colorCode: v.colorCode || "",
      image: v.image || "",
      sizeQuantities: (v.sizeQuantities || []).map((sq: any) => ({
        size: sq.size || "",
        quantity: Number(sq.quantity) || 0,
      })),
    })
  );

  // Extract available colors (with stock > 0)
  const availableColors: string[] = [];
  colorVariants.forEach((variant) => {
    const hasStock = variant.sizeQuantities.some((sq) => sq.quantity > 0);
    if (hasStock && variant.color && !availableColors.includes(variant.color)) {
      availableColors.push(variant.color);
    }
  });

  // Extract available sizes (with stock > 0)
  const availableSizes: string[] = [];
  const stockBySize: Record<string, number> = {};

  colorVariants.forEach((variant) => {
    variant.sizeQuantities.forEach((sq) => {
      if (sq.quantity > 0) {
        if (!availableSizes.includes(sq.size)) {
          availableSizes.push(sq.size);
        }
        stockBySize[sq.size] = (stockBySize[sq.size] || 0) + sq.quantity;
      }
    });
  });

  // Calculate stock by color
  const stockByColor: Record<string, number> = {};
  colorVariants.forEach((variant) => {
    const colorStock = variant.sizeQuantities.reduce(
      (sum, sq) => sum + sq.quantity,
      0
    );
    if (colorStock > 0 && variant.color) {
      stockByColor[variant.color] = colorStock;
    }
  });

  // Calculate total stock
  const totalStock = Object.values(stockBySize).reduce(
    (sum, qty) => sum + qty,
    0
  );

  return {
    id,
    name: data.groupName || data.name || "",
    groupName: data.groupName,
    price: data.unitPrice || data.price || 0,
    category: data.category || "",
    description: data.description || "",
    material: data.material || "",
    image:
      colorVariants[0]?.image || data.image || data.groupImage || "",
    colorVariants,
    availableColors,
    availableSizes: availableSizes.sort(),
    totalStock,
    stockByColor,
    stockBySize,
  };
}

/**
 * Check if a specific size is available for a product
 */
export function isSizeAvailable(
  product: ProductInfo,
  size: string,
  color?: string
): { available: boolean; quantity: number; colors?: string[] } {
  const normalizedSize = size.toUpperCase().trim();

  if (color) {
    // Check specific color
    const normalizedColor = color.toLowerCase().trim();
    const variant = product.colorVariants.find(
      (v) => v.color.toLowerCase() === normalizedColor
    );

    if (variant) {
      const sizeQty = variant.sizeQuantities.find(
        (sq) => sq.size.toUpperCase() === normalizedSize
      );
      return {
        available: sizeQty ? sizeQty.quantity > 0 : false,
        quantity: sizeQty?.quantity || 0,
      };
    }

    return { available: false, quantity: 0 };
  }

  // Check across all colors
  let totalQuantity = 0;
  const availableColors: string[] = [];

  product.colorVariants.forEach((variant) => {
    const sizeQty = variant.sizeQuantities.find(
      (sq) => sq.size.toUpperCase() === normalizedSize
    );
    if (sizeQty && sizeQty.quantity > 0) {
      totalQuantity += sizeQty.quantity;
      availableColors.push(variant.color);
    }
  });

  return {
    available: totalQuantity > 0,
    quantity: totalQuantity,
    colors: availableColors,
  };
}

/**
 * Check if a specific color is available
 */
export function isColorAvailable(
  product: ProductInfo,
  color: string
): { available: boolean; quantity: number; sizes?: string[] } {
  const normalizedColor = color.toLowerCase().trim();
  const variant = product.colorVariants.find(
    (v) => v.color.toLowerCase() === normalizedColor
  );

  if (!variant) {
    return { available: false, quantity: 0 };
  }

  const totalQuantity = variant.sizeQuantities.reduce(
    (sum, sq) => sum + sq.quantity,
    0
  );

  const availableSizes = variant.sizeQuantities
    .filter((sq) => sq.quantity > 0)
    .map((sq) => sq.size);

  return {
    available: totalQuantity > 0,
    quantity: totalQuantity,
    sizes: availableSizes,
  };
}

/**
 * Format product info as text for AI response
 */
export function formatProductInfo(product: ProductInfo): string {
  const parts: string[] = [];

  // Name and price
  parts.push(
    `📦 **${product.name}**\n💰 Price: ${new Intl.NumberFormat("en-US").format(product.price)} MMK`
  );

  // Category
  if (product.category) {
    parts.push(`📂 Category: ${product.category}`);
  }

  // Available colors - ALWAYS show if any exist
  if (product.availableColors.length > 0) {
    parts.push(`🎨 Available Colors: ${product.availableColors.join(", ")}`);
  } else if (product.colorVariants.length > 0) {
    // Fallback: show colors from variants even if not in availableColors
    const colors = product.colorVariants
      .map(v => v.color)
      .filter(c => c)
      .join(", ");
    if (colors) {
      parts.push(`🎨 Available Colors: ${colors}`);
    }
  }

  // Available sizes
  if (product.availableSizes.length > 0) {
    parts.push(`📏 Available Sizes: ${product.availableSizes.join(", ")}`);
  }

  // Material
  if (product.material) {
    parts.push(`🧵 Material: ${product.material}`);
  }

  // Stock
  parts.push(`📊 Total Stock: ${product.totalStock} units`);

  // Description
  if (product.description) {
    parts.push(`\n📝 Description: ${product.description}`);
  }

  return parts.join("\n");
}

/**
 * Detect if user is asking about specific product details
 */
export function isProductInfoQuery(message: string): {
  isQuery: boolean;
  queryType?: "size" | "color" | "price" | "material" | "stock" | "general";
  extractedInfo?: {
    size?: string;
    color?: string;
    productName?: string;
  };
} {
  const lowerMessage = message.toLowerCase();

  // Size queries
  const sizeKeywords = [
    "size",
    "xl",
    "xxl",
    "large",
    "medium",
    "small",
    "xs",
    "s",
    "m",
    "l",
  ];
  const sizeMatch = sizeKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  // Color queries
  const colorKeywords = [
    "color",
    "colour",
    "black",
    "white",
    "red",
    "blue",
    "green",
    "yellow",
    "pink",
    "purple",
  ];
  const colorMatch = colorKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  // Price queries
  const priceMatch =
    lowerMessage.includes("price") ||
    lowerMessage.includes("cost") ||
    lowerMessage.includes("how much");

  // Material queries
  const materialMatch =
    lowerMessage.includes("material") ||
    lowerMessage.includes("fabric") ||
    lowerMessage.includes("made of");

  // Stock queries
  const stockMatch =
    lowerMessage.includes("stock") ||
    lowerMessage.includes("available") ||
    lowerMessage.includes("in stock") ||
    lowerMessage.includes("do you have");

  const isQuery =
    sizeMatch || colorMatch || priceMatch || materialMatch || stockMatch;

  if (!isQuery) {
    return { isQuery: false };
  }

  // Determine query type
  let queryType: "size" | "color" | "price" | "material" | "stock" | "general" =
    "general";
  if (sizeMatch) queryType = "size";
  else if (colorMatch) queryType = "color";
  else if (priceMatch) queryType = "price";
  else if (materialMatch) queryType = "material";
  else if (stockMatch) queryType = "stock";

  // Extract size
  const sizeRegex = /\b(xs|s|m|l|xl|xxl|xxxl|\d+)\b/i;
  const sizeExact = lowerMessage.match(sizeRegex);
  const extractedSize = sizeExact ? sizeExact[1].toUpperCase() : undefined;

  // Extract color
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
  ];
  const extractedColor = colors.find((c) => lowerMessage.includes(c));

  return {
    isQuery: true,
    queryType,
    extractedInfo: {
      size: extractedSize,
      color: extractedColor,
    },
  };
}
