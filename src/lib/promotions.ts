/**
 * Promotions and Special Offers System
 */

export interface Promotion {
  id: string;
  title: string;
  description: string;
  type: "discount" | "flash_sale" | "coupon" | "new_arrival" | "special";
  discountPercent?: number;
  couponCode?: string;
  validUntil?: Date;
  minPurchase?: number;
  categories?: string[];
  isActive: boolean;
}

// Active promotions (you can move this to Firebase later)
export const ACTIVE_PROMOTIONS: Promotion[] = [
  {
    id: "new-arrival-2024",
    title: "🆕 New Arrivals Collection",
    description:
      "Check out our latest fashion pieces! Fresh styles added every week.",
    type: "new_arrival",
    isActive: true,
  },
  {
    id: "weekend-sale",
    title: "🎉 Weekend Flash Sale",
    description: "Get 20% off on selected items this weekend only!",
    type: "flash_sale",
    discountPercent: 20,
    validUntil: new Date("2026-12-31"),
    isActive: true,
  },
  {
    id: "welcome10",
    title: "👋 Welcome Discount",
    description: "First-time customer? Get 10% off your first purchase!",
    type: "coupon",
    discountPercent: 10,
    couponCode: "WELCOME10",
    isActive: true,
  },
  {
    id: "free-shipping",
    title: "🚚 Free Shipping",
    description: "Free delivery on orders over 100,000 MMK!",
    type: "special",
    minPurchase: 100000,
    isActive: true,
  },
];

/**
 * Get all active promotions
 */
export function getActivePromotions(): Promotion[] {
  return ACTIVE_PROMOTIONS.filter((promo) => {
    if (!promo.isActive) return false;

    // Check expiry
    if (promo.validUntil && new Date() > promo.validUntil) {
      return false;
    }

    return true;
  });
}

/**
 * Get promotions by type
 */
export function getPromotionsByType(
  type: "discount" | "flash_sale" | "coupon" | "new_arrival" | "special"
): Promotion[] {
  return getActivePromotions().filter((promo) => promo.type === type);
}

/**
 * Format promotions for display
 */
export function formatPromotions(promotions: Promotion[]): string {
  if (promotions.length === 0) {
    return "We don't have any active promotions right now, but check back soon! 🎉";
  }

  const formatted = promotions.map((promo) => {
    const parts: string[] = [];

    parts.push(`**${promo.title}**`);
    parts.push(promo.description);

    if (promo.discountPercent) {
      parts.push(`💰 ${promo.discountPercent}% OFF`);
    }

    if (promo.couponCode) {
      parts.push(`🎫 Code: **${promo.couponCode}**`);
    }

    if (promo.minPurchase) {
      parts.push(
        `📦 Min. Purchase: ${new Intl.NumberFormat("en-US").format(promo.minPurchase)} MMK`
      );
    }

    if (promo.validUntil) {
      const daysLeft = Math.ceil(
        (promo.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft > 0) {
        parts.push(`⏰ Valid for ${daysLeft} more day${daysLeft > 1 ? "s" : ""}`);
      }
    }

    return parts.join("\n");
  });

  return formatted.join("\n\n");
}

/**
 * Detect if message is asking about promotions
 */
export function isPromotionQuery(message: string): {
  isQuery: boolean;
  queryType?: "discount" | "coupon" | "sale" | "new" | "general";
} {
  const lowerMessage = message.toLowerCase();

  // Discount queries
  if (
    lowerMessage.includes("discount") ||
    lowerMessage.includes("sale") ||
    lowerMessage.includes("offer") ||
    lowerMessage.includes("deal")
  ) {
    if (lowerMessage.includes("coupon") || lowerMessage.includes("code")) {
      return { isQuery: true, queryType: "coupon" };
    }
    if (lowerMessage.includes("flash") || lowerMessage.includes("today")) {
      return { isQuery: true, queryType: "sale" };
    }
    return { isQuery: true, queryType: "discount" };
  }

  // Coupon queries
  if (
    lowerMessage.includes("coupon") ||
    lowerMessage.includes("promo code") ||
    lowerMessage.includes("voucher")
  ) {
    return { isQuery: true, queryType: "coupon" };
  }

  // New arrivals queries
  if (
    lowerMessage.includes("new") &&
    (lowerMessage.includes("arrival") ||
      lowerMessage.includes("collection") ||
      lowerMessage.includes("latest"))
  ) {
    return { isQuery: true, queryType: "new" };
  }

  // General promotion queries
  if (
    lowerMessage.includes("promotion") ||
    lowerMessage.includes("special")
  ) {
    return { isQuery: true, queryType: "general" };
  }

  return { isQuery: false };
}

/**
 * Get promotion response based on query type
 */
export function getPromotionResponse(
  queryType: "discount" | "coupon" | "sale" | "new" | "general"
): string {
  switch (queryType) {
    case "coupon":
      const coupons = getPromotionsByType("coupon");
      return (
        "🎫 **Available Coupon Codes:**\n\n" +
        (coupons.length > 0
          ? formatPromotions(coupons)
          : "We don't have any coupon codes right now. Follow us on social media for updates!")
      );

    case "sale":
      const sales = getPromotionsByType("flash_sale");
      return (
        "⚡ **Flash Sales & Special Offers:**\n\n" +
        (sales.length > 0
          ? formatPromotions(sales)
          : "No flash sales at the moment. Check back later!")
      );

    case "new":
      const newArrivals = getPromotionsByType("new_arrival");
      return (
        "🆕 **New Arrivals:**\n\n" +
        (newArrivals.length > 0
          ? formatPromotions(newArrivals)
          : "New items are added regularly. Browse our collection to see the latest!")
      );

    case "discount":
    case "general":
    default:
      const allPromotions = getActivePromotions();
      return (
        "🎉 **Current Promotions:**\n\n" +
        formatPromotions(allPromotions) +
        "\n\n💡 Tip: Ask me about specific promotions like 'coupon codes' or 'flash sales'!"
      );
  }
}
