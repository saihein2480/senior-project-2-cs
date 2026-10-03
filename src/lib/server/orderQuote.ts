/**
 * Server-side order quote: what an order costs, computed only from data the
 * server reads itself.
 *
 * Used by `/api/mmpay/create-order` and `/api/transactions/create-cod`. The
 * request contributes only *what* to buy (product, variant, size, quantity,
 * which of the caller's own coupons to apply) and the totals the customer was
 * shown. Prices, promotions, coupon values, tax, rate, delivery fee and the
 * customer's identity and address all come from Firestore, so editing the
 * request can no longer change what is charged.
 *
 * Server only: uses the Admin SDK.
 */

import type { Firestore } from "firebase-admin/firestore";
import { adminAuth } from "../firebase-admin";
import { mapPromotionDoc } from "../onlinePromotionDoc";
import {
  catalogUnitPrice,
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  normalizeTaxRatePercent,
  priceOrder,
  resolveMmkRate,
  sameMoney,
  type OrderPricing,
  type PricingCoupon,
} from "../orderPricing";
import { deliveryFeeChangedMessage, normalizeDeliveryFee } from "../deliveryFee";
import { DELIVERY_AREA_NOTICE, isDeliverableAddress } from "../deliveryArea";
import {
  resolveSizeIndex,
  resolveVariantIndex,
  type StockVariant,
} from "../onlineStockService";

/** A 4xx outcome with a message meant for the customer. */
export class QuoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function isQuoteError(error: unknown): error is QuoteError {
  return error instanceof QuoteError;
}

/** One line as the client asks for it. No prices. */
export type RequestedLine = {
  productId: string;
  variantId?: string;
  color?: string;
  size?: string;
  quantity: number;
};

/** A requested line enriched with catalogue data for the order documents. */
export type QuotedLine = RequestedLine & {
  productName: string;
  image: string;
  color: string;
};

export type CustomerSnapshot = {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  address: string;
};

export type OrderQuote = {
  customer: CustomerSnapshot;
  lines: QuotedLine[];
  pricing: OrderPricing;
  coupon: PricingCoupon | null;
};

const MAX_ID_LENGTH = 200;
const MAX_LABEL_LENGTH = 100;

function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, max) : undefined;
}

/** Validate the requested lines. Throws QuoteError(400) on anything malformed. */
export function parseRequestedLines(input: unknown): RequestedLine[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new QuoteError("Your order has no items.", 400, "invalid_order");
  }
  if (input.length > MAX_ORDER_LINES) {
    throw new QuoteError(
      `An order can contain at most ${MAX_ORDER_LINES} different items.`,
      400,
      "invalid_order",
    );
  }

  return input.map((raw) => {
    const line = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const productId = optionalString(line.productId, MAX_ID_LENGTH);
    const quantity = Number(line.quantity);

    if (!productId || productId.includes("/")) {
      throw new QuoteError("An item in your order is invalid.", 400, "invalid_order");
    }
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_LINE_QUANTITY
    ) {
      throw new QuoteError(
        `Quantities must be whole numbers from 1 to ${MAX_LINE_QUANTITY}.`,
        400,
        "invalid_order",
      );
    }

    return {
      productId,
      variantId: optionalString(line.variantId, MAX_LABEL_LENGTH),
      color: optionalString(line.color, MAX_LABEL_LENGTH),
      size: optionalString(line.size, MAX_LABEL_LENGTH),
      quantity,
    };
  });
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The customer's checkout details, from their own documents. */
async function loadCustomer(
  db: Firestore,
  uid: string,
): Promise<{ snapshot: CustomerSnapshot; data: Record<string, unknown> }> {
  const customerSnap = await db.collection("customers").doc(uid).get();
  const data = (customerSnap.data() || {}) as Record<string, unknown>;

  let authEmail = "";
  let authVerified = false;
  if (adminAuth) {
    try {
      const record = await adminAuth.getUser(uid);
      authEmail = record.email || "";
      authVerified = record.emailVerified === true;
    } catch (error) {
      console.error(`Could not load auth record for ${uid}:`, error);
    }
  }

  const snapshot: CustomerSnapshot = {
    uid,
    email: String(data.email || authEmail || ""),
    displayName: String(data.displayName || "").trim(),
    phone: String(data.phone || "").trim(),
    address: String(data.address || "").trim(),
  };

  // Same gate as the checkout page: provider-verified, or our emailed code.
  if (!authVerified && data.emailVerified !== true) {
    throw new QuoteError(
      "Please verify your email before checking out.",
      403,
      "email_not_verified",
    );
  }
  if (!snapshot.displayName || !snapshot.phone || !snapshot.address) {
    throw new QuoteError(
      "Please complete your profile (name, phone and address) before checkout.",
      400,
      "profile_incomplete",
    );
  }
  if (!isDeliverableAddress(snapshot.address)) {
    throw new QuoteError(DELIVERY_AREA_NOTICE, 400, "address_not_deliverable");
  }

  return { snapshot, data };
}

/** The coupon the caller asked to apply, if it is theirs and still usable. */
function resolveCoupon(
  customerData: Record<string, unknown>,
  couponId: string | null | undefined,
): PricingCoupon | null {
  if (!couponId) return null;

  const coupons = Array.isArray(customerData.coupons)
    ? (customerData.coupons as Array<Record<string, unknown>>)
    : [];
  const coupon = coupons.find((c) => c && c.id === couponId);

  const expiresAt = coupon ? toDate(coupon.expiresAt) : null;
  const usable =
    !!coupon &&
    coupon.status === "active" &&
    !(expiresAt && expiresAt.getTime() < Date.now());

  if (!usable) {
    throw new QuoteError(
      "This coupon can no longer be used. Please remove it and try again.",
      409,
      "coupon_unavailable",
    );
  }

  return {
    id: String(coupon.id),
    code: String(coupon.code || ""),
    discountType: coupon.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: Number(coupon.discountValue) || 0,
  };
}

/** Price an order for `uid` from server-side data only. */
export async function quoteOrder(
  db: Firestore,
  params: { uid: string; lines: RequestedLine[]; couponId?: string | null },
): Promise<OrderQuote> {
  const productIds = Array.from(new Set(params.lines.map((l) => l.productId)));

  const [customer, settingsSnap, stockSnaps, promotionsSnap] =
    await Promise.all([
      loadCustomer(db, params.uid),
      db.collection("business_settings").doc("main").get(),
      db.getAll(...productIds.map((id) => db.collection("stocks").doc(id))),
      db.collection("online_promotions").get(),
    ]);

  const settings = (settingsSnap.data() || {}) as Record<string, unknown>;
  const stocks = new Map(
    stockSnaps.map((snap) => [
      snap.id,
      snap.exists ? ((snap.data() || {}) as Record<string, unknown>) : null,
    ]),
  );

  const quotedLines: QuotedLine[] = [];
  const pricingLines = params.lines.map((line) => {
    const stock = stocks.get(line.productId) || null;
    const productName = String(stock?.groupName || stock?.name || "Product");
    const unitPrice = catalogUnitPrice(stock);

    if (!stock || unitPrice === null) {
      throw new QuoteError(
        `${productName === "Product" ? "An item in your cart" : productName} is no longer available.`,
        409,
        "item_unavailable",
      );
    }

    const variants = Array.isArray(stock.colorVariants)
      ? (stock.colorVariants as StockVariant[])
      : [];
    const stockLine = { stockId: line.productId, ...line };
    const variantIndex = variants.length > 0 ? resolveVariantIndex(variants, stockLine) : -1;
    const variant = variantIndex >= 0 ? variants[variantIndex] : null;
    const sizeIndex = variant
      ? resolveSizeIndex(variant.sizeQuantities || [], stockLine)
      : -1;

    // resolveVariantIndex matches exactly or not at all, so an old cart line
    // (variant since removed or re-made) is refused here, by name, rather
    // than priced and reserved against a different colour.
    if (!variant || sizeIndex < 0) {
      const detail = [line.color, line.size].filter(Boolean).join(" / ");
      throw new QuoteError(
        `${productName}${detail ? ` (${detail})` : ""} is no longer available in that colour and size. Please remove it from your cart and add it again.`,
        409,
        "item_unavailable",
        { productId: line.productId },
      );
    }

    quotedLines.push({
      ...line,
      // The variant actually matched, by its own id when it has one, so the
      // stock reservation, its release and the POS all act on exactly this
      // variant. Id-less legacy variants keep what the page sent.
      variantId: variant.id ? String(variant.id) : line.variantId,
      productName,
      image: String(
        variant.image || stock.groupImage || stock.image || "",
      ),
      color: String(variant.color || line.color || ""),
    });

    return {
      productId: line.productId,
      // A variant-scoped promotion targets the variant's own id; id-less
      // legacy variants keep what the page sent (their index).
      variantId: variant.id ? String(variant.id) : line.variantId,
      quantity: line.quantity,
      unitPriceTHB: unitPrice,
    };
  });

  const coupon = resolveCoupon(customer.data, params.couponId);

  const pricing = priceOrder({
    lines: pricingLines,
    promotions: promotionsSnap.docs.map((doc) =>
      mapPromotionDoc(doc.id, doc.data() as Record<string, unknown>),
    ),
    coupon,
    taxRatePercent: normalizeTaxRatePercent(settings.taxRate),
    deliveryFeeTHB: normalizeDeliveryFee(settings.deliveryFee),
    mmkRate: resolveMmkRate(settings.currencyRate, process.env.NEXT_PUBLIC_MMK_RATE),
  });

  return { customer: customer.snapshot, lines: quotedLines, pricing, coupon };
}

/**
 * The per-line records stored on `onlineOrders.cartItems` (and read by the
 * webhook, the POS and the stock reservation), built from the quote.
 */
export function orderLineRecords(quote: OrderQuote) {
  return quote.pricing.lines.map((priced, index) => {
    const line = quote.lines[index];
    return {
      productId: line.productId,
      productName: line.productName,
      variantId: line.variantId || "",
      color: line.color || "",
      size: line.size || "",
      image: line.image || "",
      quantity: priced.quantity,
      /** Unit price actually charged, after the winning promotion. */
      priceTHB: priced.discountedUnitPriceTHB,
      /** Catalogue unit price before any promotion. */
      originalPriceTHB: priced.unitPriceTHB,
      lineDiscountTHB: priced.lineDiscountTHB,
      promotionId: priced.promotion?.id || "",
      promotionName: priced.promotion?.name || "",
      promotionDiscountType: priced.promotion?.discountType || "",
      promotionDiscountValue: priced.promotion?.discountValue || 0,
    };
  });
}

/** JSON response for a QuoteError. */
export function quoteErrorBody(error: QuoteError) {
  return { error: error.message, code: error.code, ...error.extra };
}

/**
 * Refuse the order if the customer was shown different figures from the ones
 * the server would charge (prices, promotions, fee or rate changed while the
 * page was open, or the request was edited). The customer re-confirms instead
 * of being charged a surprise amount.
 */
export function assertCustomerSawQuote(
  pricing: OrderPricing,
  expected: { deliveryFee?: unknown; totalTHB?: unknown; totalMMK?: unknown },
  options: { checkMmk: boolean },
): void {
  if (!sameMoney(expected.deliveryFee ?? 0, pricing.deliveryFeeTHB)) {
    throw new QuoteError(
      deliveryFeeChangedMessage(pricing.deliveryFeeTHB),
      409,
      "delivery_fee_changed",
      { deliveryFee: pricing.deliveryFeeTHB },
    );
  }

  const totalMatches = sameMoney(expected.totalTHB, pricing.totalTHB);
  const mmkMatches =
    !options.checkMmk ||
    Math.round(Number(expected.totalMMK)) === pricing.totalMMK;

  if (!totalMatches || !mmkMatches) {
    throw new QuoteError(
      "Prices have changed since you opened checkout. Please review the updated total and try again.",
      409,
      "price_changed",
      { totalTHB: pricing.totalTHB, totalMMK: pricing.totalMMK },
    );
  }
}
