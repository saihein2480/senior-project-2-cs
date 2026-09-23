/**
 * Customer notification domain types.
 *
 * One event describes *what happened*; the content builder in `./content`
 * turns it into an email body, a Telegram message and an in-app record so the
 * three channels never drift apart in wording.
 */

/** Events about a single order, addressed to one customer. */
export type OrderEventType =
  | "order_placed"
  | "payment_received"
  | "order_packaging"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled";

/** Events about a cancellation or return request, addressed to one customer. */
export type RequestEventType =
  | "cancellation_requested"
  | "cancellation_approved"
  | "cancellation_rejected"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refund_completed";

/** Events announced to the whole opted-in customer base. */
export type CampaignEventType = "promotion_created" | "coupon_packages_published";

export type CustomerNotificationType =
  | OrderEventType
  | RequestEventType
  | CampaignEventType
  | "loyalty_coupon_earned";

/** Minimal order facts every order/request template needs. */
export interface OrderSummary {
  /** Human-facing reference the customer sees on the site, e.g. "OR12345678". */
  orderRef: string;
  /** Grand total in THB. Templates convert to MMK for display. */
  totalAmount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: { name: string; quantity: number }[];
  trackingNumber?: string;
  shippingAddress?: string;
}

export interface PromotionAnnouncement {
  name: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  /** Product or variant the promotion applies to, for the headline. */
  productName?: string;
  variantName?: string;
  /** ISO date strings; blank means open-ended. */
  startDate?: string;
  endDate?: string;
  /** Cap on a percentage discount, in THB. */
  maxDiscountTHB?: number;
  /** Absolute image URL. Telegram sends it as a photo when present. */
  image?: string;
  /** Storefront path the call-to-action should open. */
  productPath?: string;
}

export interface CouponPackageAnnouncement {
  name: string;
  pointsRequired: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  validityDays: number;
}

export interface CouponAnnouncement {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  expiresAt?: string;
}

export type CustomerNotificationEvent =
  | { type: OrderEventType; order: OrderSummary; reason?: string }
  | {
      type: RequestEventType;
      order: OrderSummary;
      /** THB. Omitted for request acknowledgements that carry no figure yet. */
      refundAmount?: number;
      refundMethod?: string;
      reason?: string;
    }
  | { type: "promotion_created"; promotion: PromotionAnnouncement }
  | {
      type: "coupon_packages_published";
      couponPackages: CouponPackageAnnouncement[];
      /** Points earned per qualifying purchase, for context in the message. */
      pointsPerPurchase?: number;
      minimumSpendAmount?: number;
    }
  | { type: "loyalty_coupon_earned"; coupon: CouponAnnouncement };

/**
 * Which `notificationPreferences` flag gates an event.
 *
 * `telegram` is the master switch for the Telegram channel; the other three are
 * per-topic and apply to email as well, so a customer who mutes promotions
 * stops getting promotional mail too.
 */
export type NotificationPreferenceKey =
  | "telegram"
  | "email"
  | "orderUpdates"
  | "promotions"
  | "deliveryAlerts";

export interface NotificationPreferences {
  telegram?: boolean;
  email?: boolean;
  orderUpdates?: boolean;
  promotions?: boolean;
  deliveryAlerts?: boolean;
}

/** Outcome of one fan-out attempt. `null` means the channel was not applicable. */
export interface DispatchResult {
  customerId: string;
  type: CustomerNotificationType;
  email: boolean | null;
  telegram: boolean | null;
  inApp: boolean | null;
  /** Populated when a channel was skipped, for the API response and logs. */
  skipped?: Partial<Record<"email" | "telegram" | "inApp", string>>;
}

export interface BroadcastResult {
  type: CustomerNotificationType;
  audience: number;
  emailSent: number;
  emailFailed: number;
  telegramSent: number;
  telegramFailed: number;
  inAppCreated: number;
}

const ALL_TYPES: CustomerNotificationType[] = [
  "order_placed",
  "payment_received",
  "order_packaging",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "cancellation_requested",
  "cancellation_approved",
  "cancellation_rejected",
  "refund_requested",
  "refund_approved",
  "refund_rejected",
  "refund_completed",
  "promotion_created",
  "coupon_packages_published",
  "loyalty_coupon_earned",
];

export function isCustomerNotificationType(
  value: unknown,
): value is CustomerNotificationType {
  return (
    typeof value === "string" &&
    ALL_TYPES.includes(value as CustomerNotificationType)
  );
}

export function isCampaignEventType(
  value: CustomerNotificationType,
): value is CampaignEventType {
  return value === "promotion_created" || value === "coupon_packages_published";
}
