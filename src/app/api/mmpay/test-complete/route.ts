import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/firebase-admin";
import { deductStockForPaidOnlineOrder } from "../../../../lib/onlineStockService";

type CompleteTestRequest = {
  orderId?: string;
};

type PaymentCallbackLike = {
  orderId: string;
  amount: number;
  status: "SUCCESS";
  method: string;
  vendor: string;
  condition: "TOUCHED";
  transactionRefId: string;
};

function isSandboxMode() {
  const explicitMode = (process.env.MMPAY_MODE || "").toLowerCase();
  if (explicitMode === "sandbox") return true;
  if (explicitMode === "production") return false;

  const isTestPublishable = (
    process.env.MMPAY_PUBLISHABLE_KEY || ""
  ).startsWith("pk_test_");
  const isTestSecret = (process.env.MMPAY_SECRET_KEY || "").startsWith(
    "sk_test_",
  );
  const baseUrl = (process.env.MMPAY_API_BASE_URL || "").toLowerCase();
  return isTestPublishable || isTestSecret || baseUrl.includes("sandbox");
}

async function createTransactionFromOnlineOrder(payload: PaymentCallbackLike) {
  if (!adminDb) return;

  const orderDocRef = adminDb.collection("onlineOrders").doc(payload.orderId);
  const orderSnap = await orderDocRef.get();
  if (!orderSnap.exists) return;

  const order = orderSnap.data() as Record<string, unknown>;
  const transactionDocRef = adminDb
    .collection("transactions")
    .doc(payload.transactionRefId);
  const existing = await transactionDocRef.get();
  if (existing.exists) return;

  const product = (order.product || {}) as Record<string, unknown>;
  const cartItems = Array.isArray(order.cartItems)
    ? (order.cartItems as Array<Record<string, unknown>>)
    : [];

  const txItems =
    cartItems.length > 0
      ? cartItems.map((item, index) => ({
          id:
            (item.productId as string | undefined) ||
            `${payload.orderId}-${index + 1}`,
          stockId:
            (item.productId as string | undefined) ||
            `${payload.orderId}-${index + 1}`,
          groupName:
            (item.productName as string | undefined) || "Online Product",
          unitPrice: Number(item.priceTHB || 0),
          originalPrice: Number(item.priceTHB || 0),
          quantity: Number(item.quantity || 1),
          selectedColor: (item.color as string | undefined) || "",
          selectedSize: (item.size as string | undefined) || "",
          image: (item.image as string | undefined) || "",
          shop: "online",
        }))
      : [
          {
            id: (product.productId as string | undefined) || payload.orderId,
            stockId:
              (product.productId as string | undefined) || payload.orderId,
            groupName:
              (product.productName as string | undefined) || "Online Product",
            unitPrice: Number(product.priceTHB || 0),
            originalPrice: Number(product.priceTHB || 0),
            quantity: Number(product.quantity || 1),
            selectedColor: (product.color as string | undefined) || "",
            selectedSize: (product.size as string | undefined) || "",
            image: (product.image as string | undefined) || "",
            shop: "online",
          },
        ];

  const subtotal = txItems.reduce(
    (sum, item) =>
      sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );

  await transactionDocRef.set({
    transactionId: payload.transactionRefId,
    source: "online",
    onlineOrderId: payload.orderId,
    customer: {
      uid: (order.customer as Record<string, unknown> | undefined)?.uid,
      email: (order.customer as Record<string, unknown> | undefined)?.email,
      displayName:
        ((order.customer as Record<string, unknown> | undefined)
          ?.displayName as string | undefined) || "Online Customer",
      customerType: "individual",
    },
    items: txItems,
    subtotal,
    tax: 0,
    discount: 0,
    total: subtotal,
    amountPaid: subtotal,
    change: 0,
    paymentMethod: "scan",
    timestamp: new Date().toISOString(),
    createdAt: new Date(),
    status: "completed",
    sellingCurrency: "THB",
    sellingTotal: Number(order.amountMmk || 0),
    paymentProvider: "MMPAY",
    paymentMeta: {
      method: payload.method,
      vendor: payload.vendor,
      status: payload.status,
      condition: payload.condition,
      transactionRefId: payload.transactionRefId,
      testCompleted: true,
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!isSandboxMode()) {
      return NextResponse.json(
        { error: "Test complete is only allowed in sandbox mode" },
        { status: 403 },
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: "Server database is not configured" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as CompleteTestRequest;
    const orderId = body?.orderId || "";
    if (!orderId) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    const orderDocRef = adminDb.collection("onlineOrders").doc(orderId);
    const orderSnap = await orderDocRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, unknown>;
    const payload: PaymentCallbackLike = {
      orderId,
      amount: Number(order.amountMmk || 0),
      status: "SUCCESS",
      method: "wallet",
      vendor: "MMPAY-SANDBOX",
      condition: "TOUCHED",
      transactionRefId: `TEST-${orderId}`,
    };

    await orderDocRef.set(
      {
        paymentStatus: "SUCCESS",
        status: "paid",
        callbackPayload: payload,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    try {
      await deductStockForPaidOnlineOrder(adminDb, orderId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync inventory";

      await orderDocRef.set(
        {
          status: "stock_conflict",
          stockDeductionStatus: "failed",
          stockDeductionError: message,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      return NextResponse.json({ error: message }, { status: 409 });
    }

    await createTransactionFromOnlineOrder(payload);

    return NextResponse.json({
      message: "Test payment marked as SUCCESS",
      orderId,
      transactionRefId: payload.transactionRefId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete test payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
