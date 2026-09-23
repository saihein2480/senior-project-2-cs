/**
 * Report whether the signed-in customer has Telegram connected.
 *
 * The profile page calls this on load and then polls it while the customer is
 * away in Telegram, because the link is completed by the bot rather than by the
 * browser — nothing else would tell the page it succeeded.
 *
 * GET /api/telegram/link-status
 *   headers: Authorization: Bearer <firebase id token>
 *   -> { linked, telegramUsername, telegramFirstName, linkedAt, notificationPreferences }
 *
 * Deliberately does not return the chat id: the page has no use for it and it is
 * effectively a contact address.
 */

import { NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  if (!adminDb) {
    return NextResponse.json(
      { error: "Server is not configured" },
      { status: 503 },
    );
  }

  const uid = await getUidFromAuthHeader(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const snapshot = await adminDb.collection("customers").doc(uid).get();
    const data = snapshot.exists ? snapshot.data() || {} : {};

    const linkedAt = data.telegramLinkedAt?.toDate?.() || null;

    return NextResponse.json({
      linked: !!data.telegramChatId,
      telegramUsername: data.telegramUsername || null,
      telegramFirstName: data.telegramFirstName || null,
      linkedAt: linkedAt ? linkedAt.toISOString() : null,
      // Absent flags mean "on" everywhere else in the notification code, so the
      // page is told the effective value rather than the raw field.
      notificationPreferences: {
        telegram: data.notificationPreferences?.telegram !== false,
        orderUpdates: data.notificationPreferences?.orderUpdates !== false,
        deliveryAlerts: data.notificationPreferences?.deliveryAlerts !== false,
        promotions: data.notificationPreferences?.promotions !== false,
      },
      telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    });
  } catch (error) {
    console.error("telegram/link-status failed:", error);
    return NextResponse.json(
      { error: "Failed to read Telegram status" },
      { status: 500 },
    );
  }
}
