/**
 * Server-to-server endpoint for one customer notification.
 *
 * The POS app cannot import this app's mailer or Telegram client, so it posts
 * events here instead. Guarded by the `NOTIFY_API_SECRET` shared secret: this
 * route can put a message in a customer's inbox, so it must never be open.
 *
 * POST /api/notifications/dispatch
 *   headers: x-notify-secret: <NOTIFY_API_SECRET>
 *            Idempotency-Key: <key>            (optional, same as body.idempotencyKey)
 *   body:    { customerId, type, order? | promotion? | couponPackages? | coupon?,
 *              idempotencyKey?, ... }
 *
 * Idempotency: the POS outbox retries until it hears back, so it sends its
 * outbox document id as `idempotencyKey`. The first request with a key claims
 * `notificationDispatches/{key}` (Admin SDK `create()`); a repeat finds it and
 * gets 200 `{ success: true, duplicate: true }` without the customer being
 * messaged again. Requests without a key behave as before.
 */

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { notifyCustomer } from "@/lib/notifications/dispatch";
import {
  hasValidNotifySecret,
  parseNotificationEvent,
} from "@/lib/notifications/parse";
import { isCampaignEventType } from "@/lib/notifications/types";

const DISPATCHES = "notificationDispatches";

/** Usable as a document id: letters, digits, "_" and "-", up to 200 characters. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{1,200}$/;

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

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

  // A document id: no "/" (it would address a different path), bounded length.
  if (customerId.length > 128 || customerId.includes("/")) {
    return NextResponse.json({ error: "Invalid customerId" }, { status: 400 });
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

  const rawKey = raw.idempotencyKey ?? req.headers.get("idempotency-key") ?? undefined;
  if (rawKey !== undefined && rawKey !== null && (typeof rawKey !== "string" || !IDEMPOTENCY_KEY.test(rawKey))) {
    return NextResponse.json({ error: "Invalid idempotencyKey" }, { status: 400 });
  }
  const dispatchRef =
    typeof rawKey === "string" ? adminDb.collection(DISPATCHES).doc(rawKey) : null;

  if (dispatchRef) {
    try {
      // Claim the key before sending anything; create() fails if it exists.
      await dispatchRef.create({
        customerId,
        type: parsed.value.type,
        status: "processing",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (isAlreadyExists(error)) {
        return NextResponse.json({ success: true, duplicate: true });
      }
      console.error("notifications/dispatch: could not record idempotency key:", error);
      return NextResponse.json(
        { error: "Failed to dispatch notification" },
        { status: 500 },
      );
    }
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

    if (dispatchRef) {
      await dispatchRef
        .update({
          status: "sent",
          completedAt: FieldValue.serverTimestamp(),
          result: { email: result.email, telegram: result.telegram, inApp: result.inApp },
        })
        .catch((error) =>
          console.error("notifications/dispatch: could not mark key as sent:", error),
        );
    }

    // 200 even when every channel was skipped: the request was handled
    // correctly, and the per-channel detail is in the body for the caller to
    // log. A customer with no email and no Telegram is not a server error.
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("notifications/dispatch failed:", error);
    // Nothing was sent: free the key so the caller's retry goes through.
    if (dispatchRef) {
      await dispatchRef
        .delete()
        .catch((deleteError) =>
          console.error("notifications/dispatch: could not release key:", deleteError),
        );
    }
    return NextResponse.json(
      { error: "Failed to dispatch notification" },
      { status: 500 },
    );
  }
}
