import { NextResponse } from "next/server";
import { MMPaySDK } from "mmpay-node-sdk";
import { adminDb } from "../../../../lib/firebase-admin";
import { deductStockForPaidOnlineOrder } from "../../../../lib/onlineStockService";
import { updateCustomerStats, syncOnlineCustomerToPos } from "../../../../lib/updateCustomerStats";

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

  // Use stored values from onlineOrders document (calculated at checkout)
  const subtotal = Number(order.subtotal || 0) || txItems.reduce(
    (sum, item) =>
      sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );
  const tax = Number(order.tax || 0);
  const discount = Number(order.discount || 0);
  const couponDiscountTHB = Number(order.couponDiscountTHB || 0);
  const taxRate = Number(order.taxRate || 0);
  const total =
    Number(order.total || 0) || Math.max(0, subtotal - discount) + tax;

  const orderExchangeRate = Number(order.exchangeRate || 0);
  const envExchangeRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
  const exchangeRate =
    orderExchangeRate > 0
      ? orderExchangeRate
      : Number.isFinite(envExchangeRate) && envExchangeRate > 0
        ? envExchangeRate
        : 0;
  const hasExchangeRate = exchangeRate > 0;

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
    tax,
    taxRate,
    discount,
    total,
    amountPaid: total,
    change: 0,
    paymentMethod: (order.paymentMethod as string | undefined) || "scan",
    timestamp: new Date().toISOString(),
    createdAt: new Date(),
    status: "completed",
    sellingCurrency: "THB",
    ...(hasExchangeRate ? { exchangeRate } : {}),
    amountMmk: Number(order.amountMmk || payload.amount || 0),
    sellingTotal: Number(order.amountMmk || payload.amount || 0),
    paymentProvider: "MMPAY",
    orderSource: "web_storefront",
    customerUid: (order.customer as Record<string, unknown> | undefined)?.uid,
    // Add coupon information
    ...(order.couponCode
      ? {
          couponCode: order.couponCode,
          appliedCouponCode: order.couponCode,
          couponId: order.couponId,
          couponDiscountTHB,
        }
      : {}),
    paymentMeta: {
      method: payload.method,
      vendor: payload.vendor,
      status: payload.status,
      condition: payload.condition,
      transactionRefId: payload.transactionRefId || "",
    },
  });

  // Award loyalty points for successful payment
  const customerUid = (order.customer as Record<string, unknown> | undefined)?.uid;
  if (customerUid && typeof customerUid === 'string') {
    // Mark coupon as used if one was applied
    const couponId = order.couponId as string | undefined;
    const couponCode = order.couponCode as string | undefined;
    
    if (couponId && couponCode) {
      try {
        const { CouponService } = await import("@/lib/couponService");
        const couponUsed = await CouponService.useCouponAdmin(
          adminDb,
          customerUid,
          couponId,
          transactionId
        );

        if (couponUsed) {
          console.log("Coupon marked as used for MMPay order:", {
            orderId: payload.orderId,
            couponId,
            couponCode,
          });
        }
      } catch (couponError) {
        console.error("Error marking coupon as used for MMPay:", couponError);
      }
    }
    
    try {
      const { LoyaltyService } = await import("@/lib/loyaltyService");
      const loyaltyResult = await LoyaltyService.awardPoints({
        customerId: customerUid,
        transactionId,
        transactionAmount: subtotal,
        source: 'online',
        description: `Online payment for order ${payload.orderId}`,
      });

      if (loyaltyResult.success) {
        console.log("Loyalty points awarded for online payment:", {
          orderId: payload.orderId,
          points: loyaltyResult.pointsAwarded,
          newTotal: loyaltyResult.newTotalPoints,
          coupons: loyaltyResult.couponsGenerated.length,
        });
      }
    } catch (loyaltyError) {
      // Don't fail the transaction if loyalty fails
      console.error("Error awarding loyalty points for online payment:", loyaltyError);
    }
  }
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
        
        // Update customer statistics and sync to POS
        const orderDoc = await adminDb.collection("onlineOrders").doc(payload.orderId).get();
        if (orderDoc.exists) {
          const orderData = orderDoc.data();
          const customerUid = orderData?.customer?.uid;
          const orderTotal = Number(orderData?.total || payload.amount || 0);
          
          if (customerUid) {
            // Sync customer to POS customers collection if not already there
            await syncOnlineCustomerToPos(customerUid);
            
            // Update purchase statistics
            await updateCustomerStats(customerUid, orderTotal, 1);
          }
        }
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
