/**
 * Issue a Telegram deep link to the signed-in customer.
 *
 * This is the storefront-initiated half of account linking: the customer is
 * already authenticated here, so the token is bound to their uid and the bot
 * fills in the chat id when they tap through. See `generateWebLinkToken`.
 *
 * POST /api/telegram/link-code
 *   headers: Authorization: Bearer <firebase id token>
 *   -> { deepLink, botUsername, expiresAt, expiryMinutes }
 *
 * The token itself is returned only as part of `deepLink`; there is nothing the
 * client can do with it other than open Telegram.
 */

import { NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import { getMe } from "@/lib/telegram/api-client";
import {
  generateWebLinkToken,
  WEB_LINK_TOKEN_TTL_MINUTES,
} from "@/lib/telegram/auth-service";

/**
 * Bot username, cached for the life of the server process.
 *
 * It never changes in practice, and the alternative is a Telegram round-trip on
 * every page view of the profile screen.
 */
let cachedBotUsername: string | null = null;

async function resolveBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;

  try {
    const me = await getMe();
    cachedBotUsername = me?.username || null;
    return cachedBotUsername;
  } catch (error) {
    console.error("Could not resolve bot username:", error);
    return null;
  }
}

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

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: "Telegram is not configured on the server" },
      { status: 503 },
    );
  }

  const botUsername = await resolveBotUsername();
  if (!botUsername) {
    return NextResponse.json(
      { error: "Could not reach Telegram. Please try again." },
      { status: 502 },
    );
  }

  try {
    const { token, expiresAt } = await generateWebLinkToken(uid);

    return NextResponse.json({
      // `?start=` payloads are limited to 64 characters, which is why the token
      // is shorter than the bot-issued one.
      deepLink: `https://t.me/${botUsername}?start=link_${token}`,
      botUsername,
      expiresAt: expiresAt.toISOString(),
      expiryMinutes: WEB_LINK_TOKEN_TTL_MINUTES,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create link";
    console.error("telegram/link-code failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
