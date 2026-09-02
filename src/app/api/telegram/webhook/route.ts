/**
 * Telegram Webhook Handler
 * Receives and processes updates from Telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "../../../../lib/telegram/bot-service";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

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

    // Process update asynchronously
    handleTelegramUpdate(update).catch((error) => {
      console.error("❌ Error handling Telegram update:", error);
    });

    // Respond immediately to Telegram (required for webhooks)
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
