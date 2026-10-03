/**
 * Release stock reserved by online checkouts that were never paid.
 *
 * Reservations are normally released by MyanMyanPay's FAILED/EXPIRED callback,
 * by /api/mmpay/order-status once they are past their expiry, or by the next
 * create-order / create-cod (which sweep the customer's own open QR order plus
 * a small batch of anyone's expired ones). This route is the backstop for
 * quiet periods. vercel.json schedules it once a day, the most Vercel's Hobby
 * plan allows; on Pro, or with an external scheduler (cron-job.org, a GitHub
 * Action, ...), call it every few minutes.
 *
 * GET or POST /api/stock/release-expired
 *   headers: Authorization: Bearer <CRON_SECRET>
 *
 * Refuses every request while CRON_SECRET is unset. Vercel Cron sends this
 * header automatically when CRON_SECRET is defined in the project.
 */

import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/firebase-admin";
import { releaseStaleReservations } from "../../../../lib/onlineStockService";
import { safeEqual } from "../../../../lib/safeEqual";

/** Expired reservations released per call. */
const CRON_BATCH = 200;

function isAuthorised(req: Request): boolean {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  // Constant-time, and never true for an unset secret.
  return !!match && safeEqual(match[1].trim(), process.env.CRON_SECRET);
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
    const result = await releaseStaleReservations(adminDb, {
      globalLimit: CRON_BATCH,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("release-expired failed:", error);
    return NextResponse.json(
      { error: "Failed to release reservations" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
