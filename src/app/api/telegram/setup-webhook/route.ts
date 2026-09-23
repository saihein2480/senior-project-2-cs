/**
 * Telegram Webhook Setup Endpoint
 * Helper endpoint to configure the webhook.
 *
 * Guarded by `TELEGRAM_WEBHOOK_SECRET`, passed either as `?secret=` (convenient
 * from a browser) or an `x-telegram-webhook-secret` header. It used to be open:
 * `?action=delete` unregisters the webhook, so anyone who found the URL on the
 * deployed site could silently stop the bot from receiving anything.
 *
 * Usage once deployed:
 *   https://<domain>/api/telegram/setup-webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { setWebhook, getWebhookInfo, deleteWebhook } from "../../../../lib/telegram/api-client";

const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/** Constant-time comparison; fails closed when no secret is configured. */
function isAuthorised(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return false;

  const supplied =
    req.headers.get("x-telegram-webhook-secret") ||
    req.nextUrl.searchParams.get("secret") ||
    "";

  const a = Buffer.from(supplied);
  const b = Buffer.from(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json(
      {
        error:
          "Not authorised. Pass ?secret=<TELEGRAM_WEBHOOK_SECRET>, and make sure that variable is set on the server.",
      },
      { status: 401 },
    );
  }

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
