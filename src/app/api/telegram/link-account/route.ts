/**
 * Telegram Account Linking API
 * Links a Telegram chat to the *authenticated* customer account.
 *
 * Security note — this is the only place a Telegram chat id gets attached to a
 * customer, and every notification we send to Telegram is addressed using that
 * field. So this route decides who receives a customer's order details.
 *
 * The uid is therefore taken from the caller's Firebase ID token, never from
 * the request body. It used to come from the body, which meant anyone holding a
 * link token could bind their own chat to any uid they cared to name and start
 * receiving that customer's order references, totals and delivery addresses.
 *
 * Two independent checks have to pass:
 *   1. the caller proves who they are (ID token), and
 *   2. the caller proves they control the Telegram chat (the one-time token the
 *      bot issued into that chat via /link).
 */

import { NextRequest, NextResponse } from "next/server";
import { getUidFromAuthHeader } from "../../../../lib/firebase-admin";
import { verifyLinkToken, linkTelegramToCustomer } from "../../../../lib/telegram/auth-service";
import { mergeTelegramCartWithCustomer } from "../../../../lib/telegram/cart-service";
import { sendMessageSafe } from "../../../../lib/telegram/api-client";
import { formatSuccess } from "../../../../lib/telegram/formatters";

export async function POST(req: NextRequest) {
  try {
    const { token, customerId: claimedCustomerId } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const customerId = await getUidFromAuthHeader(
      req.headers.get("authorization"),
    );

    if (!customerId) {
      return NextResponse.json(
        { error: "You must be signed in to link a Telegram account" },
        { status: 401 }
      );
    }

    // A body uid is tolerated for older clients but must agree with the token.
    // Disagreement means the caller is trying to link somebody else's account.
    if (claimedCustomerId && claimedCustomerId !== customerId) {
      console.warn(
        `Rejected Telegram link: authenticated ${customerId} tried to link as ${claimedCustomerId}`,
      );
      return NextResponse.json(
        { error: "You can only link Telegram to your own account" },
        { status: 403 }
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
