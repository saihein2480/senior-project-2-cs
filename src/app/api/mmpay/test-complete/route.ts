import { NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "../../../../lib/firebase-admin";
import {
  deductStockForPaidOnlineOrder,
  isStockShortageError,
} from "../../../../lib/onlineStockService";
import { announcePaidOnlineOrder } from "../../../../lib/notifications/orderPaid";
import { isSettledPaymentStatus } from "../../../../lib/mmpayCallback";
import {
  completePaidOrderExtras,
  recordOnlineSale,
  transactionDocIdFor,
} from "../../../../lib/mmpayPaidOrder";

/**
 * POST /api/mmpay/test-complete   body: { orderId }
 *   headers: Authorization: Bearer <firebase id token>
 *
 * Marks a sandbox QR order as paid without a real payment, for demos and
 * local testing. Because it creates a "paid" sale, it is fenced in:
 *   - only with sandbox MyanMyanPay keys,
 *   - only in `next dev`, or when NEXT_PUBLIC_MMPAY_TEST_MODE=true is set
 *     explicitly (e.g. a demo deployment),
 *   - only by the signed-in customer who placed the order,
 *   - only while the order is still unpaid.
 */
function isTestCompleteEnabled() {
  return (
    isSandboxMode() &&
    (process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_MMPAY_TEST_MODE === "true")
  );
}

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

export async function POST(req: Request) {
  try {
    if (!isTestCompleteEnabled()) {
      // 404, not 403: in production the endpoint should simply not exist.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

    const body = ((await req.json().catch(() => null)) ||
      {}) as CompleteTestRequest;
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId || orderId.length > 128 || orderId.includes("/")) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    const orderDocRef = adminDb.collection("onlineOrders").doc(orderId);
    const orderSnap = await orderDocRef.get();
    const order = (orderSnap.data() || {}) as Record<string, unknown>;
    const ownerUid = (order.customer as { uid?: unknown } | undefined)?.uid;

    // Someone else's order looks exactly like a missing one.
    if (!orderSnap.exists || ownerUid !== uid) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (isSettledPaymentStatus(order.paymentStatus)) {
      return NextResponse.json(
        { error: "This order is already paid or refunded" },
        { status: 409 },
      );
    }
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

      if (!isStockShortageError(error)) {
        console.error(`Stock deduction failed for test order ${orderId}:`, error);
      }

      // Stock shortages are explained to the customer; anything else is a
      // server fault whose text stays in the log.
      return NextResponse.json(
        {
          error: isStockShortageError(error)
            ? message
            : "Could not update stock for this order. Please try again.",
        },
        { status: 409 },
      );
    }

    // The same records the live callback writes: the sale, then the coupon,
    // the points (once, guarded by `loyaltyAward`) and the saved cart. The
    // sale is `TXN-<orderId>` like a live one; the fake gateway reference
    // above only goes into `paymentMeta.transactionRefId`.
    const transactionDocId = transactionDocIdFor(payload);
    await recordOnlineSale(adminDb, payload, {
      transactionDocId,
      paymentMetaExtra: { testCompleted: true },
    });
    await completePaidOrderExtras(adminDb, {
      orderId,
      transactionDocId,
    });

    // Same announcement the live callback makes: the owner's POS bell entry plus
    // the customer's email, Telegram and storefront notification. Without this
    // the sandbox flow silently skipped both.
    await announcePaidOnlineOrder(adminDb, {
      orderId,
      fallbackAmount: payload.amount,
      fallbackPaymentMethod: payload.method || "MMPAY",
    });

    return NextResponse.json({
      message: "Test payment marked as SUCCESS",
      orderId,
      transactionId: transactionDocId,
      transactionRefId: payload.transactionRefId,
    });
  } catch (error) {
    console.error("Failed to complete test payment:", error);
    return NextResponse.json(
      { error: "Failed to complete test payment" },
      { status: 500 },
    );
  }
}
