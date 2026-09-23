/**
 * Disconnect Telegram from the signed-in customer's account.
 *
 * Needed as the counterpart to linking: a customer who loses access to a
 * Telegram account (or linked the wrong one) must be able to stop notifications
 * going there. The uid comes from the ID token, so nobody can unlink somebody
 * else's Telegram.
 *
 * POST /api/telegram/unlink
 *   headers: Authorization: Bearer <firebase id token>
 */

import { NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import { unlinkTelegramFromCustomer } from "@/lib/telegram/auth-service";
import { sendMessageSafe } from "@/lib/telegram/api-client";

export async function POST(req: Request) {
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
    // Read the chat id before clearing it so we can say goodbye in the chat,
    // which is the only place the customer will notice the change.
    const snapshot = await adminDb.collection("customers").doc(uid).get();
    const chatId = snapshot.exists
      ? (snapshot.data()?.telegramChatId as string | undefined)
      : undefined;

    if (!chatId) {
      return NextResponse.json({ success: true, alreadyUnlinked: true });
    }

    const unlinked = await unlinkTelegramFromCustomer(uid);
    if (!unlinked) {
      return NextResponse.json(
        { error: "Failed to disconnect Telegram" },
        { status: 500 },
      );
    }

    await sendMessageSafe(
      chatId,
      "🔌 <b>Account disconnected</b>\n\nThis Telegram account is no longer linked, so you will stop receiving order notifications here.\n\nYou can reconnect any time from your profile on our website.",
      { parse_mode: "HTML" },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("telegram/unlink failed:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Telegram" },
      { status: 500 },
    );
  }
}
