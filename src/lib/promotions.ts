/**
 * Live promotions for the Telegram bot and the AI chat.
 *
 * Read from `online_promotions`, the same collection checkout prices from, and
 * judged with the same functions (`isPromotionActiveNow`,
 * `applyBestPromotionToLine`), so what the bot advertises is what
 * `lib/server/orderQuote.ts` charges. This replaced a hardcoded list that
 * advertised a "WELCOME10" code, a 20% weekend sale and free shipping over
 * 100,000 MMK, none of which checkout ever applied.
 *
 * Server only (Admin SDK). The collection is cached for 60 seconds per server
 * instance, so a promotion the owner switches on or off can take up to a minute
 * to show here; activity itself is evaluated on every call, so a promotion still
 * stops being advertised at the exact end of its window. Checkout reads the
 * collection fresh and is unaffected by this cache.
 */

import { adminDb } from "./firebase-admin";
import { createTtlCache } from "./server/ttlCache";
import { getCatalogDocs } from "./server/catalogCache";
import { mapPromotionDoc, type OnlinePromotion } from "./onlinePromotionDoc";
import {
  applyBestPromotionToLine,
  isPromotionActiveNow,
  isPromotionApplicable,
} from "./onlinePromotion";
import { catalogUnitPrice } from "./orderPricing";
import {
  formatStoreDate,
  parseStoreBoundary,
  storeTimeZoneLabel,
} from "./storeTime";

export type { OnlinePromotion };

const PROMOTIONS_TTL_MS = 60 * 1000;

const promotionsCache = createTtlCache<"online_promotions", readonly OnlinePromotion[]>({
  ttlMs: PROMOTIONS_TTL_MS,
  maxEntries: 1,
});

async function loadPromotions(): Promise<readonly OnlinePromotion[]> {
  if (!adminDb) throw new Error("Firebase Admin not configured");
  const snapshot = await adminDb.collection("online_promotions").get();
  return Object.freeze(
    snapshot.docs.map((doc) =>
      Object.freeze(mapPromotionDoc(doc.id, (doc.data() || {}) as Record<string, unknown>)),
    ),
  );
}

/** Every `online_promotions` document (cached ~60s). Read-only, shared. */
export function getAllOnlinePromotions(): Promise<readonly OnlinePromotion[]> {
  return promotionsCache.get("online_promotions", loadPromotions);
}

/**
 * Promotions checkout would apply right now: switched on, inside their window
 * in store time, and able to discount something. Throws when Firestore cannot
 * be read, so callers can say so rather than claim there are no deals.
 */
export async function getActivePromotions(
  now: number = Date.now(),
): Promise<OnlinePromotion[]> {
  const all = await getAllOnlinePromotions();
  return all.filter(
    (promo) => isPromotionApplicable(promo) && isPromotionActiveNow(promo, now),
  );
}

/** A live promotion with what it means for one unit of its product. */
export interface AdvertisedPromotion {
  promotion: OnlinePromotion;
  /** "20% off (max ฿100)", "฿50 off each". */
  discountText: string;
  /** "Linen Shirt (Blue)", or "" when the promotion names no product. */
  appliesTo: string;
  /** "until 2 Oct 2026", "2 Oct 2026 - 9 Oct 2026", "from 2 Oct 2026" or "". */
  validity: string;
  /**
   * Catalogue and promoted price of one unit, when the product is in the
   * catalogue and this promotion is the one checkout picks for a single item.
   */
  unitPriceTHB?: number;
  promotedUnitPriceTHB?: number;
}

export type MoneyFormatter = (amountTHB: number) => string;

/** `฿1,075` — the default when a caller has no currency formatter of its own. */
export function formatThb(amountTHB: number): string {
  const rounded = Math.round((Number(amountTHB) || 0) * 100) / 100;
  return `฿${rounded.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The discount in words, matching how `applyBestPromotionToLine` applies it. */
export function describePromotionDiscount(
  promo: Pick<OnlinePromotion, "discountType" | "discountValue" | "maxDiscountTHB">,
  formatMoney: MoneyFormatter = formatThb,
): string {
  const value = Math.max(0, Number(promo.discountValue) || 0);
  const cap = Math.max(0, Number(promo.maxDiscountTHB) || 0);
  const capText = cap > 0 ? ` (max ${formatMoney(cap)} off)` : "";

  if (promo.discountType === "fixed") {
    // Fixed promotions come off every unit of the line.
    return `${formatMoney(value)} off each${capText}`;
  }
  return `${Math.min(100, value)}% off${capText}`;
}

/** The promotion's window in store time, in words ("" when open-ended). */
export function describePromotionValidity(
  promo: Pick<OnlinePromotion, "startDate" | "endDate">,
  now: number = Date.now(),
): string {
  const start = formatStoreDate(promo.startDate);
  const end = formatStoreDate(promo.endDate);
  if (start && end) return `${start} - ${end}`;
  if (end) return `until ${end}`;
  // A start date that has passed says nothing useful about an open-ended deal.
  const startsAt = parseStoreBoundary(promo.startDate, "start");
  if (start && startsAt !== null && now < startsAt) return `from ${start}`;
  return "";
}

function describeTarget(promo: OnlinePromotion): string {
  const product = (promo.productName || "").trim();
  const variant = promo.scope === "variant" ? (promo.variantName || "").trim() : "";
  if (product && variant) return `${product} (${variant})`;
  return product;
}

/**
 * Live promotions, described for customers, with the one-unit price checkout
 * would charge when the product can be priced. Promotions for products no
 * longer in the catalogue are left out, since checkout would refuse them.
 */
export async function getAdvertisedPromotions(
  options: { now?: number; formatMoney?: MoneyFormatter } = {},
): Promise<AdvertisedPromotion[]> {
  const now = options.now ?? Date.now();
  const formatMoney = options.formatMoney ?? formatThb;
  const active = await getActivePromotions(now);
  if (active.length === 0) return [];

  // Best effort: without the catalogue the terms are still right, just
  // without a price example.
  let catalog: Map<string, Record<string, unknown>> | null = null;
  try {
    catalog = new Map((await getCatalogDocs()).map((doc) => [doc.id, doc.data]));
  } catch (error) {
    console.error("Could not load catalogue for promotion prices:", error);
  }

  const advertised: AdvertisedPromotion[] = [];
  for (const promotion of active) {
    const stock = catalog ? catalog.get(promotion.productId) : undefined;
    const unitPrice = stock ? catalogUnitPrice(stock) : null;
    // Checkout refuses a product that is gone or has no price, so its
    // promotion is not something a customer can actually get.
    if (catalog && unitPrice === null) continue;

    const entry: AdvertisedPromotion = {
      promotion,
      discountText: describePromotionDiscount(promotion, formatMoney),
      appliesTo: describeTarget(promotion),
      validity: describePromotionValidity(promotion, now),
    };

    if (unitPrice !== null) {
      const best = applyBestPromotionToLine({
        unitPriceTHB: unitPrice,
        quantity: 1,
        productId: promotion.productId,
        variantId: promotion.scope === "variant" ? promotion.variantId : undefined,
        promotions: active,
        now,
      });
      if (best.promotion?.id === promotion.id && best.discountTHB > 0) {
        entry.unitPriceTHB = unitPrice;
        entry.promotedUnitPriceTHB = Math.round(best.finalSubtotalTHB * 100) / 100;
      }
    }

    advertised.push(entry);
  }

  return advertised;
}

/** Footnote shown under promotion lists, so dates are not read as local time. */
export function promotionTimeNote(): string {
  return `Dates are in ${storeTimeZoneLabel()}; a promotion ends at the end of its last day. Discounts apply automatically at checkout.`;
}

/**
 * Plain-text promotion list (no markup). Callers escape it for their channel.
 */
export function formatPromotions(
  promotions: AdvertisedPromotion[],
  formatMoney: MoneyFormatter = formatThb,
): string {
  if (promotions.length === 0) {
    return "We don't have any active promotions right now, but check back soon! 🎉";
  }

  const blocks = promotions.map((entry, index) => {
    const lines = [`${index + 1}. ${entry.promotion.name || "Promotion"}`];
    lines.push(
      `   💰 ${entry.discountText}${entry.appliesTo ? ` - ${entry.appliesTo}` : ""}`,
    );
    if (entry.unitPriceTHB !== undefined && entry.promotedUnitPriceTHB !== undefined) {
      lines.push(
        `   🏷️ Now ${formatMoney(entry.promotedUnitPriceTHB)} (was ${formatMoney(entry.unitPriceTHB)})`,
      );
    }
    if (entry.promotion.branchName) {
      lines.push(`   🏬 ${entry.promotion.branchName}`);
    }
    if (entry.validity) lines.push(`   ⏰ ${entry.validity}`);
    if (entry.promotion.description) lines.push(`   ${entry.promotion.description}`);
    return lines.join("\n");
  });

  return `${blocks.join("\n\n")}\n\n${promotionTimeNote()}`;
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
 * Plain-text answer to a promotion question, from live data.
 *
 * There are no public coupon codes: coupons are personal loyalty rewards, so
 * the coupon answer points at the membership page instead of inventing one.
 */
export async function getPromotionResponse(
  queryType: "discount" | "coupon" | "sale" | "new" | "general",
  formatMoney: MoneyFormatter = formatThb,
): Promise<string> {
  switch (queryType) {
    case "coupon":
      return (
        "🎫 Coupons\n\n" +
        "Coupons are personal rewards you redeem with loyalty points. " +
        "See the ones you hold, and what you can redeem, on the membership page of our website. " +
        "Use /promotions for the discounts everyone gets right now."
      );

    case "new":
      return (
        "🆕 New Arrivals\n\n" +
        "New items are added regularly. Use /newarrivals to see the latest pieces."
      );

    case "sale":
    case "discount":
    case "general":
    default: {
      try {
        const promotions = await getAdvertisedPromotions({ formatMoney });
        return `🎉 Current Promotions\n\n${formatPromotions(promotions, formatMoney)}`;
      } catch (error) {
        console.error("Could not load promotions:", error);
        return "I couldn't load our current promotions just now. Please try /promotions again in a moment.";
      }
    }
  }
}
