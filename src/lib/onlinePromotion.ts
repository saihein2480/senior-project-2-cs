import type { OnlinePromotion } from "./onlinePromotionDoc";

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
 * The store's clock: Myanmar Time (UTC+06:30), where Tachileik is.
 *
 * Promotion dates are calendar days picked in the POS (`<input type="date">`,
 * "YYYY-MM-DD"). They used to be evaluated in whatever timezone the code ran
 * in, so the browser (Myanmar) and the order route (UTC on the server) disagreed
 * for six and a half hours around every start and end date. Pinning the
 * timezone makes both sides agree, which the server-side price check relies on.
 */
const STORE_UTC_OFFSET_MS = 390 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start (inclusive) and end (inclusive) of a calendar day in store time, as epoch ms. */
function storeDayBounds(value: string): { start: number; end: number } | null {
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  let dayStartUtc: number;
  if (dateOnly) {
    dayStartUtc =
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) -
      STORE_UTC_OFFSET_MS;
  } else {
    // Anything else (an ISO timestamp): use the store-time day it falls on.
    const parsed = new Date(trimmed).getTime();
    if (Number.isNaN(parsed)) return null;
    const shifted = new Date(parsed + STORE_UTC_OFFSET_MS);
    dayStartUtc =
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
      ) - STORE_UTC_OFFSET_MS;
  }

  if (Number.isNaN(dayStartUtc)) return null;
  return { start: dayStartUtc, end: dayStartUtc + DAY_MS - 1 };
}

/** Active from 00:00 on startDate to 23:59:59.999 on endDate, store time. */
function isActiveNow(promo: OnlinePromotion, now: number = Date.now()): boolean {
  if (!promo.isActive) return false;

  if (promo.startDate) {
    const bounds = storeDayBounds(promo.startDate);
    if (bounds && now < bounds.start) return false;
  }

  if (promo.endDate) {
    const bounds = storeDayBounds(promo.endDate);
    if (bounds && now > bounds.end) return false;
  }

  return true;
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
  promotions: OnlinePromotion[];
}): AppliedPromotionResult {
  const unit = Math.max(0, safeNumber(params.unitPriceTHB));
  const qty = Math.max(1, Math.floor(safeNumber(params.quantity)));
  const baseSubtotalTHB = unit * qty;

  const matching = (params.promotions || []).filter(
    (promo) =>
      isActiveNow(promo) &&
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
