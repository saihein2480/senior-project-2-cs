import type { OnlinePromotion } from "./onlinePromotionDoc";
import { isWithinStoreWindow } from "./storeTime";

export type AppliedPromotionResult = {
  promotion: OnlinePromotion | null;
  discountTHB: number;
  baseSubtotalTHB: number;
  finalSubtotalTHB: number;
};

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Is this promotion switched on and inside its date window right now?
 *
 * The single definition of "active", used by the product cards, the checkout
 * page, the order routes (through `priceOrder`) and the Telegram bot / AI chat,
 * so none of them can disagree about whether a deal applies.
 *
 * Dates are evaluated in the store's time zone (`lib/storeTime.ts`, Myanmar
 * Time unless `NEXT_PUBLIC_STORE_TIME_ZONE` says otherwise), never the time zone
 * of the browser or server: a "YYYY-MM-DD" start date begins at 00:00 store
 * time, an end date runs to 23:59:59.999 store time, and a full timestamp is
 * the absolute instant it names. This used to pin a fixed +06:30 offset and
 * widen timestamps to the whole day they fell on.
 */
export function isPromotionActiveNow(
  promo: Pick<OnlinePromotion, "isActive" | "startDate" | "endDate">,
  now: number = Date.now(),
): boolean {
  if (!promo.isActive) return false;
  return isWithinStoreWindow(promo.startDate, promo.endDate, now);
}

/**
 * Could this promotion ever take money off a line at checkout? Same conditions
 * `applyBestPromotionToLine` needs: a target product (and variant, for a
 * variant-scoped one) and a positive discount. Activity is separate.
 */
export function isPromotionApplicable(promo: OnlinePromotion): boolean {
  if (!promo.productId) return false;
  if (promo.scope === "variant" && !String(promo.variantId || "").trim()) {
    return false;
  }
  return safeNumber(promo.discountValue) > 0;
}

function matchesTarget(
  promo: OnlinePromotion,
  productId: string,
  variantId?: string,
): boolean {
  if (!promo.productId || promo.productId !== productId) return false;

  if (promo.scope === "group") return true;

  const normalizedVariant = String(variantId || "").trim();
  return (
    !!normalizedVariant &&
    String(promo.variantId || "").trim() === normalizedVariant
  );
}

function calculateDiscount(
  promo: OnlinePromotion,
  baseSubtotalTHB: number,
): number {
  const base = Math.max(0, safeNumber(baseSubtotalTHB));
  const value = Math.max(0, safeNumber(promo.discountValue));
  const maxDiscount = Math.max(0, safeNumber(promo.maxDiscountTHB));

  let discount =
    promo.discountType === "fixed"
      ? value
      : (base * Math.min(100, value)) / 100;

  if (promo.discountType === "fixed") {
    // Fixed discount is treated as per-unit only when caller passes one unit subtotal.
    // For multi-qty lines, caller should pass full line subtotal after multiplying value.
    discount = Math.min(discount, base);
  }

  if (maxDiscount > 0) {
    discount = Math.min(discount, maxDiscount);
  }

  return Math.min(discount, base);
}

export function applyBestPromotionToLine(params: {
  unitPriceTHB: number;
  quantity: number;
  productId: string;
  variantId?: string;
  promotions: readonly OnlinePromotion[];
  /** Evaluation instant (epoch ms). Defaults to now; tests pin it. */
  now?: number;
}): AppliedPromotionResult {
  const unit = Math.max(0, safeNumber(params.unitPriceTHB));
  const qty = Math.max(1, Math.floor(safeNumber(params.quantity)));
  const baseSubtotalTHB = unit * qty;
  const now = params.now ?? Date.now();

  const matching = (params.promotions || []).filter(
    (promo) =>
      isPromotionActiveNow(promo, now) &&
      matchesTarget(promo, params.productId, params.variantId),
  );

  if (matching.length === 0) {
    return {
      promotion: null,
      discountTHB: 0,
      baseSubtotalTHB,
      finalSubtotalTHB: baseSubtotalTHB,
    };
  }

  let best: AppliedPromotionResult = {
    promotion: null,
    discountTHB: 0,
    baseSubtotalTHB,
    finalSubtotalTHB: baseSubtotalTHB,
  };

  for (const promo of matching) {
    let discount = 0;

    if (promo.discountType === "fixed") {
      const lineFixedDiscount =
        Math.max(0, safeNumber(promo.discountValue)) * qty;
      discount = calculateDiscount(promo, lineFixedDiscount);
      discount = Math.min(discount, baseSubtotalTHB);
    } else {
      discount = calculateDiscount(promo, baseSubtotalTHB);
    }

    if (discount > best.discountTHB) {
      best = {
        promotion: promo,
        discountTHB: discount,
        baseSubtotalTHB,
        finalSubtotalTHB: Math.max(0, baseSubtotalTHB - discount),
      };
    }
  }

  return best;
}

/**
 * The saving on a line expressed as a whole percentage, for a "-25%" badge.
 *
 * Derived from the money actually taken off rather than from
 * `promotion.discountValue`, so a fixed-amount promotion and one capped by
 * `maxDiscountTHB` both report the percentage the shopper really gets.
 *
 * Returns 0 when no promotion applied, so callers can use it as the render
 * condition directly.
 */
export function getDiscountPercent(result: AppliedPromotionResult): number {
  if (!result.promotion) return 0;
  if (result.baseSubtotalTHB <= 0) return 0;

  const percent = Math.round(
    (result.discountTHB / result.baseSubtotalTHB) * 100,
  );

  // A rounded 0% would render as "-0%", which reads like a bug.
  return percent > 0 ? percent : 0;
}
