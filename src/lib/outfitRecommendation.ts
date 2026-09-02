import { db } from "./firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  colors: string[];
  stock: number;
  image?: string;
  style?: string;
}

interface OutfitRecommendation {
  occasion: string;
  description: string;
  items: {
    category: string;
    product: Product;
  }[];
  totalPrice: number;
  tips?: string[];
}

// Color matching logic
const colorMatches: Record<string, string[]> = {
  black: ["white", "gray", "red", "blue", "beige", "cream"],
  white: ["black", "navy", "blue", "red", "green", "brown", "gray"],
  blue: ["white", "beige", "brown", "gray", "navy", "cream"],
  navy: ["white", "beige", "cream", "brown", "gray"],
  gray: ["white", "black", "navy", "blue", "pink", "yellow"],
  brown: ["beige", "white", "cream", "tan", "navy"],
  beige: ["white", "brown", "navy", "black", "cream"],
  red: ["black", "white", "navy", "gray", "beige"],
  green: ["white", "beige", "brown", "navy", "cream"],
  pink: ["white", "gray", "navy", "beige"],
  yellow: ["white", "navy", "gray", "blue"],
};

// Style matching for occasions
const occasionStyles: Record<
  string,
  {
    categories: string[];
    styles: string[];
    colors: string[];
    tips: string[];
  }
> = {
  casual: {
    categories: ["t-shirt", "jeans", "shirt", "pants", "sneakers"],
    styles: ["casual", "relaxed", "everyday"],
    colors: ["blue", "black", "white", "gray", "beige"],
    tips: [
      "Mix comfort with style",
      "Keep it simple and clean",
      "Neutral colors work best",
    ],
  },
  date: {
    categories: ["shirt", "pants", "dress", "jeans", "shoes"],
    styles: ["smart-casual", "elegant", "stylish"],
    colors: ["black", "navy", "white", "burgundy", "gray"],
    tips: [
      "Choose well-fitted pieces",
      "Add a touch of elegance",
      "Confidence is key",
    ],
  },
  formal: {
    categories: ["shirt", "pants", "blazer", "dress", "shoes"],
    styles: ["formal", "business", "elegant", "professional"],
    colors: ["black", "navy", "white", "gray", "charcoal"],
    tips: [
      "Stick to classic colors",
      "Ensure proper fit",
      "Pay attention to details",
    ],
  },
  party: {
    categories: ["dress", "shirt", "pants", "skirt", "heels"],
    styles: ["trendy", "stylish", "fashionable", "bold"],
    colors: ["red", "black", "gold", "silver", "burgundy"],
    tips: [
      "Don't be afraid to stand out",
      "Comfort matters for dancing",
      "Accessorize wisely",
    ],
  },
  business: {
    categories: ["shirt", "pants", "blazer", "dress", "shoes"],
    styles: ["business", "professional", "formal", "corporate"],
    colors: ["navy", "black", "white", "gray", "charcoal"],
    tips: [
      "Professional appearance matters",
      "Choose quality fabrics",
      "Keep it conservative",
    ],
  },
  workout: {
    categories: ["t-shirt", "pants", "shorts", "sports-bra", "sneakers"],
    styles: ["athletic", "sportswear", "active"],
    colors: ["black", "gray", "navy", "blue", "white"],
    tips: [
      "Choose breathable fabrics",
      "Comfort and mobility first",
      "Moisture-wicking is essential",
    ],
  },
};

/**
 * Get all available products from Firebase
 */
async function getAllProducts(branchFilter?: string): Promise<Product[]> {
  if (!db) {
    console.error("❌ Firebase DB not initialized");
    return [];
  }

  try {
    const stocksRef = collection(db, "stocks");
    const querySnapshot = await getDocs(stocksRef);

    const products: Product[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Filter by branch if specified (uses 'shop' field in database)
      if (branchFilter && data.shop !== branchFilter) {
        return; // Skip this product
      }
      
      // Extract colors from colorVariants
      const colorVariants = data.colorVariants || [];
      const colors = colorVariants
        .map((v: any) => v.color)
        .filter((c: any) => c)
        .map((c: string) => c.toLowerCase());
      
      // Calculate total stock from colorVariants
      let totalStock = 0;
      if (Array.isArray(colorVariants)) {
        colorVariants.forEach((variant: any) => {
          if (Array.isArray(variant.sizeQuantities)) {
            variant.sizeQuantities.forEach((sq: any) => {
              totalStock += Number(sq.quantity) || 0;
            });
          }
        });
      }
      
      // Fallback to stock field if available
      if (totalStock === 0 && data.stock) {
        totalStock = data.stock;
      }
      
      // Only include products with stock
      if (totalStock > 0) {
        products.push({
          id: doc.id,
          name: (data.groupName || data.name || "").toLowerCase(),
          price: data.unitPrice || data.price || 0,
          category: (data.category || "").toLowerCase(),
          colors: colors,
          stock: totalStock,
          image: colorVariants[0]?.image || data.image || data.groupImage || "",
          style: (data.style || "").toLowerCase(),
        });
      }
    });

    console.log(`📦 Fetched ${products.length} products with stock${branchFilter ? ` for branch: ${branchFilter}` : ''}`);
    if (products.length > 0) {
      console.log(`Sample product:`, {
        name: products[0].name,
        category: products[0].category,
        colors: products[0].colors,
        price: products[0].price
      });
    }

    return products;
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    return [];
  }
}

/**
 * Check if two colors match well together
 */
function doColorsMatch(color1: string, color2: string): boolean {
  const c1 = color1.toLowerCase();
  const c2 = color2.toLowerCase();

  // Same color always matches
  if (c1 === c2) return true;

  // Check color matching dictionary
  if (colorMatches[c1]?.includes(c2)) return true;
  if (colorMatches[c2]?.includes(c1)) return true;

  return false;
}

/**
 * Find matching products for a given color
 */
function findMatchingColorProducts(
  products: Product[],
  baseColor: string,
  excludeCategories: string[] = []
): Product[] {
  return products.filter((product) => {
    // Skip if category should be excluded
    if (excludeCategories.includes(product.category)) return false;

    // Check if any of the product's colors match with the base color
    return product.colors.some((color) => doColorsMatch(baseColor, color));
  });
}

/**
 * Generate outfit recommendation based on occasion
 */
export async function generateOutfitRecommendation(
  occasion: string,
  maxBudget?: number,
  branchFilter?: string
): Promise<OutfitRecommendation | null> {
  const occasionKey = occasion.toLowerCase();
  const occasionConfig = occasionStyles[occasionKey];

  if (!occasionConfig) {
    console.log(
      `Unknown occasion: ${occasion}. Available: ${Object.keys(occasionStyles).join(", ")}`
    );
    return null;
  }

  console.log(`🎯 Generating outfit for: ${occasion}${branchFilter ? ` (branch: ${branchFilter})` : ''}`);

  // Get all available products
  const allProducts = await getAllProducts(branchFilter);
  console.log(`📦 Total products available: ${allProducts.length}`);

  if (allProducts.length === 0) {
    return null;
  }

  // Filter products by occasion preferences
  const relevantProducts = allProducts.filter((product) => {
    // More flexible category matching
    const categoryMatch = occasionConfig.categories.some(cat => 
      product.category?.includes(cat) || 
      product.name.includes(cat)
    );
    
    // More flexible color matching - if no colors defined, include it
    const hasColors = product.colors && product.colors.length > 0;
    const colorMatch = !hasColors || occasionConfig.colors.some((color) =>
      product.colors.some(pc => 
        pc.includes(color) || 
        color.includes(pc) ||
        pc === color
      )
    );
    
    return categoryMatch || colorMatch; // OR instead of AND for more results
  });

  console.log(
    `🎨 Products matching occasion: ${relevantProducts.length}`
  );

  // If no specific matches, use all products
  if (relevantProducts.length === 0) {
    console.log("⚠️ No occasion-specific products found, using all products");
    relevantProducts.push(...allProducts);
  }

  if (relevantProducts.length === 0) {
    console.log("❌ No products available at all");
    return null;
  }

  // Build outfit by selecting items from different categories
  const outfitItems: { category: string; product: Product }[] = [];
  const usedCategories = new Set<string>();
  let totalPrice = 0;

  // Priority order for selecting items (top first)
  const categoryPriority = ["shirt", "dress", "t-shirt", "pants", "jeans", "jacket", "blazer", "shoes", "sneakers"];

  // Select base item (shirt/dress/t-shirt)
  const baseCategories = ["shirt", "dress", "t-shirt", "tshirt", "top", "blouse"];
  const baseProducts = relevantProducts.filter((p) =>
    baseCategories.some(cat => 
      p.category?.includes(cat) || 
      p.name.includes(cat)
    )
  );

  // If no base products, just use first few products
  if (baseProducts.length === 0) {
    console.log("⚠️ No base category products, using any products");
    baseProducts.push(...relevantProducts.slice(0, 3));
  }

  if (baseProducts.length > 0) {
    // Pick a random base product
    const baseProduct =
      baseProducts[Math.floor(Math.random() * baseProducts.length)];
    outfitItems.push({ category: "Top", product: baseProduct });
    usedCategories.add(baseProduct.category);
    totalPrice += baseProduct.price;

    console.log(
      `👕 Selected base: ${baseProduct.name} (${baseProduct.colors.join(", ")})`
    );

    // Find matching bottom (pants/jeans/skirt) if base is not a dress
    if (!baseProduct.category?.includes("dress") && !baseProduct.name.includes("dress")) {
      const bottomCategories = ["pants", "jeans", "jean", "skirt", "short", "trouser"];
      const baseColor = baseProduct.colors[0] || "black";

      const matchingBottoms = relevantProducts.filter(
        (p) =>
          bottomCategories.some(cat => 
            p.category?.includes(cat) || 
            p.name.includes(cat)
          ) &&
          !usedCategories.has(p.category) &&
          p.id !== baseProduct.id && // Don't select same product
          (p.colors.length === 0 || p.colors.some((color) => doColorsMatch(baseColor, color)))
      );

      if (matchingBottoms.length > 0) {
        const bottomProduct =
          matchingBottoms[Math.floor(Math.random() * matchingBottoms.length)];
        
        // Check budget
        if (!maxBudget || totalPrice + bottomProduct.price <= maxBudget) {
          outfitItems.push({ category: "Bottom", product: bottomProduct });
          usedCategories.add(bottomProduct.category);
          totalPrice += bottomProduct.price;
          console.log(
            `👖 Selected bottom: ${bottomProduct.name} (${bottomProduct.colors.join(", ")})`
          );
        }
      }
    }

    // Find matching shoes/accessories
    const shoeCategories = ["shoes", "shoe", "sneakers", "sneaker", "heels", "heel", "boots", "boot", "sandal"];
    const outfitColors = outfitItems.flatMap((item) => item.product.colors);

    const matchingShoes = relevantProducts.filter(
      (p) =>
        shoeCategories.some(cat => 
          p.category?.includes(cat) || 
          p.name.includes(cat)
        ) &&
        !usedCategories.has(p.category) &&
        p.id !== baseProduct.id &&
        (p.colors.length === 0 || p.colors.some((color) =>
          outfitColors.length === 0 || outfitColors.some((oc) => doColorsMatch(oc, color))
        ))
    );

    if (matchingShoes.length > 0) {
      const shoeProduct =
        matchingShoes[Math.floor(Math.random() * matchingShoes.length)];
      
      // Check budget
      if (!maxBudget || totalPrice + shoeProduct.price <= maxBudget) {
        outfitItems.push({ category: "Footwear", product: shoeProduct });
        usedCategories.add(shoeProduct.category);
        totalPrice += shoeProduct.price;
        console.log(
          `👞 Selected shoes: ${shoeProduct.name} (${shoeProduct.colors.join(", ")})`
        );
      }
    }

    // Optional: Add jacket/blazer for formal/business occasions
    if (["formal", "business"].includes(occasionKey)) {
      const jacketCategories = ["jacket", "blazer"];
      const matchingJackets = relevantProducts.filter(
        (p) =>
          jacketCategories.includes(p.category) &&
          !usedCategories.has(p.category) &&
          p.colors.some((color) =>
            outfitColors.some((oc) => doColorsMatch(oc, color))
          )
      );

      if (matchingJackets.length > 0) {
        const jacketProduct =
          matchingJackets[Math.floor(Math.random() * matchingJackets.length)];
        
        // Check budget
        if (!maxBudget || totalPrice + jacketProduct.price <= maxBudget) {
          outfitItems.push({ category: "Outerwear", product: jacketProduct });
          usedCategories.add(jacketProduct.category);
          totalPrice += jacketProduct.price;
          console.log(
            `🧥 Selected jacket: ${jacketProduct.name} (${jacketProduct.colors.join(", ")})`
          );
        }
      }
    }
  }

  if (outfitItems.length === 0) {
    return null;
  }

  const recommendation: OutfitRecommendation = {
    occasion: occasion.charAt(0).toUpperCase() + occasion.slice(1),
    description: `A complete ${occasion} outfit that's perfect for the occasion.`,
    items: outfitItems,
    totalPrice: totalPrice,
    tips: occasionConfig.tips,
  };

  console.log(
    `✅ Generated outfit with ${outfitItems.length} items, total: ${totalPrice} MMK`
  );

  return recommendation;
}

/**
 * Detect if user message is asking for outfit recommendation
 */
export function isOutfitRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  const outfitKeywords = [
    "outfit",
    "complete look",
    "what should i wear",
    "help me dress",
    "clothing combination",
    "match",
    "coordinate",
    "pair with",
  ];

  const occasionKeywords = Object.keys(occasionStyles);

  return (
    outfitKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
    (occasionKeywords.some((keyword) => lowerMessage.includes(keyword)) &&
      (lowerMessage.includes("for") || lowerMessage.includes("wear")))
  );
}

/**
 * Extract occasion from user message
 */
export function extractOccasion(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  const occasions = Object.keys(occasionStyles);

  for (const occasion of occasions) {
    if (lowerMessage.includes(occasion)) {
      return occasion;
    }
  }

  // Default mappings
  if (
    lowerMessage.includes("work") ||
    lowerMessage.includes("office") ||
    lowerMessage.includes("meeting")
  ) {
    return "business";
  }

  if (
    lowerMessage.includes("night out") ||
    lowerMessage.includes("club") ||
    lowerMessage.includes("celebration")
  ) {
    return "party";
  }

  if (
    lowerMessage.includes("hang out") ||
    lowerMessage.includes("weekend") ||
    lowerMessage.includes("everyday")
  ) {
    return "casual";
  }

  if (
    lowerMessage.includes("wedding") ||
    lowerMessage.includes("ceremony") ||
    lowerMessage.includes("gala")
  ) {
    return "formal";
  }

  if (lowerMessage.includes("gym") || lowerMessage.includes("exercise")) {
    return "workout";
  }

  return null;
}

/**
 * Extract budget from user message
 */
export function extractBudget(message: string): number | undefined {
  const budgetMatch = message.match(
    /(?:under|below|max|budget|up to)\s+(\d+(?:,\d+)*)/i
  );
  if (budgetMatch) {
    return parseInt(budgetMatch[1].replace(/,/g, ""));
  }
  return undefined;
}
