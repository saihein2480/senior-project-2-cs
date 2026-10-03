import { NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "../../../../lib/firebase-admin";
import {
  expireUnpaidOrder,
  isPastReservationExpiry,
} from "../../../../lib/onlineStockService";

/**
 * GET /api/mmpay/order-status?orderId=<id>
 *   headers: Authorization: Bearer <firebase id token>
 *
 * Polled by the checkout page while a QR is open. Only the customer who placed
 * the order may read its status; anyone else gets the same 404 as a missing
 * order, so order ids cannot be probed.
 *
 * The expiry is enforced here, not only by the page's countdown: an unpaid QR
 * order past `stockReservationExpiresAt` is released on the spot (stock,
 * coupon, open-checkout slot) and reported as EXPIRED. Idempotent; a payment
 * that still arrives afterwards is handled by the webhook as a late payment.
 */
export async function GET(req: Request) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Server database is not configured" },
        { status: 500 },
      );
    }

    const uid = await getUidFromAuthHeader(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = (searchParams.get("orderId") || "").trim();
    if (!orderId || orderId.length > 128 || orderId.includes("/")) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    const orderSnap = await adminDb
      .collection("onlineOrders")
      .doc(orderId)
      .get();

    let order = (orderSnap.data() || {}) as Record<string, unknown>;
    const ownerUid = (order.customer as { uid?: unknown } | undefined)?.uid;

    if (!orderSnap.exists || ownerUid !== uid) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const stillOpen =
      order.stockReservationStatus === "reserved" ||
      String(order.paymentStatus || "PENDING").toUpperCase() === "PENDING";
    if (stillOpen && isPastReservationExpiry(order)) {
      try {
        const result = await expireUnpaidOrder(adminDb, orderId);
        if (result.released || result.expired) {
          const fresh = await adminDb.collection("onlineOrders").doc(orderId).get();
          order = (fresh.data() || order) as Record<string, unknown>;
        }
      } catch (error) {
        // Still answer with what is stored; the next poll, checkout or the
        // cron releases it.
        console.error(`Could not expire order ${orderId}:`, error);
      }
    }

    return NextResponse.json({
      orderId,
      status: order.status || "pending",
      paymentStatus: order.paymentStatus || "PENDING",
      updatedAt: order.updatedAt || null,
      expiresAt: order.stockReservationExpiresAt || null,
    });
  } catch (error) {
    console.error("Error loading order status:", error);
    return NextResponse.json(
      { error: "Failed to load order status" },
      { status: 500 },
    );
  }
}
