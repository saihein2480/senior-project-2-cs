/**
 * Server-to-server endpoint for a store-wide customer announcement.
 *
 * Used when the owner publishes a new online promotion or new loyalty coupon
 * packages in the POS app. Guarded by the `NOTIFY_API_SECRET` shared secret —
 * one call can mail the entire customer list.
 *
 * POST /api/notifications/broadcast
 *   headers: x-notify-secret: <NOTIFY_API_SECRET>
 *   body:    { type: "promotion_created", promotion: {...} }
 *          | { type: "coupon_packages_published", couponPackages: [...] }
 *
 * Runs inline and can take a while: the sender paces itself to respect Gmail
 * and Telegram rate limits, so a few hundred recipients is minutes, not
 * milliseconds. `maxDuration` is raised accordingly.
 */

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { broadcastToCustomers } from "@/lib/notifications/broadcast";
import {
  hasValidNotifySecret,
  parseNotificationEvent,
} from "@/lib/notifications/parse";
import { isCampaignEventType } from "@/lib/notifications/types";

export const maxDuration = 300;

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

  const parsed = parseNotificationEvent(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!isCampaignEventType(parsed.value.type)) {
    return NextResponse.json(
      {
        error: `${parsed.value.type} targets a single customer; use /api/notifications/dispatch`,
      },
      { status: 400 },
    );
  }

  const raw = body as Record<string, unknown>;
  const maxRecipients =
    typeof raw.maxRecipients === "number" && raw.maxRecipients > 0
      ? Math.floor(raw.maxRecipients)
      : undefined;

  try {
    const result = await broadcastToCustomers(parsed.value, {
      maxRecipients,
      includeInApp: raw.includeInApp !== false,
      onlyCustomerIds: Array.isArray(raw.onlyCustomerIds)
        ? raw.onlyCustomerIds.filter(
            (id): id is string => typeof id === "string" && !!id.trim(),
          )
        : undefined,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to broadcast notification";
    console.error("notifications/broadcast failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
