/**
 * Validation for notification payloads arriving over HTTP.
 *
 * The POS app posts these across an app boundary, so nothing in the body is
 * trusted: every field is coerced to the expected type and anything unusable is
 * rejected with a reason rather than silently producing a half-rendered message
 * with `undefined` in it.
 */

import { timingSafeEqual } from "crypto";
import {
  isCustomerNotificationType,
  type CouponPackageAnnouncement,
  type CustomerNotificationEvent,
  type OrderSummary,
  type PromotionAnnouncement,
} from "./types";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function asString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOrder(input: unknown): ParseResult<OrderSummary> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "order is required for this notification type" };
  }

  const raw = input as Record<string, unknown>;
  const orderRef = asString(raw.orderRef) || asString(raw.orderId);
  if (!orderRef) {
    return { ok: false, error: "order.orderRef is required" };
  }

  const totalAmount = asNumber(raw.totalAmount ?? raw.total);
  if (totalAmount === undefined || totalAmount < 0) {
    return { ok: false, error: "order.totalAmount must be a non-negative number" };
  }

  // Accept both the storefront shape ({ name, quantity }) and the Telegram
  // helper shape ({ productName, quantity }) so callers can pass whichever
  // they already have in hand.
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const entry = item as Record<string, unknown>;
          const name = asString(entry.name) || asString(entry.productName);
          const quantity = asNumber(entry.quantity) ?? 1;
          if (!name) return null;
          return { name, quantity };
        })
        .filter((item): item is { name: string; quantity: number } => !!item)
        .slice(0, 40)
    : undefined;

  return {
    ok: true,
    value: {
      orderRef,
      totalAmount,
      paymentMethod: asString(raw.paymentMethod, 40),
      paymentStatus: asString(raw.paymentStatus, 40),
      items: items?.length ? items : undefined,
      trackingNumber: asString(raw.trackingNumber, 80),
      shippingAddress: asString(raw.shippingAddress, 300),
    },
  };
}

function parsePromotion(input: unknown): ParseResult<PromotionAnnouncement> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "promotion is required for promotion_created" };
  }

  const raw = input as Record<string, unknown>;
  const name = asString(raw.name, 120);
  if (!name) {
    return { ok: false, error: "promotion.name is required" };
  }

  const discountValue = asNumber(raw.discountValue);
  if (discountValue === undefined || discountValue <= 0) {
    return { ok: false, error: "promotion.discountValue must be greater than 0" };
  }

  return {
    ok: true,
    value: {
      name,
      description: asString(raw.description, 600),
      discountType: raw.discountType === "fixed" ? "fixed" : "percentage",
      discountValue,
      productName: asString(raw.productName, 120),
      variantName: asString(raw.variantName, 120),
      startDate: asString(raw.startDate, 40),
      endDate: asString(raw.endDate, 40),
      maxDiscountTHB: asNumber(raw.maxDiscountTHB),
      image: asHttpUrl(raw.image),
      productPath: asRelativePath(raw.productPath),
    },
  };
}

/** Only absolute http(s) URLs — Telegram rejects anything else for a photo. */
function asHttpUrl(value: unknown): string | undefined {
  const candidate = asString(value, 800);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Same-origin path for a call-to-action link.
 *
 * Rejects protocol-relative values like `//evil.example` so a caller cannot turn
 * our outgoing mail into an open redirect.
 */
function asRelativePath(value: unknown): string | undefined {
  const candidate = asString(value, 300);
  if (!candidate) return undefined;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return undefined;
  return candidate;
}

function parseCouponPackages(
  input: unknown,
): ParseResult<CouponPackageAnnouncement[]> {
  if (!Array.isArray(input) || input.length === 0) {
    return {
      ok: false,
      error: "couponPackages must be a non-empty array for coupon_packages_published",
    };
  }

  const packages = input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const name = asString(raw.name, 120);
      const pointsRequired = asNumber(raw.pointsRequired);
      const discountValue = asNumber(raw.discountValue);
      const validityDays = asNumber(raw.validityDays);

      if (!name || !pointsRequired || pointsRequired <= 0) return null;
      if (discountValue === undefined || discountValue <= 0) return null;

      return {
        name,
        pointsRequired: Math.floor(pointsRequired),
        discountType:
          raw.discountType === "fixed" ? ("fixed" as const) : ("percentage" as const),
        discountValue,
        validityDays:
          validityDays && validityDays > 0 ? Math.floor(validityDays) : 30,
      };
    })
    .filter((pkg): pkg is CouponPackageAnnouncement => !!pkg)
    .slice(0, 20);

  if (packages.length === 0) {
    return { ok: false, error: "no valid coupon packages in the payload" };
  }

  return { ok: true, value: packages };
}

/**
 * Turn a request body into a validated event.
 *
 * Accepts `{ type, order?, promotion?, couponPackages?, ... }`.
 */
export function parseNotificationEvent(
  body: unknown,
): ParseResult<CustomerNotificationEvent> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "request body must be a JSON object" };
  }

  const raw = body as Record<string, unknown>;
  const type = raw.type;

  if (!isCustomerNotificationType(type)) {
    return {
      ok: false,
      error: `unknown notification type: ${typeof type === "string" ? type : "(missing)"}`,
    };
  }

  // No cast here: `isCustomerNotificationType` has already narrowed `type`, and
  // casting would defeat the per-case narrowing the returned union relies on.
  switch (type) {
    case "order_placed":
    case "payment_received":
    case "order_packaging":
    case "order_shipped":
    case "order_delivered":
    case "order_cancelled": {
      const order = parseOrder(raw.order);
      if (!order.ok) return order;
      return {
        ok: true,
        value: { type, order: order.value, reason: asString(raw.reason, 300) },
      };
    }

    case "cancellation_requested":
    case "cancellation_approved":
    case "cancellation_rejected":
    case "refund_requested":
    case "refund_approved":
    case "refund_rejected":
    case "refund_completed": {
      const order = parseOrder(raw.order);
      if (!order.ok) return order;
      return {
        ok: true,
        value: {
          type,
          order: order.value,
          refundAmount: asNumber(raw.refundAmount),
          refundMethod: asString(raw.refundMethod, 60),
          reason: asString(raw.reason, 300),
        },
      };
    }

    case "promotion_created": {
      const promotion = parsePromotion(raw.promotion);
      if (!promotion.ok) return promotion;
      return { ok: true, value: { type, promotion: promotion.value } };
    }

    case "coupon_packages_published": {
      const packages = parseCouponPackages(raw.couponPackages);
      if (!packages.ok) return packages;
      return {
        ok: true,
        value: {
          type,
          couponPackages: packages.value,
          pointsPerPurchase: asNumber(raw.pointsPerPurchase),
          minimumSpendAmount: asNumber(raw.minimumSpendAmount),
        },
      };
    }

    case "loyalty_coupon_earned": {
      const coupon = raw.coupon;
      if (!coupon || typeof coupon !== "object") {
        return { ok: false, error: "coupon is required for loyalty_coupon_earned" };
      }
      const entry = coupon as Record<string, unknown>;
      const code = asString(entry.code, 60);
      const discountValue = asNumber(entry.discountValue);
      if (!code) return { ok: false, error: "coupon.code is required" };
      if (discountValue === undefined || discountValue <= 0) {
        return { ok: false, error: "coupon.discountValue must be greater than 0" };
      }
      return {
        ok: true,
        value: {
          type,
          coupon: {
            code,
            discountType: entry.discountType === "fixed" ? "fixed" : "percentage",
            discountValue,
            expiresAt: asString(entry.expiresAt, 40),
          },
        },
      };
    }
  }
}

/**
 * Constant-time check of the server-to-server shared secret.
 *
 * These endpoints can mail the entire customer list, so an unauthenticated
 * caller must not be able to reach them. Returns false when the secret is not
 * configured at all — failing closed is the right default for a broadcast.
 */
export function hasValidNotifySecret(headerValue: string | null): boolean {
  const expected = process.env.NOTIFY_API_SECRET;
  if (!expected || !headerValue) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
