/**
 * Order pricing, shared by the checkout page and the order routes.
 *
 * The checkout page uses this to show the customer their total; the order
 * routes (`/api/mmpay/create-order`, `/api/transactions/create-cod`) run the
 * same function on data they read themselves — catalogue prices from `stocks`,
 * promotions from `online_promotions`, the coupon from the customer's own
 * document, tax/rate/fee from `business_settings/main` — and charge that
 * result. Nothing price-related is taken from the request any more; the
 * client's totals are only compared against the server's, so a customer is
 * never charged an amount they were not shown.
 *
 * Pure: no Firebase or React imports, so it runs identically in both places.
 *
 * Order of operations (unchanged from the previous checkout maths):
 *   catalogue price x qty  -> best promotion per line
 *   -> coupon on the promoted subtotal
 *   -> tax on what remains
 *   -> flat delivery fee (not taxed, never discounted)
 */

import { applyBestPromotionToLine } from "./onlinePromotion";
import type { OnlinePromotion } from "./onlinePromotionDoc";
import { normalizeDeliveryFee } from "./deliveryFee";

/** Fallback THB -> MMK rate when neither the owner nor the env sets one. */
export const DEFAULT_MMK_RATE = 55;

/** Most lines one order may carry, and most units of one line. */
export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

/** Round to satang (2 dp). Non-finite input becomes 0. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Equal to the satang. Used to compare a client's figure with the server's. */
export function sameMoney(a: unknown, b: unknown): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < 0.005;
}

/**
 * THB -> MMK rate: the owner's `currencyRate`, then `NEXT_PUBLIC_MMK_RATE`,
 * then the shared default. The same rule on the page and on the server, so the
 * MMK amount shown is the MMK amount charged.
 */
export function resolveMmkRate(configured: unknown, envRate?: unknown): number {
  const owner = Number(configured);
  if (Number.isFinite(owner) && owner > 0) return owner;
  const env = Number(envRate);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_MMK_RATE;
}

/** Tax rate as a percentage (7 = 7%). Anything unusable is 0. */
export function normalizeTaxRatePercent(value: unknown): number {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * Catalogue unit price (THB) of a `stocks` document: `unitPrice`, else `price`
 * (the same precedence as `mapStockDocToProduct`). Null when the product has
 * no sellable price.
 */
export function catalogUnitPrice(
  data: { unitPrice?: unknown; price?: unknown } | null | undefined,
): number | null {
  if (!data) return null;
  const raw = typeof data.unitPrice === "number" ? data.unitPrice : data.price;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** The parts of a loyalty coupon that affect the price. */
export type PricingCoupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
};

/** Coupon saving on `amountTHB`: percentage (capped at 100%) or fixed (capped at the amount). */
export function couponDiscountFor(
  amountTHB: number,
  coupon: PricingCoupon | null | undefined,
): number {
  if (!coupon) return 0;
  const base = Math.max(0, Number(amountTHB) || 0);
  const value = Math.max(0, Number(coupon.discountValue) || 0);

  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (base * Math.min(100, value)) / 100;
  } else if (coupon.discountType === "fixed") {
    discount = value;
  }

  return roundMoney(Math.min(discount, base));
}

export type PricingLineInput = {
  productId: string;
  /** Variant id used to match variant-scoped promotions. */
  variantId?: string;
  quantity: number;
  /** Catalogue unit price, before any promotion. */
  unitPriceTHB: number;
};

export type LinePromotion = {
  id: string;
  name: string;
  discountType: string;
  discountValue: number;
};

export type PricedLine = {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPriceTHB: number;
  /** unitPriceTHB x quantity. */
  baseSubtotalTHB: number;
  lineDiscountTHB: number;
  /** baseSubtotalTHB - lineDiscountTHB. */
  lineTotalTHB: number;
  /** What one unit actually cost after the promotion (unrounded). */
  discountedUnitPriceTHB: number;
  promotion: LinePromotion | null;
};

export type AppliedPromotionSummary = {
  promotionId: string;
  name: string;
  discountType: string;
  discountValue: number;
  discountTHB: number;
};

export type OrderPricing = {
  lines: PricedLine[];
  /** Catalogue value of every line, before promotions. */
  subtotalTHB: number;
  promotionDiscountTHB: number;
  subtotalAfterPromotionsTHB: number;
  couponDiscountTHB: number;
  subtotalAfterCouponTHB: number;
  taxRatePercent: number;
  taxTHB: number;
  deliveryFeeTHB: number;
  totalTHB: number;
  mmkRate: number;
  totalMMK: number;
  /** The delivery fee's share of totalMMK (never more than totalMMK). */
  deliveryFeeMMK: number;
  appliedPromotions: AppliedPromotionSummary[];
};

export function normalizeQuantity(quantity: unknown): number {
  return Math.max(1, Math.floor(Number(quantity) || 0));
}

export function priceOrder(input: {
  lines: PricingLineInput[];
  promotions: OnlinePromotion[];
  coupon?: PricingCoupon | null;
  taxRatePercent: number;
  deliveryFeeTHB: number;
  mmkRate: number;
}): OrderPricing {
  const lines: PricedLine[] = input.lines.map((line) => {
    const quantity = normalizeQuantity(line.quantity);
    const unitPriceTHB = Math.max(0, Number(line.unitPriceTHB) || 0);

    const result = applyBestPromotionToLine({
      unitPriceTHB,
      quantity,
      productId: line.productId,
      variantId: line.variantId,
      promotions: input.promotions,
    });

    const baseSubtotalTHB = roundMoney(unitPriceTHB * quantity);
    const lineDiscountTHB = roundMoney(
      Math.min(result.discountTHB, baseSubtotalTHB),
    );
    const lineTotalTHB = roundMoney(baseSubtotalTHB - lineDiscountTHB);

    return {
      productId: line.productId,
      variantId: line.variantId,
      quantity,
      unitPriceTHB,
      baseSubtotalTHB,
      lineDiscountTHB,
      lineTotalTHB,
      discountedUnitPriceTHB: lineTotalTHB / quantity,
      promotion:
        result.promotion && lineDiscountTHB > 0
          ? {
              id: result.promotion.id,
              name: result.promotion.name,
              discountType: result.promotion.discountType,
              discountValue: Number(result.promotion.discountValue) || 0,
            }
          : null,
    };
  });

  const subtotalTHB = roundMoney(
    lines.reduce((sum, line) => sum + line.baseSubtotalTHB, 0),
  );
  const promotionDiscountTHB = roundMoney(
    lines.reduce((sum, line) => sum + line.lineDiscountTHB, 0),
  );
  const subtotalAfterPromotionsTHB = roundMoney(
    Math.max(0, subtotalTHB - promotionDiscountTHB),
  );

  const couponDiscountTHB = couponDiscountFor(
    subtotalAfterPromotionsTHB,
    input.coupon,
  );
  const subtotalAfterCouponTHB = roundMoney(
    Math.max(0, subtotalAfterPromotionsTHB - couponDiscountTHB),
  );

  const taxRatePercent = normalizeTaxRatePercent(input.taxRatePercent);
  const taxTHB = roundMoney((subtotalAfterCouponTHB * taxRatePercent) / 100);
  const deliveryFeeTHB = normalizeDeliveryFee(input.deliveryFeeTHB);
  const totalTHB = roundMoney(subtotalAfterCouponTHB + taxTHB + deliveryFeeTHB);

  const mmkRate = resolveMmkRate(input.mmkRate);
  const totalMMK = Math.round(totalTHB * mmkRate);
  const deliveryFeeMMK = Math.min(totalMMK, Math.round(deliveryFeeTHB * mmkRate));

  const byPromotion = new Map<string, AppliedPromotionSummary>();
  for (const line of lines) {
    if (!line.promotion) continue;
    const existing = byPromotion.get(line.promotion.id);
    if (existing) {
      existing.discountTHB = roundMoney(existing.discountTHB + line.lineDiscountTHB);
    } else {
      byPromotion.set(line.promotion.id, {
        promotionId: line.promotion.id,
        name: line.promotion.name,
        discountType: line.promotion.discountType,
        discountValue: line.promotion.discountValue,
        discountTHB: line.lineDiscountTHB,
      });
    }
  }

  return {
    lines,
    subtotalTHB,
    promotionDiscountTHB,
    subtotalAfterPromotionsTHB,
    couponDiscountTHB,
    subtotalAfterCouponTHB,
    taxRatePercent,
    taxTHB,
    deliveryFeeTHB,
    totalTHB,
    mmkRate,
    totalMMK,
    deliveryFeeMMK,
    appliedPromotions: Array.from(byPromotion.values()),
  };
}

export type GatewayLineLabel = {
  name: string;
  color?: string;
  size?: string;
};

export type GatewayItem = { name: string; amount: number; quantity: number };

/**
 * MyanMyanPay itemisation that adds up exactly to `pricing.totalMMK`.
 *
 * The goods (after promotions, coupon and tax) are spread over the product
 * lines in proportion to their value using largest-remainder rounding, so no
 * line goes negative and the sum is exact. The delivery fee is its own line.
 * Each line carries quantity 1 because `amount` already covers the whole line;
 * the real quantity is in the label.
 */
export function buildGatewayItems(
  pricing: OrderPricing,
  labels: GatewayLineLabel[],
): GatewayItem[] {
  const goodsMmk = Math.max(0, pricing.totalMMK - pricing.deliveryFeeMMK);
  const weights = pricing.lines.map((line) => Math.max(0, line.lineTotalTHB));
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  const shares = weights.map((w) =>
    weightTotal > 0 ? (goodsMmk * w) / weightTotal : goodsMmk / Math.max(1, weights.length),
  );

  const amounts = shares.map((share) => Math.floor(share));
  let remainder = goodsMmk - amounts.reduce((sum, a) => sum + a, 0);
  const order = shares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; remainder > 0 && order.length > 0; i = (i + 1) % order.length) {
    amounts[order[i].index] += 1;
    remainder -= 1;
  }

  const items: GatewayItem[] = pricing.lines.map((line, index) => {
    const label = labels[index] || { name: "Item" };
    const variant = [label.color, label.size].filter(Boolean).join(", ");
    const parts = [label.name || "Item"];
    if (variant) parts.push(`(${variant})`);
    if (line.quantity > 1) parts.push(`x${line.quantity}`);
    return { name: parts.join(" ").slice(0, 120), amount: amounts[index] || 0, quantity: 1 };
  });

  items.push({ name: "Delivery fee", amount: pricing.deliveryFeeMMK, quantity: 1 });

  // Zero-value lines add nothing to the sum, so dropping them keeps it exact.
  return items.filter((item) => item.amount > 0);
}
