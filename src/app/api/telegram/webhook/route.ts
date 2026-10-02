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
import { safeEqual } from "../../../../lib/safeEqual";

/**
 * Telegram allows up to 60s to answer a webhook, and we now finish the work
 * before replying (see below), so give the function room to do it.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Fail closed. Anyone can POST to this URL, and an update is trusted to say
  // which chat it came from, so without the secret a forged update could act as
  // any linked customer. This used to skip the check when the variable was
  // unset. `setup-webhook` registers the webhook with this same secret, and
  // Telegram echoes it back in the header below on every delivery.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "❌ TELEGRAM_WEBHOOK_SECRET is not set; refusing Telegram webhook update",
    );
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503 }
    );
  }

  const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
  if (!safeEqual(secretToken, webhookSecret)) {
    console.error("❌ Missing or invalid webhook secret token");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
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
