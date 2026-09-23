/**
 * Legacy notification endpoint — kept for the shapes documented in
 * documents/TELEGRAM_API_REFERENCE.md.
 *
 * It used to call the Telegram-only senders in `lib/telegram/notifications`
 * directly. It now maps the old body onto the cross-channel dispatcher, so the
 * same request reaches the customer by email as well as Telegram.
 *
 * Two behaviour changes worth knowing about:
 *  - it requires the `x-notify-secret` header (it previously accepted anonymous
 *    requests, which meant anyone who found the URL could message customers);
 *  - `type: "bulk"` is gone, because a free-text blast has no email equivalent.
 *    Use POST /api/notifications/broadcast instead.
 *
 * Prefer /api/notifications/dispatch for anything new.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { broadcastToCustomers } from "@/lib/notifications/broadcast";
import { notifyCustomer } from "@/lib/notifications/dispatch";
import {
  hasValidNotifySecret,
  parseNotificationEvent,
} from "@/lib/notifications/parse";
import type { CustomerNotificationType } from "@/lib/notifications/types";

/** Old public type names -> current event types. */
const LEGACY_TYPE_MAP: Record<string, CustomerNotificationType> = {
  order_confirmation: "order_placed",
  payment_confirmation: "payment_received",
  order_shipped: "order_shipped",
  order_delivered: "order_delivered",
  order_cancelled: "order_cancelled",
  refund_processed: "refund_completed",
  promotion: "promotion_created",
};

export async function POST(req: NextRequest) {
  if (!hasValidNotifySecret(req.headers.get("x-notify-secret"))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json(
      { error: "Firebase Admin is not configured on the server" },
      { status: 503 },
    );
  }

  let body: { type?: string; customerId?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, customerId, data = {} } = body;

  if (!type) {
    return NextResponse.json(
      { error: "Notification type is required" },
      { status: 400 },
    );
  }

  if (type === "bulk") {
    return NextResponse.json(
      {
        error:
          "type 'bulk' is no longer supported. POST a promotion_created or " +
          "coupon_packages_published event to /api/notifications/broadcast instead.",
      },
      { status: 400 },
    );
  }

  const mapped = LEGACY_TYPE_MAP[type];
  if (!mapped) {
    return NextResponse.json(
      { error: `Invalid notification type: ${type}` },
      { status: 400 },
    );
  }

  const parsed = parseNotificationEvent({
    type: mapped,
    order: data.order,
    promotion: data.promotion,
    reason: data.reason,
    refundAmount: data.refundAmount,
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    // The old "promotion" type addressed a single customer, so honour that by
    // narrowing the broadcast audience to just them.
    if (parsed.value.type === "promotion_created") {
      const result = await broadcastToCustomers(parsed.value, {
        onlyCustomerIds: [customerId],
      });
      return NextResponse.json({ success: true, result });
    }

    const result = await notifyCustomer({
      customerId,
      event: parsed.value,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send notification";
    console.error("Send notification error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
