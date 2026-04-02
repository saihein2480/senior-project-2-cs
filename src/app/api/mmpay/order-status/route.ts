import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/firebase-admin";

export async function GET(req: Request) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Server database is not configured" },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId") || "";
    if (!orderId) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    const orderSnap = await adminDb
      .collection("onlineOrders")
      .doc(orderId)
      .get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, unknown>;
    return NextResponse.json({
      orderId,
      status: order.status || "pending",
      paymentStatus: order.paymentStatus || "PENDING",
      updatedAt: order.updatedAt || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load order status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
