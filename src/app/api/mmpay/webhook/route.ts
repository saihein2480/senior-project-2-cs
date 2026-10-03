import { NextResponse } from "next/server";
import { MMPaySDK } from "mmpay-node-sdk";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "../../../../lib/firebase-admin";
import {
  deductStockForPaidOnlineOrder,
  isStockShortageError,
  releaseStockReservation,
} from "../../../../lib/onlineStockService";
import { announcePaidOnlineOrder } from "../../../../lib/notifications/orderPaid";
import {
  completePaidOrderExtras,
  recordOnlineSale,
  transactionDocIdFor,
} from "../../../../lib/mmpayPaidOrder";
import {
  isSettledPaymentStatus,
  orderStatusFor,
  shouldApplyCallback,
  type MmpayCallbackStatus,
} from "../../../../lib/mmpayCallback";

type MmpayPayload = {
  orderId: string;
  amount: number;
  currency?: string;
  method?: string;
  vendor?: string;
  status: MmpayCallbackStatus;
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

type CallbackDecision =
  | { kind: "unknown_order" }
  | {
      kind: "already_handled";
      reason: "already_recorded" | "stock_conflict" | "payment_review";
      /** The sale exists but the paid announcement never went out. */
      announcementPending: boolean;
    }
  | { kind: "amount_mismatch"; expectedMmk: number; receivedMmk: number }
  | { kind: "ignored"; reason: string }
  | { kind: "applied" };

/**
 * Read the order (and, for SUCCESS, its sales transaction) and decide what this
 * callback does, writing the order's new state in the same transaction.
 *
 * Doing the read and the write together means two deliveries of the same
 * callback racing each other cannot both act on the same stale state, e.g.
 * both raise an amount-mismatch notification.
 */
async function decideCallback(
  db: Firestore,
  payload: MmpayPayload,
): Promise<CallbackDecision> {
  const orderRef = db.collection("onlineOrders").doc(payload.orderId);
  const transactionDocRef = db
    .collection("transactions")
    .doc(transactionDocIdFor(payload));

  return db.runTransaction<CallbackDecision>(async (tx) => {
    const [orderSnap, transactionSnap] = await Promise.all([
      tx.get(orderRef),
      payload.status === "SUCCESS" ? tx.get(transactionDocRef) : null,
    ]);

    if (!orderSnap.exists) return { kind: "unknown_order" };

    const currentOrder = (orderSnap.data() || {}) as Record<string, unknown>;
    const currentPaymentStatus = currentOrder.paymentStatus;
    const currentStatus = currentOrder.status;
    const nowIso = new Date().toISOString();

    if (payload.status === "SUCCESS") {
      // Repeated SUCCESS deliveries: acknowledge, change nothing.
      if (transactionSnap?.exists) {
        return {
          kind: "already_handled",
          reason: "already_recorded",
          announcementPending:
            String(currentPaymentStatus || "").toUpperCase() === "SUCCESS" &&
            !currentOrder.paidNotifiedAt,
        };
      }
      if (currentStatus === "stock_conflict" || currentStatus === "payment_review") {
        return {
          kind: "already_handled",
          reason: currentStatus,
          announcementPending: false,
        };
      }

      // The signature proves MyanMyanPay sent this, not that the customer paid
      // what the order costs. The QR amount comes from our own server-side
      // total, so a SUCCESS for any other amount is never treated as payment:
      // it is parked for the owner to review instead of becoming a sale.
      if (!isSettledPaymentStatus(currentPaymentStatus)) {
        const expectedMmk = Math.round(Number(currentOrder.amountMmk));
        const receivedMmk = Math.round(Number(payload.amount));

        if (
          !Number.isFinite(expectedMmk) ||
          !Number.isFinite(receivedMmk) ||
          expectedMmk <= 0 ||
          expectedMmk !== receivedMmk
        ) {
          tx.set(
            orderRef,
            {
              paymentStatus: "AMOUNT_MISMATCH",
              status: "payment_review",
              callbackPayload: payload,
              amountMismatch: {
                expectedMmk: Number.isFinite(expectedMmk) ? expectedMmk : null,
                receivedMmk: Number.isFinite(receivedMmk) ? receivedMmk : null,
                receivedAt: nowIso,
              },
              updatedAt: nowIso,
            },
            { merge: true },
          );

          tx.create(db.collection("notifications").doc(), {
            type: "online_order",
            title: "Payment needs review",
            message: `Order #${payload.orderId}: MyanMyanPay reported ${Number.isFinite(receivedMmk) ? receivedMmk.toLocaleString() : "an unknown amount"} MMK, but the order total is ${Number.isFinite(expectedMmk) ? expectedMmk.toLocaleString() : "unknown"} MMK. The order was not marked paid.`,
            link: "/owner/sales/online-orders",
            metadata: { orderId: payload.orderId },
            read: false,
            createdAt: new Date(),
          });

          return { kind: "amount_mismatch", expectedMmk, receivedMmk };
        }
      }
    }

    // A late QR expiry / failure must not overwrite a settled order, nor one
    // parked for review after money moved for the wrong amount.
    const parkedForReview =
      currentStatus === "payment_review" &&
      !isSettledPaymentStatus(payload.status);

    if (parkedForReview || !shouldApplyCallback(currentPaymentStatus, payload.status)) {
      const reason = parkedForReview
        ? "Order is awaiting payment review"
        : `Order already settled as ${currentPaymentStatus}`;

      // Keep the evidence without touching the order's state, so a late QR
      // expiry is still auditable. `updatedAt` is deliberately left alone: it
      // drives the owner's ordering, and this event changed nothing.
      tx.set(
        orderRef,
        { ignoredCallback: { payload, reason, receivedAt: nowIso } },
        { merge: true },
      );
      return { kind: "ignored", reason };
    }

    tx.set(
      orderRef,
      {
        paymentStatus: payload.status,
        status: orderStatusFor(payload.status),
        callbackPayload: payload,
        updatedAt: nowIso,
      },
      { merge: true },
    );
    return { kind: "applied" };
  });
}

/**
 * Mark a paid order whose stock could not be taken, and tell the owner.
 *
 * Runs in a transaction so concurrent deliveries record it, and notify, once.
 * Returns true when this call recorded it, false when it already was.
 */
async function recordStockConflict(
  db: Firestore,
  orderId: string,
  detail: string,
): Promise<boolean> {
  const orderRef = db.collection("onlineOrders").doc(orderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return false;

    const order = (snap.data() || {}) as Record<string, unknown>;
    if (order.status === "stock_conflict") return false;

    const nowIso = new Date().toISOString();
    tx.set(
      orderRef,
      {
        status: "stock_conflict",
        stockDeductionStatus: "failed",
        stockDeductionError: detail,
        stockConflictAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true },
    );

    tx.create(db.collection("notifications").doc(), {
      type: "online_order",
      title: "Paid order needs attention",
      message: `Order #${orderId} was paid through MyanMyanPay, but its stock could not be taken (the items may have sold out). Refund the customer, or restock the items and fulfil the order.`,
      link: "/owner/sales/online-orders",
      metadata: { orderId },
      read: false,
      // Server timestamp, like the paid-order notification: the POS orders
      // the bell by this field.
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
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

    if (!payload?.orderId || typeof payload.orderId !== "string") {
      return NextResponse.json(
        { error: "Callback payload has no orderId" },
        { status: 400 },
      );
    }

    // Our order ids never contain "/", so such an id cannot be one of ours.
    // Answered like any other unknown order: 200, so it is not retried forever.
    if (payload.orderId.includes("/")) {
      console.warn(`MMPay callback with malformed orderId ${payload.orderId}`);
      return NextResponse.json({ ok: true, applied: false, reason: "unknown_order" });
    }

    const db = adminDb;
    const decision = await decideCallback(db, payload);

    switch (decision.kind) {
      case "unknown_order":
        // A signed callback for an order we never created: nothing was
        // recorded (a merge-write would create a stray order) but answer 200
        // so it is not retried forever.
        console.warn(`MMPay callback for unknown order ${payload.orderId}`);
        return NextResponse.json({ ok: true, applied: false, reason: "unknown_order" });

      case "already_handled":
        // A repeated SUCCESS for an order that already has its sale, or that
        // is parked for the owner. Nothing is rewritten: re-applying it used
        // to flip a stock conflict back to "paid" on every retry.
        console.warn(
          `Ignoring repeated SUCCESS callback for ${payload.orderId}: ${decision.reason}`,
        );
        if (decision.reason === "already_recorded") {
          // An earlier delivery may have stopped between recording the sale
          // and the coupon / points / cart steps. Each is idempotent (the
          // points via the `loyaltyAward` marker), so finishing them here
          // cannot apply anything twice.
          await completePaidOrderExtras(db, {
            orderId: payload.orderId,
            transactionDocId: transactionDocIdFor(payload),
          });
        }
        if (decision.announcementPending) {
          // An earlier delivery recorded the sale but did not get as far as
          // telling anyone. Idempotent: does nothing once announced.
          await announcePaidOnlineOrder(db, {
            orderId: payload.orderId,
            fallbackAmount: payload.amount,
            fallbackPaymentMethod: payload.method || "MMPAY",
          });
        }
        return NextResponse.json({ ok: true, applied: false, reason: decision.reason });

      case "amount_mismatch":
        console.error(
          `MMPay amount mismatch for ${payload.orderId}: expected ${decision.expectedMmk}, received ${decision.receivedMmk}`,
        );
        return NextResponse.json({ ok: true, applied: false, reason: "amount_mismatch" });

      case "ignored":
        console.warn(
          `Ignoring ${payload.status} callback for ${payload.orderId}: ${decision.reason}`,
        );
        // Still a 200: the callback was received and understood. Anything else
        // makes MyanMyanPay retry it indefinitely.
        return NextResponse.json({ ok: true, applied: false });

      case "applied":
        break;
    }

    if (payload.status === "SUCCESS") {
      let deduction: Awaited<ReturnType<typeof deductStockForPaidOnlineOrder>>;
      try {
        deduction = await deductStockForPaidOnlineOrder(db, payload.orderId);
      } catch (error) {
        // Anything other than "the shelf is short" (a Firestore timeout,
        // contention, ...) is rethrown: the 500 makes MyanMyanPay retry, and
        // the retry finds the order paid without a sale and tries again.
        if (!isStockShortageError(error)) throw error;

        // Paid, but the stock is gone. Retrying cannot fix that, so record it
        // once, tell the owner once, and acknowledge. No sale, points or
        // coupon use until someone resolves it.
        const firstReport = await recordStockConflict(
          db,
          payload.orderId,
          error.message,
        );
        console.error(
          `MMPay order ${payload.orderId} paid but stock could not be taken${firstReport ? "" : " (already recorded)"}:`,
          error.message,
        );
        return NextResponse.json({ ok: true, applied: false, reason: "stock_conflict" });
      }

      // The order's payment state changed between our write and the
      // deduction (e.g. a REFUNDED callback): do not record a sale for it.
      if (deduction.reason === "payment_not_success") {
        console.warn(
          `Not recording a sale for ${payload.orderId}: payment is no longer SUCCESS`,
        );
        return NextResponse.json({ ok: true, applied: false, reason: "payment_not_success" });
      }
    }

    // The QR lapsed or the payment failed: give the reserved stock and the
    // coupon back so other buyers and the POS can sell it. A later SUCCESS
    // for the same order takes the stock again (see
    // deductStockForPaidOnlineOrder) or is recorded as a stock conflict.
    if (payload.status === "FAILED" || payload.status === "EXPIRED") {
      try {
        await releaseStockReservation(
          adminDb,
          payload.orderId,
          `payment_${payload.status.toLowerCase()}`,
        );
      } catch (error) {
        console.error(
          `Failed to release stock reservation for ${payload.orderId}:`,
          error,
        );
      }
    }

    // Only reached for SUCCESS once the stock has been taken (or was already
    // taken by an earlier delivery): record the sale, then the coupon, the
    // points (once, guarded by `loyaltyAward`) and the saved cart, then
    // announce. Shared with the sandbox route so both behave alike.
    if (payload.status === "SUCCESS") {
      const transactionDocId = transactionDocIdFor(payload);
      await recordOnlineSale(db, payload, { transactionDocId });
      await completePaidOrderExtras(db, {
        orderId: payload.orderId,
        transactionDocId,
      });
      await announcePaidOnlineOrder(db, {
        orderId: payload.orderId,
        fallbackAmount: payload.amount,
        fallbackPaymentMethod: payload.method || "MMPAY",
      });
    }

    return NextResponse.json({ message: "Callback processed" });
  } catch (error) {
    // The detail stays in the server log; MyanMyanPay only needs the status.
    console.error("MMPay webhook failed:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "MMPay webhook endpoint is reachable" });
}
