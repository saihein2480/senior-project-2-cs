/**
 * Telegram Webhook Handler
 * Receives and processes updates from Telegram.
 *
 * This is the only delivery mode that works in production: the long-polling
 * script in src/scripts/telegram-bot-polling.ts needs a process that stays
 * alive, which a serverless platform does not give us.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "../../../../lib/telegram/bot-service";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/**
 * Telegram allows up to 60s to answer a webhook, and we now finish the work
 * before replying (see below), so give the function room to do it.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret token
    const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
    
    if (WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET) {
      console.error("❌ Invalid webhook secret token");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse update from Telegram
    const update = await req.json();
    
    console.log("📨 Received Telegram update:", {
      updateId: update.update_id,
      hasMessage: !!update.message,
      hasCallbackQuery: !!update.callback_query,
    });

    // Await it. This used to be fire-and-forget, which works on a long-lived
    // server but not on serverless: the moment the response is returned the
    // function can be frozen or torn down, so the reply to the customer would
    // never be sent. Telegram's 60s budget is far more than a Firestore read
    // plus a sendMessage needs.
    await handleTelegramUpdate(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    
    // Still return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Telegram webhook endpoint",
    message: "Use POST to send updates",
  });
}
