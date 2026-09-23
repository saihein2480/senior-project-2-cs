/**
 * Turns one `CustomerNotificationEvent` into ready-to-send bodies for every
 * channel: an email (subject + html + text), a Telegram message, and an in-app
 * record for the storefront bell.
 *
 * Keeping all three in one function is the point — when the wording of "order
 * shipped" changes it changes everywhere, and there is no way to add an event
 * that reaches email but silently skips Telegram.
 *
 * ## Telegram parse mode
 * The senders in `lib/telegram/api-client` default to MarkdownV2, where every
 * literal `.`, `!` and `-` has to be backslash-escaped or the API rejects the
 * whole message and `sendMessageSafe` swallows it as `false`. Everything built
 * here is HTML instead (`parse_mode: "HTML"`), which only needs `&`, `<` and
 * `>` escaped — the same escaping the email bodies already use.
 */

import {
  escapeHtml,
  renderEmailLayout,
  renderEmailText,
  storefrontUrl,
  type EmailDetailRow,
} from "../email/layout";
import { formatPrice } from "../telegram/formatters";
import type {
  CouponPackageAnnouncement,
  CustomerNotificationEvent,
  NotificationPreferenceKey,
  OrderEventType,
  OrderSummary,
  PromotionAnnouncement,
  RequestEventType,
} from "./types";

/** Who the message is addressed to, for the greeting line. */
export interface NotificationRecipient {
  displayName?: string;
}

export interface NotificationContent {
  email: { subject: string; html: string; text: string };
  telegram: {
    /** HTML-formatted body. Send with `parse_mode: "HTML"`. */
    html: string;
    /** Absolute image URL; when set the message goes out as a photo + caption. */
    photo?: string;
  };
  inApp: {
    type: string;
    title: string;
    message: string;
    link?: string;
  };
  /** Which customer preference flag gates this event. */
  preference: NotificationPreferenceKey;
}

/* -------------------------------------------------------------------------- */
/* small formatting helpers                                                   */
/* -------------------------------------------------------------------------- */

/** Join Telegram body lines, dropping the ones a conditional turned off. */
function tg(lines: Array<string | false | null | undefined>): string {
  return lines.filter((line): line is string => !!line).join("\n");
}

/** `<b>Label:</b> value` row for a Telegram body. */
function tgRow(label: string, value: string): string {
  return `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
}

/** Telegram link. Both the href and the label are escaped. */
function tgLink(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

/** "20% off (max 5,000 MMK)" or "3,000 MMK off". */
function describeDiscount(
  discountType: "percentage" | "fixed",
  discountValue: number,
  maxDiscountTHB?: number,
): string {
  if (discountType === "percentage") {
    const cap =
      maxDiscountTHB && maxDiscountTHB > 0
        ? ` (max ${formatPrice(maxDiscountTHB)})`
        : "";
    return `${discountValue}% off${cap}`;
  }
  return `${formatPrice(discountValue)} off`;
}

/** "23 Sep 2026", or "" when the input is blank or unparseable. */
function formatDate(input?: string): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "23 Sep 2026 - 30 Sep 2026", "until 30 Sep 2026", "from 23 Sep 2026" or "". */
function describePeriod(startDate?: string, endDate?: string): string {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  if (start && end) return `${start} - ${end}`;
  if (end) return `until ${end}`;
  if (start) return `from ${start}`;
  return "";
}

function orderDetailRows(order: OrderSummary): EmailDetailRow[] {
  const rows: EmailDetailRow[] = [
    { label: "Order", value: order.orderRef },
    { label: "Total", value: formatPrice(order.totalAmount), emphasis: true },
  ];
  if (order.paymentMethod) {
    rows.push({ label: "Payment", value: order.paymentMethod.toUpperCase() });
  }
  if (order.trackingNumber) {
    rows.push({ label: "Tracking", value: order.trackingNumber });
  }
  return rows;
}

/** Bulleted item list for the email body, or "" when the order carries none. */
function itemsHtml(order: OrderSummary): string {
  if (!order.items?.length) return "";
  const rows = order.items
    .map(
      (item) =>
        `<li style="margin:0 0 6px 0;">${escapeHtml(item.name)} &times; ${escapeHtml(String(item.quantity))}</li>`,
    )
    .join("");
  return `<p style="margin:20px 0 6px 0;font-size:13px;font-weight:600;color:#111827;">Items</p>
                <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;color:#6b7280;">${rows}</ul>`;
}

function itemsTextLines(order: OrderSummary): string[] {
  if (!order.items?.length) return [];
  return [
    "Items:",
    ...order.items.map((item) => `- ${item.name} x ${item.quantity}`),
  ];
}

function itemsTelegram(order: OrderSummary): string {
  if (!order.items?.length) return "";
  const list = order.items
    .map((item) => `• ${escapeHtml(item.name)} × ${item.quantity}`)
    .join("\n");
  return `\n<b>Items</b>\n${list}`;
}

/**
 * Assemble one notification from parts shared by every channel.
 *
 * `extraHtml` / `extraTextLines` / `telegramExtra` are the per-event bits that
 * do not fit the generic label/value shape.
 */
function build(options: {
  preference: NotificationPreferenceKey;
  inAppType: string;
  badge: string;
  title: string;
  /** Email subject. Defaults to `title`. */
  subject?: string;
  /** One-sentence summary, reused as the in-app message. */
  summary: string;
  detailRows?: EmailDetailRow[];
  extraHtml?: string;
  extraTextLines?: string[];
  telegramExtra?: string;
  callToAction?: { label: string; url: string };
  /** Bot command hint appended to the Telegram body, e.g. "/orders". */
  botHint?: string;
  outro?: string;
  link?: string;
  photo?: string;
  /** Name for the greeting line. Left off the in-app record. */
  greetingName?: string;
}): NotificationContent {
  const html = renderEmailLayout({
    badge: options.badge,
    heading: options.title,
    greetingName: options.greetingName,
    intro: options.summary,
    detailRows: options.detailRows,
    extraHtml: options.extraHtml,
    callToAction: options.callToAction,
    outro: options.outro,
  });

  const text = renderEmailText({
    heading: options.title,
    greetingName: options.greetingName,
    intro: options.summary,
    detailRows: options.detailRows,
    extraLines: options.extraTextLines,
    callToAction: options.callToAction,
    outro: options.outro,
  });

  const telegram = tg([
    `${options.badge} <b>${escapeHtml(options.title)}</b>`,
    "",
    options.greetingName ? `Hi ${escapeHtml(options.greetingName)},` : null,
    escapeHtml(options.summary),
    options.detailRows?.length ? "" : null,
    ...(options.detailRows?.map((row) => tgRow(row.label, row.value)) || []),
    options.telegramExtra,
    options.callToAction ? "" : null,
    options.callToAction
      ? tgLink(options.callToAction.label, options.callToAction.url)
      : null,
    options.botHint ? `Or use ${options.botHint} here in chat.` : null,
    options.outro ? "" : null,
    options.outro ? escapeHtml(options.outro) : null,
  ]);

  return {
    email: { subject: options.subject || options.title, html, text },
    telegram: { html: telegram, photo: options.photo },
    inApp: {
      type: options.inAppType,
      title: options.title,
      message: options.summary,
      link: options.link,
    },
    preference: options.preference,
  };
}

/* -------------------------------------------------------------------------- */
/* per-event content                                                          */
/* -------------------------------------------------------------------------- */

const PURCHASES_URL = storefrontUrl("/account/purchases");

function orderContent(
  event: Extract<CustomerNotificationEvent, { type: OrderEventType }>,
  recipient: NotificationRecipient,
): NotificationContent {
  const { order } = event;
  const rows = orderDetailRows(order);
  const cta = { label: "View your order", url: PURCHASES_URL };
  const common = {
    detailRows: rows,
    extraHtml: itemsHtml(order),
    extraTextLines: itemsTextLines(order),
    telegramExtra: itemsTelegram(order),
    callToAction: cta,
    link: "/account/purchases",
    greetingName: recipient.displayName,
  };

  switch (event.type) {
    case "order_placed":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "order_placed",
        badge: "🎉",
        title: "Order confirmed",
        subject: `Order ${order.orderRef} confirmed`,
        summary: `Thanks for your order! We have received it and will start preparing it shortly.`,
        botHint: "/orders",
        outro:
          order.paymentMethod?.toLowerCase() === "cod"
            ? "Please have the exact amount ready for the delivery rider."
            : "We will let you know as soon as your payment is confirmed.",
      });

    case "payment_received":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "payment_received",
        badge: "✅",
        title: "Payment received",
        subject: `Payment received for order ${order.orderRef}`,
        summary: `Your payment has been confirmed and your order is now being processed.`,
        botHint: "/orders",
      });

    case "order_packaging":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "order_packaging",
        badge: "📦",
        title: "Order being packed",
        subject: `Order ${order.orderRef} is being packed`,
        summary: `Good news - we are packing your order right now and it will ship soon.`,
        botHint: "/orders",
      });

    case "order_shipped":
      return build({
        ...common,
        preference: "deliveryAlerts",
        inAppType: "order_shipped",
        badge: "🚚",
        title: "Order shipped",
        subject: `Order ${order.orderRef} is on its way`,
        summary: `Your order has left our store and is on its way to you.`,
        botHint: `/track ${order.orderRef}`,
        outro: "Expected delivery is 2-5 business days.",
      });

    case "order_delivered":
      return build({
        ...common,
        preference: "deliveryAlerts",
        inAppType: "order_delivered",
        badge: "🎁",
        title: "Order delivered",
        subject: `Order ${order.orderRef} delivered`,
        summary: `Your order has been delivered. We hope you love it!`,
        botHint: "/orders",
        outro:
          "Something not right? You can request a return within 7 days of delivery.",
      });

    case "order_cancelled":
    default:
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "order_cancelled",
        badge: "❌",
        title: "Order cancelled",
        subject: `Order ${order.orderRef} cancelled`,
        summary: event.reason
          ? `Your order has been cancelled. Reason: ${event.reason}`
          : `Your order has been cancelled.`,
        botHint: "/orders",
        outro:
          order.paymentStatus?.toLowerCase() === "paid"
            ? "Any amount you already paid will be refunded within 5-7 business days."
            : "No payment was taken for this order.",
      });
  }
}

function requestContent(
  event: Extract<CustomerNotificationEvent, { type: RequestEventType }>,
  recipient: NotificationRecipient,
): NotificationContent {
  const { order } = event;
  const rows = orderDetailRows(order);
  if (typeof event.refundAmount === "number" && event.refundAmount > 0) {
    rows.push({
      label: "Refund amount",
      value: formatPrice(event.refundAmount),
      emphasis: true,
    });
  }
  if (event.refundMethod) {
    rows.push({ label: "Refund method", value: event.refundMethod });
  }

  const common = {
    detailRows: rows,
    callToAction: { label: "View your order", url: PURCHASES_URL },
    link: "/account/purchases",
    botHint: "/orders",
    greetingName: recipient.displayName,
  };

  switch (event.type) {
    case "cancellation_requested":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "cancellation_requested",
        badge: "📝",
        title: "Cancellation request received",
        subject: `Cancellation request received for order ${order.orderRef}`,
        summary: `We have received your request to cancel this order and our team is reviewing it.`,
        outro: "We will let you know the outcome shortly.",
      });

    case "cancellation_approved":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "cancellation_approved",
        badge: "✅",
        title: "Cancellation approved",
        subject: `Cancellation approved for order ${order.orderRef}`,
        summary: `Your cancellation request has been approved and the order has been cancelled.`,
        outro:
          typeof event.refundAmount === "number" && event.refundAmount > 0
            ? "Your refund is being processed and should arrive within 5-7 business days."
            : undefined,
      });

    case "cancellation_rejected":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "cancellation_rejected",
        badge: "⚠️",
        title: "Cancellation request declined",
        subject: `Cancellation request declined for order ${order.orderRef}`,
        summary: event.reason
          ? `We could not cancel this order. Reason: ${event.reason}`
          : `We could not cancel this order because it has already moved too far along.`,
        outro: "Contact our support team if you need more help.",
      });

    case "refund_requested":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "refund_requested",
        badge: "📝",
        title: "Return request received",
        subject: `Return request received for order ${order.orderRef}`,
        summary: `We have received your return request and our team is reviewing it.`,
        outro: "We will let you know the outcome shortly.",
      });

    case "refund_approved":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "refund_approved",
        badge: "✅",
        title: "Return request approved",
        subject: `Return approved for order ${order.orderRef}`,
        summary: `Your return request has been approved. Please return the items to the store to complete your refund.`,
      });

    case "refund_rejected":
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "refund_rejected",
        badge: "⚠️",
        title: "Return request declined",
        subject: `Return request declined for order ${order.orderRef}`,
        summary: event.reason
          ? `Your return request was declined. Reason: ${event.reason}`
          : `Your return request was declined.`,
        outro: "Contact our support team if you think this is a mistake.",
      });

    case "refund_completed":
    default:
      return build({
        ...common,
        preference: "orderUpdates",
        inAppType: "refund_completed",
        badge: "💰",
        title: "Refund completed",
        subject: `Refund completed for order ${order.orderRef}`,
        summary: `Your refund has been processed. Thank you for your patience.`,
        outro:
          "Depending on your payment provider it can take 5-7 business days to appear.",
      });
  }
}

function promotionContent(
  promotion: PromotionAnnouncement,
  recipient: NotificationRecipient,
): NotificationContent {
  const discount = describeDiscount(
    promotion.discountType,
    promotion.discountValue,
    promotion.maxDiscountTHB,
  );
  const period = describePeriod(promotion.startDate, promotion.endDate);
  const target = [promotion.productName, promotion.variantName]
    .filter(Boolean)
    .join(" - ");

  const rows: EmailDetailRow[] = [
    { label: "Discount", value: discount, emphasis: true },
  ];
  if (target) rows.push({ label: "Applies to", value: target });
  if (period) rows.push({ label: "Valid", value: period });

  const url = promotion.productPath
    ? storefrontUrl(promotion.productPath)
    : storefrontUrl("/view-all");

  return build({
    preference: "promotions",
    inAppType: "promotion",
    badge: "🎁",
    title: promotion.name,
    subject: `${discount} - ${promotion.name}`,
    summary:
      promotion.description ||
      `A new promotion is live at our store: ${discount}${target ? ` on ${target}` : ""}.`,
    detailRows: rows,
    callToAction: { label: "Shop the offer", url },
    botHint: "/promotions",
    outro: period
      ? `Offer valid ${period}. Do not miss out!`
      : "Shop now while stocks last!",
    link: "/view-all",
    photo: promotion.image,
    greetingName: recipient.displayName,
  });
}

function couponPackagesContent(
  packages: CouponPackageAnnouncement[],
  context: { pointsPerPurchase?: number; minimumSpendAmount?: number },
  recipient: NotificationRecipient,
): NotificationContent {
  const tiersHtml = packages
    .map(
      (pkg) => `
                  <tr>
                    <td style="padding:10px 0;font-size:13px;color:#111827;">
                      <strong>${escapeHtml(pkg.name)}</strong><br />
                      <span style="color:#6b7280;">${escapeHtml(String(pkg.pointsRequired))} points &middot; valid ${escapeHtml(String(pkg.validityDays))} days</span>
                    </td>
                    <td align="right" style="padding:10px 0;font-size:14px;font-weight:700;color:#e11d48;">
                      ${escapeHtml(describeDiscount(pkg.discountType, pkg.discountValue))}
                    </td>
                  </tr>`,
    )
    .join("");

  const extraHtml = `
                <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#111827;">Available reward packages</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:8px 20px;">${tiersHtml}
                </table>`;

  const extraTextLines = [
    "Available reward packages:",
    ...packages.map(
      (pkg) =>
        `- ${pkg.name}: ${pkg.pointsRequired} points for ${describeDiscount(pkg.discountType, pkg.discountValue)}, valid ${pkg.validityDays} days`,
    ),
  ];

  const telegramExtra =
    `\n<b>Available reward packages</b>\n` +
    packages
      .map(
        (pkg) =>
          `🎫 <b>${escapeHtml(pkg.name)}</b>\n` +
          `   ${escapeHtml(String(pkg.pointsRequired))} points → ${escapeHtml(describeDiscount(pkg.discountType, pkg.discountValue))}\n` +
          `   valid ${escapeHtml(String(pkg.validityDays))} days`,
      )
      .join("\n");

  const earnLine =
    context.pointsPerPurchase && context.minimumSpendAmount
      ? `Earn ${context.pointsPerPurchase} point${context.pointsPerPurchase === 1 ? "" : "s"} on every purchase over ${formatPrice(context.minimumSpendAmount)}.`
      : context.pointsPerPurchase
        ? `Earn ${context.pointsPerPurchase} point${context.pointsPerPurchase === 1 ? "" : "s"} on every qualifying purchase.`
        : undefined;

  const plural = packages.length === 1 ? "reward" : "rewards";

  return build({
    preference: "promotions",
    inAppType: "coupon_package",
    badge: "🎫",
    title: `New loyalty ${plural} available`,
    subject:
      packages.length === 1
        ? `New loyalty reward: ${packages[0].name}`
        : `${packages.length} new loyalty rewards you can redeem`,
    summary: `You can now redeem your loyalty points for ${packages.length === 1 ? "a new reward package" : `${packages.length} new reward packages`}.`,
    extraHtml,
    extraTextLines,
    telegramExtra,
    callToAction: {
      label: "Redeem your points",
      url: storefrontUrl("/membership"),
    },
    outro: earnLine,
    link: "/membership",
    greetingName: recipient.displayName,
  });
}

function loyaltyCouponContent(
  coupon: {
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    expiresAt?: string;
  },
  recipient: NotificationRecipient,
): NotificationContent {
  const discount = describeDiscount(coupon.discountType, coupon.discountValue);
  const expiry = formatDate(coupon.expiresAt);

  const rows: EmailDetailRow[] = [
    { label: "Coupon code", value: coupon.code },
    { label: "Discount", value: discount, emphasis: true },
  ];
  if (expiry) rows.push({ label: "Valid until", value: expiry });

  return build({
    preference: "promotions",
    inAppType: "loyalty_coupon_earned",
    badge: "🎟️",
    title: "Your coupon is ready",
    subject: `Your ${discount} coupon is ready to use`,
    summary: `You redeemed your loyalty points and your coupon is now active. Use the code at checkout.`,
    detailRows: rows,
    callToAction: { label: "Start shopping", url: storefrontUrl("/view-all") },
    link: "/membership",
    outro: expiry ? `Remember to use it before ${expiry}.` : undefined,
    greetingName: recipient.displayName,
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Build the channel bodies for an event.
 *
 * Pure: no Firestore reads, no network. Cheap enough to call once per recipient
 * during a broadcast, which is how each customer gets their own greeting
 * without any post-hoc string surgery on the rendered HTML.
 */
export function buildNotificationContent(
  event: CustomerNotificationEvent,
  recipient: NotificationRecipient = {},
): NotificationContent {
  switch (event.type) {
    case "order_placed":
    case "payment_received":
    case "order_packaging":
    case "order_shipped":
    case "order_delivered":
    case "order_cancelled":
      return orderContent(event, recipient);

    case "cancellation_requested":
    case "cancellation_approved":
    case "cancellation_rejected":
    case "refund_requested":
    case "refund_approved":
    case "refund_rejected":
    case "refund_completed":
      return requestContent(event, recipient);

    case "promotion_created":
      return promotionContent(event.promotion, recipient);

    case "coupon_packages_published":
      return couponPackagesContent(
        event.couponPackages,
        {
          pointsPerPurchase: event.pointsPerPurchase,
          minimumSpendAmount: event.minimumSpendAmount,
        },
        recipient,
      );

    case "loyalty_coupon_earned":
      return loyaltyCouponContent(event.coupon, recipient);
  }
}
