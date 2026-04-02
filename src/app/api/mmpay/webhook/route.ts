import { NextResponse } from "next/server";
import { MMPaySDK } from "mmpay-node-sdk";
import { adminDb } from "../../../../lib/firebase-admin";
import { deductStockForPaidOnlineOrder } from "../../../../lib/onlineStockService";

type MmpayPayload = {
  orderId: string;
  amount: number;
  currency?: string;
  method?: string;
  vendor?: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  condition?: "PRISTINE" | "TOUCHED" | "EXPIRED";
  transactionRefId?: string;
};

function getMmpay() {
  if (
    !process.env.MMPAY_APP_ID ||
    !process.env.MMPAY_PUBLISHABLE_KEY ||
    !process.env.MMPAY_SECRET_KEY ||
    !process.env.MMPAY_API_BASE_URL
  ) {
    return null;
  }

  const SDK = MMPaySDK as unknown as new (config: {
    appId: string;
    publishableKey: string;
    secretKey: string;
    apiBaseUrl: string;
  }) => {
    verifyCb: (
      payloadString: string,
      nonce: string,
      signature: string,
    ) => Promise<boolean>;
  };

  return new SDK({
    appId: process.env.MMPAY_APP_ID,
    publishableKey: process.env.MMPAY_PUBLISHABLE_KEY,
    secretKey: process.env.MMPAY_SECRET_KEY,
    apiBaseUrl: process.env.MMPAY_API_BASE_URL,
  });
}

async function createTransactionFromOnlineOrder(payload: MmpayPayload) {
  if (!adminDb || payload.status !== "SUCCESS") return;

  const orderDocRef = adminDb.collection("onlineOrders").doc(payload.orderId);
  const orderSnap = await orderDocRef.get();
  if (!orderSnap.exists) return;

  const order = orderSnap.data() as Record<string, unknown>;

  const transactionId = payload.transactionRefId || payload.orderId;
  const transactionDocRef = adminDb
    .collection("transactions")
    .doc(transactionId);
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

  const envExchangeRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
  const hasExchangeRate =
    Number.isFinite(envExchangeRate) && envExchangeRate > 0;

  await transactionDocRef.set({
    transactionId,
    source: "online",
    onlineOrderId: payload.orderId,
    customer: {
      uid: (order.customer as Record<string, unknown> | undefined)?.uid,
      email: (order.customer as Record<string, unknown> | undefined)?.email,
      displayName:
        ((order.customer as Record<string, unknown> | undefined)
          ?.displayName as string | undefined) || "Online Customer",
      phone:
        ((order.customer as Record<string, unknown> | undefined)?.phone as
          | string
          | undefined) || "",
      address:
        ((order.customer as Record<string, unknown> | undefined)?.address as
          | string
          | undefined) || "",
      customerType: "individual",
    },
    items: txItems,
    subtotal,
    tax: 0,
    discount: 0,
    total: subtotal,
    amountPaid: subtotal,
    change: 0,
    paymentMethod: "wallet",
    timestamp: new Date().toISOString(),
    createdAt: new Date(),
    status: "completed",
    sellingCurrency: "THB",
    ...(hasExchangeRate ? { exchangeRate: envExchangeRate } : {}),
    sellingTotal: Number(order.amountMmk || payload.amount || 0),
    paymentProvider: "MMPAY",
    paymentMeta: {
      method: payload.method,
      vendor: payload.vendor,
      status: payload.status,
      condition: payload.condition,
      transactionRefId: payload.transactionRefId || "",
    },
  });
}

export async function POST(req: Request) {
  try {
    const mmpay = getMmpay();
    if (!mmpay || !adminDb) {
      return NextResponse.json(
        { error: "Webhook is not configured" },
        { status: 500 },
      );
    }

    const rawBody = await req.text();
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = rawBody
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : {};
    } catch {
      parsedBody = {};
    }

    const payloadStringFromBody =
      typeof parsedBody?.payloadString === "string"
        ? parsedBody.payloadString
        : null;
    const payloadString = payloadStringFromBody || rawBody;

    const incomingSignature =
      req.headers.get("x-mmpay-signature") ||
      req.headers.get("sppay-x-signature") ||
      "";
    const incomingNonce =
      req.headers.get("x-mmpay-nonce") ||
      req.headers.get("sppay-x-nonce") ||
      "";

    if (!payloadString || !incomingSignature || !incomingNonce) {
      return NextResponse.json(
        {
          error:
            "Invalid callback request: missing payload, signature, or nonce",
        },
        { status: 400 },
      );
    }

    const isVerified = await mmpay.verifyCb(
      payloadString,
      incomingNonce,
      incomingSignature,
    );
    if (!isVerified) {
      return NextResponse.json(
        { error: "Callback verification failed" },
        { status: 400 },
      );
    }

    let payload: MmpayPayload;
    try {
      payload = JSON.parse(payloadString) as MmpayPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid callback payload JSON" },
        { status: 400 },
      );
    }

    await adminDb
      .collection("onlineOrders")
      .doc(payload.orderId)
      .set(
        {
          paymentStatus: payload.status,
          status:
            payload.status === "SUCCESS"
              ? "paid"
              : payload.status === "REFUNDED"
                ? "refunded"
                : payload.status === "FAILED"
                  ? "failed"
                  : "pending",
          callbackPayload: payload,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

    if (payload.status === "SUCCESS") {
      try {
        await deductStockForPaidOnlineOrder(adminDb, payload.orderId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to sync inventory";

        await adminDb.collection("onlineOrders").doc(payload.orderId).set(
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
    }

    await createTransactionFromOnlineOrder(payload);

    return NextResponse.json({ message: "Callback processed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "MMPay webhook endpoint is reachable" });
}
