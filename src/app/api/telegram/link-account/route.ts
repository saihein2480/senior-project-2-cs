/**
 * Telegram Account Linking API
 * Links Telegram account with customer account
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyLinkToken, linkTelegramToCustomer } from "../../../../lib/telegram/auth-service";
import { mergeTelegramCartWithCustomer } from "../../../../lib/telegram/cart-service";
import { sendMessageSafe } from "../../../../lib/telegram/api-client";
import { formatSuccess } from "../../../../lib/telegram/formatters";

export async function POST(req: NextRequest) {
  try {
    const { token, customerId } = await req.json();

    if (!token || !customerId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify token
    const verification = await verifyLinkToken(token, customerId);

    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || "Invalid token" },
        { status: 400 }
      );
    }

    const telegramChatId = verification.telegramChatId!;

    // Link accounts
    const linked = await linkTelegramToCustomer(customerId, {
      chatId: telegramChatId,
    });

    if (!linked) {
      return NextResponse.json(
        { error: "Failed to link accounts" },
        { status: 500 }
      );
    }

    // Merge Telegram cart with customer cart
    await mergeTelegramCartWithCustomer(telegramChatId, customerId);

    // Send confirmation message to Telegram
    await sendMessageSafe(
      telegramChatId,
      formatSuccess(
        "Your account has been linked successfully\\!\n\n" +
        "You'll now receive order updates and notifications via Telegram\\.\n\n" +
        "Use /profile to view your account details\\."
      )
    );

    return NextResponse.json({
      success: true,
      message: "Account linked successfully",
    });
  } catch (error) {
    console.error("Link account error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to link account",
      },
      { status: 500 }
    );
  }
}
