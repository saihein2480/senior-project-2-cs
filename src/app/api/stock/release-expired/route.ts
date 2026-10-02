/**
 * Release stock reserved by online checkouts that were never paid.
 *
 * Reservations are normally released by MyanMyanPay's FAILED/EXPIRED callback
 * or the next create-order. This route is the backstop for quiet periods: an
 * abandoned checkout would otherwise keep the item unsellable at the POS until
 * the next online customer comes along. Point a scheduler at it every minute
 * or two (Vercel Cron, cron-job.org, a GitHub Action, ...).
 *
 * GET or POST /api/stock/release-expired
 *   headers: Authorization: Bearer <CRON_SECRET>
 *
 * Refuses every request while CRON_SECRET is unset. Vercel Cron sends this
 * header automatically when CRON_SECRET is defined in the project.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { adminDb } from "../../../../lib/firebase-admin";
import { releaseStaleReservations } from "../../../../lib/onlineStockService";

function isAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;

  const a = Buffer.from(match[1], "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json(
      { error: "Server database is not configured" },
      { status: 500 },
    );
  }

  try {
    const result = await releaseStaleReservations(adminDb);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to release reservations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
