/**
 * Telegram Webhook Setup Endpoint
 * Helper endpoint to configure the webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { setWebhook, getWebhookInfo, deleteWebhook } from "../../../../lib/telegram/api-client";

const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get("action");

    if (action === "delete") {
      // Delete webhook
      await deleteWebhook();
      return NextResponse.json({
        success: true,
        message: "Webhook deleted successfully",
      });
    }

    if (action === "info") {
      // Get webhook info
      const info = await getWebhookInfo();
      return NextResponse.json({
        success: true,
        webhook: info,
      });
    }

    // Default: Set webhook
    if (!WEBHOOK_URL) {
      return NextResponse.json(
        {
          error: "TELEGRAM_WEBHOOK_URL is not configured in environment variables",
        },
        { status: 500 }
      );
    }

    await setWebhook(WEBHOOK_URL, WEBHOOK_SECRET);

    const info = await getWebhookInfo();

    return NextResponse.json({
      success: true,
      message: "Webhook configured successfully",
      webhook: info,
    });
  } catch (error) {
    console.error("❌ Setup webhook error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to setup webhook",
      },
      { status: 500 }
    );
  }
}
