import { NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "../../../../lib/firebase-admin";

/**
 * GET /api/mmpay/order-status?orderId=<id>
 *   headers: Authorization: Bearer <firebase id token>
 *
 * Polled by the checkout page while a QR is open. Only the customer who placed
 * the order may read its status; anyone else gets the same 404 as a missing
 * order, so order ids cannot be probed.
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
    if (!orderId || orderId.includes("/")) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    const orderSnap = await adminDb
      .collection("onlineOrders")
      .doc(orderId)
      .get();

    const order = (orderSnap.data() || {}) as Record<string, unknown>;
    const ownerUid = (order.customer as { uid?: unknown } | undefined)?.uid;

    if (!orderSnap.exists || ownerUid !== uid) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      orderId,
      status: order.status || "pending",
      paymentStatus: order.paymentStatus || "PENDING",
      updatedAt: order.updatedAt || null,
    });
  } catch (error) {
    console.error("Error loading order status:", error);
    return NextResponse.json(
      { error: "Failed to load order status" },
      { status: 500 },
    );
  }
}
