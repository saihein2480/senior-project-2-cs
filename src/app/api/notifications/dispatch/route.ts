/**
 * Server-to-server endpoint for one customer notification.
 *
 * The POS app cannot import this app's mailer or Telegram client, so it posts
 * events here instead. Guarded by the `NOTIFY_API_SECRET` shared secret: this
 * route can put a message in a customer's inbox, so it must never be open.
 *
 * POST /api/notifications/dispatch
 *   headers: x-notify-secret: <NOTIFY_API_SECRET>
 *   body:    { customerId, type, order? | promotion? | couponPackages? | coupon?, ... }
 */

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { notifyCustomer } from "@/lib/notifications/dispatch";
import {
  hasValidNotifySecret,
  parseNotificationEvent,
} from "@/lib/notifications/parse";
import { isCampaignEventType } from "@/lib/notifications/types";

export async function POST(req: Request) {
  if (!hasValidNotifySecret(req.headers.get("x-notify-secret"))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json(
      { error: "Firebase Admin is not configured on the server" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const customerId =
    typeof raw?.customerId === "string" ? raw.customerId.trim() : "";

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  const parsed = parseNotificationEvent(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (isCampaignEventType(parsed.value.type)) {
    return NextResponse.json(
      {
        error: `${parsed.value.type} is a store-wide announcement; use /api/notifications/broadcast`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await notifyCustomer({
      customerId,
      event: parsed.value,
      fallbackEmail:
        typeof raw.email === "string" ? raw.email.trim() : undefined,
      fallbackDisplayName:
        typeof raw.displayName === "string" ? raw.displayName.trim() : undefined,
      skipInApp: raw.skipInApp === true,
    });

    // 200 even when every channel was skipped: the request was handled
    // correctly, and the per-channel detail is in the body for the caller to
    // log. A customer with no email and no Telegram is not a server error.
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to dispatch notification";
    console.error("notifications/dispatch failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
