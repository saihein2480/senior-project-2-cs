/**
 * Customer cancellation requests, shared by the website and the Telegram bot.
 *
 * A request never cancels anything by itself: it writes a pending
 * `cancellationRequest` onto the order's `transactions` document, which the
 * owner approves or rejects on the POS cancellations page (the POS then runs its
 * own state machine, `lib/orderState.ts` there). Both entry points go through
 * `requestOrderCancellation`, so a request is checked against the same rules
 * whichever way the customer asks:
 *
 *  - POST /api/transactions/request-cancel (purchases page), by receipt number;
 *  - the bot's "Confirm" button, by online order reference.
 *
 * `evaluateCancellation` is those rules as a pure function, and is also what the
 * bot asks before it offers the button, so it never offers a cancellation the
 * server would refuse.
 *
 * What the order documents actually carry (checked against create-cod, the
 * MyanMyanPay webhook and the POS writers):
 *   transactions.status          pending (COD awaiting approval) | completed |
 *                                cancelled | refunded | partially_refunded | refund_rejected
 *   transactions.orderStatus     pending | packaging | delivering | delivered |
 *                                cancelled | fully_returned | partially_returned (optional)
 *   transactions.deliveryStatus  pending | confirmed | shipped | delivered | cancelled (COD)
 *   transactions.paymentMethod   cod | scan | wallet | cash
 *   transactions.cancelledAt / cancelReason / cancellationRefund   cancellation evidence
 *   onlineOrders.status          pending | paid | failed | payment_review | stock_conflict |
 *                                packaging | delivering | delivered | cancelled | ...
 *   onlineOrders.paymentStatus   PENDING | SUCCESS | FAILED | EXPIRED | AMOUNT_MISMATCH | REFUNDED
 * An unpaid QR order has an `onlineOrders` document but no transaction yet.
 *
 * Server only: Admin SDK.
 */

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { exceedsDocBudget } from "../documentBudget";
import { isSettledPaymentStatus } from "../mmpayCallback";
import {
  normalizePurchaseOrderStatus,
  type PurchaseOrderStatus,
} from "../orderLabels";

export type CancellationChannel = "web" | "telegram";

export type CancellationRefusalCode =
  /** No such order, or (by order reference) not this customer's. */
  | "not_found"
  /** By receipt number: the order exists but belongs to someone else. */
  | "not_owner"
  | "already_cancelled"
  | "already_pending"
  | "delivered"
  | "in_transit"
  /** Payment failed / under review / stock conflict: the shop sorts it out. */
  | "order_problem"
  /** QR order never paid: nothing to cancel, it lapses on its own. */
  | "not_paid_yet"
  /** QR payment arrived but its sale is not recorded yet. */
  | "payment_processing"
  /** Scan/wallet orders need the customer's payment QR for the refund. */
  | "needs_payment_proof"
  | "too_large"
  | "unavailable"
  | "error";

/**
 * Messages the website has always shown (kept word for word: the purchases page
 * displays `error` from the route as-is), plus the ones for checks added since.
 */
export const CANCELLATION_MESSAGES = {
  notConfigured: "Firebase Admin not configured",
  transactionNotFound: "Transaction not found",
  orderNotFound: "Order not found",
  notOwner: "Unauthorized: Transaction does not belong to this customer",
  alreadyCancelled: "Transaction is already cancelled or refunded",
  alreadyPending: "A cancellation request is already pending",
  delivered: "Cannot cancel delivered orders. Please request a refund instead.",
  needsPaymentProof:
    "QR code image is required for Scan/Wallet payment cancellations",
  tooLarge:
    "The uploaded image is too large to attach to this order. Please upload a smaller screenshot.",
  failed: "Failed to create cancellation request",
  submitted:
    "Cancellation request submitted successfully. Please wait for owner approval.",
  inTransit:
    "This order is already out for delivery, so it can no longer be cancelled. You can request a return once it has been delivered.",
  orderProblem:
    "This order has a payment or stock problem that the shop is handling, so it can't be cancelled here. Please contact the shop.",
  notPaidYet:
    "This order hasn't been paid yet, so there is nothing to cancel. An unpaid QR order is released automatically when its payment window closes.",
  paymentProcessing:
    "This order's payment is still being recorded. Please try again in a minute.",
} as const;

export type CancellationCheck =
  | {
      eligible: true;
      /** Lower-case payment method of the sale ("cod", "scan", ...). */
      paymentMethod: string;
      /** The order's state as the purchases page shows it. */
      displayStatus: PurchaseOrderStatus;
    }
  | {
      eligible: false;
      code: CancellationRefusalCode;
      /** Safe to show the customer. */
      message: string;
      httpStatus: number;
      displayStatus?: PurchaseOrderStatus;
    };

type Doc = Record<string, unknown>;

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

const KNOWN_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  "pending",
  "packaging",
  "delivering",
  "delivered",
  "failed",
  "cancelled",
  "fully_returned",
  "partially_returned",
];

/** The cancellation paths are the only writers of these fields. */
function hasCancellationEvidence(txn: Doc): boolean {
  return (
    present(txn.cancelledAt) ||
    present(txn.cancelReason) ||
    present(txn.cancellationRefund) ||
    lower(txn.status) === "cancelled" ||
    lower(txn.orderStatus) === "cancelled"
  );
}

/**
 * The order's state exactly as the purchases page derives it
 * (`resolvePurchaseOrderStatus` in app/account/purchases/page.tsx): cancellation
 * evidence first, then the transaction's explicit `orderStatus`, then the linked
 * online order's status, then the transaction's own status.
 */
export function resolveCustomerOrderStatus(
  txn: Doc | null,
  online: Doc | null | undefined,
): PurchaseOrderStatus {
  if (txn) {
    if (hasCancellationEvidence(txn)) return "cancelled";
    const explicit = lower(txn.orderStatus) as PurchaseOrderStatus;
    if (KNOWN_ORDER_STATUSES.includes(explicit)) return explicit;
  }
  if (online) {
    return normalizePurchaseOrderStatus(
      typeof online.status === "string" ? online.status : undefined,
      typeof online.paymentStatus === "string" ? online.paymentStatus : undefined,
    );
  }
  return normalizePurchaseOrderStatus(
    txn && typeof txn.status === "string" ? txn.status : undefined,
  );
}

function refuse(
  code: CancellationRefusalCode,
  message: string,
  httpStatus = 400,
  displayStatus?: PurchaseOrderStatus,
): CancellationCheck {
  return { eligible: false, code, message, httpStatus, displayStatus };
}

/**
 * May the customer ask to cancel this order?
 *
 * `transaction` is the order's `transactions` document, or null when it has
 * none yet (an online order that was never paid). `onlineOrder` is the linked
 * `onlineOrders` document when there is one.
 *
 * The checks the request route always made come first and keep their messages;
 * after them comes the purchases page's own rule (the Cancel button only shows
 * while the order is Pending or Packaging), so the route, the page and the bot
 * agree. The POS approves from the same states.
 */
export function evaluateCancellation(input: {
  transaction: Doc | null;
  onlineOrder?: Doc | null;
  /** A payment QR screenshot is attached (needed for scan/wallet orders). */
  hasPaymentProof?: boolean;
}): CancellationCheck {
  const txn = input.transaction;
  const online = input.onlineOrder ?? null;

  if (!txn) return evaluateWithoutSale(online);

  const displayStatus = resolveCustomerOrderStatus(txn, online);
  const status = lower(txn.status);

  if (
    status === "cancelled" ||
    status === "refunded" ||
    status === "partially_refunded" ||
    displayStatus === "cancelled"
  ) {
    return refuse("already_cancelled", CANCELLATION_MESSAGES.alreadyCancelled, 400, displayStatus);
  }

  const cancellationRequest = txn.cancellationRequest as { status?: unknown } | undefined;
  if (lower(cancellationRequest?.status) === "pending") {
    return refuse("already_pending", CANCELLATION_MESSAGES.alreadyPending, 400, displayStatus);
  }

  if (
    lower(txn.deliveryStatus) === "delivered" ||
    displayStatus === "delivered" ||
    displayStatus === "fully_returned" ||
    displayStatus === "partially_returned"
  ) {
    return refuse("delivered", CANCELLATION_MESSAGES.delivered, 400, displayStatus);
  }

  if (displayStatus === "delivering") {
    return refuse("in_transit", CANCELLATION_MESSAGES.inTransit, 400, displayStatus);
  }

  if (displayStatus === "failed") {
    return refuse("order_problem", CANCELLATION_MESSAGES.orderProblem, 400, displayStatus);
  }

  const paymentMethod = lower(txn.paymentMethod);
  if ((paymentMethod === "scan" || paymentMethod === "wallet") && !input.hasPaymentProof) {
    return refuse("needs_payment_proof", CANCELLATION_MESSAGES.needsPaymentProof, 400, displayStatus);
  }

  return { eligible: true, paymentMethod, displayStatus };
}

/** An online order with no sales transaction: there is nothing to cancel. */
function evaluateWithoutSale(online: Doc | null): CancellationCheck {
  if (!online) {
    return refuse("not_found", CANCELLATION_MESSAGES.orderNotFound, 404);
  }

  const status = lower(online.status);
  const paymentStatus = lower(online.paymentStatus);
  const displayStatus = normalizePurchaseOrderStatus(status, paymentStatus);

  if (/(cancelled|canceled|void)/.test(status) || /refund/.test(paymentStatus)) {
    return refuse("already_cancelled", CANCELLATION_MESSAGES.alreadyCancelled, 400, displayStatus);
  }
  if (
    /(fail|declined|expired|timeout|mismatch|stock_conflict|payment_review)/.test(
      `${status} ${paymentStatus}`,
    )
  ) {
    return refuse("order_problem", CANCELLATION_MESSAGES.orderProblem, 409, displayStatus);
  }
  if (isSettledPaymentStatus(paymentStatus) || status === "paid") {
    return refuse("payment_processing", CANCELLATION_MESSAGES.paymentProcessing, 409, displayStatus);
  }
  return refuse("not_paid_yet", CANCELLATION_MESSAGES.notPaidYet, 409, displayStatus);
}

/** The customer uid an order document names (`customer.uid`, or legacy `customerUid`). */
function ownerUids(data: Doc): string[] {
  const nested = (data.customer as { uid?: unknown } | undefined)?.uid;
  return [nested, data.customerUid].filter(
    (uid): uid is string => typeof uid === "string" && uid.length > 0,
  );
}

function isOwnedBy(data: Doc, uid: string): boolean {
  return !!uid && ownerUids(data).includes(uid);
}

/** A string that can be used as a Firestore document id. */
function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= 200 && !value.includes("/");
}

type LocatedOrder =
  | { kind: "missing" }
  | { kind: "not_owner" }
  | { kind: "no_sale"; onlineRef: DocumentReference; online: Doc }
  | {
      kind: "found";
      txnRef: DocumentReference;
      onlineRef: DocumentReference | null;
    };

/**
 * The sales transaction for an online order, found the way the POS finds it
 * (`findLinkedTransaction` in the POS): current orders point at the order with
 * `onlineOrderId`; some older COD transactions used the order id as their own
 * document id.
 */
export async function findLinkedTransaction(
  db: Firestore,
  onlineOrderId: string,
): Promise<{ ref: DocumentReference; data: Doc } | null> {
  if (!isDocumentId(onlineOrderId)) return null;

  const direct = await db.collection("transactions").doc(onlineOrderId).get();
  if (direct.exists) {
    const data = (direct.data() || {}) as Doc;
    if (!data.onlineOrderId || data.onlineOrderId === onlineOrderId) {
      return { ref: direct.ref, data };
    }
  }

  const linked = await db
    .collection("transactions")
    .where("onlineOrderId", "==", onlineOrderId)
    .limit(1)
    .get();
  if (!linked.empty) {
    return { ref: linked.docs[0].ref, data: (linked.docs[0].data() || {}) as Doc };
  }
  return null;
}

/** An online order by reference (document id, else its `orderId` field). */
async function findOnlineOrder(
  db: Firestore,
  orderRef: string,
): Promise<{ ref: DocumentReference; data: Doc } | null> {
  if (!isDocumentId(orderRef)) return null;

  const direct = await db.collection("onlineOrders").doc(orderRef).get();
  if (direct.exists) return { ref: direct.ref, data: (direct.data() || {}) as Doc };

  const byField = await db
    .collection("onlineOrders")
    .where("orderId", "==", orderRef)
    .limit(1)
    .get();
  if (!byField.empty) {
    return { ref: byField.docs[0].ref, data: (byField.docs[0].data() || {}) as Doc };
  }
  return null;
}

async function locateOrder(
  db: Firestore,
  params: { uid: string; transactionId?: string | number; orderRef?: string },
): Promise<LocatedOrder> {
  // By receipt number, as the purchases page sends it. Same query, and the
  // same "exists but not yours" answer, as the route always gave.
  if (params.transactionId !== undefined && params.transactionId !== "") {
    const snap = await db
      .collection("transactions")
      .where("transactionId", "==", params.transactionId)
      .limit(1)
      .get();
    if (snap.empty) return { kind: "missing" };

    const txnDoc = snap.docs[0];
    if (!isOwnedBy((txnDoc.data() || {}) as Doc, params.uid)) return { kind: "not_owner" };

    const onlineOrderId = (txnDoc.data() || {}).onlineOrderId;
    return {
      kind: "found",
      txnRef: txnDoc.ref,
      onlineRef: isDocumentId(onlineOrderId)
        ? db.collection("onlineOrders").doc(onlineOrderId)
        : null,
    };
  }

  // By online order reference (the bot). Someone else's order is reported as
  // missing, so references cannot be probed.
  const orderRef = (params.orderRef || "").trim();
  if (!orderRef) return { kind: "missing" };

  const online = await findOnlineOrder(db, orderRef);
  if (!online || !isOwnedBy(online.data, params.uid)) return { kind: "missing" };

  const txn = await findLinkedTransaction(db, online.ref.id);
  if (!txn) return { kind: "no_sale", onlineRef: online.ref, online: online.data };
  if (!isOwnedBy(txn.data, params.uid)) return { kind: "missing" };

  return { kind: "found", txnRef: txn.ref, onlineRef: online.ref };
}

export type OrderCancellationStatus =
  | { found: false }
  | {
      found: true;
      orderRef: string;
      /** Receipt number of the sale, when there is one. */
      transactionId: string | null;
      check: CancellationCheck;
    };

/**
 * Can this customer ask to cancel this order right now? For the bot's /cancel,
 * before it shows the confirmation. Scan/wallet orders come back as
 * `needs_payment_proof`: the bot cannot collect the QR screenshot the refund
 * needs, so those go through the website.
 */
export async function checkOrderCancellation(
  params: { uid: string; orderRef: string },
  deps: { db?: Firestore | null } = {},
): Promise<OrderCancellationStatus> {
  const db = deps.db === undefined ? adminDb : deps.db;
  if (!db || !params.uid) return { found: false };

  const located = await locateOrder(db, { uid: params.uid, orderRef: params.orderRef });
  if (located.kind === "missing" || located.kind === "not_owner") return { found: false };

  if (located.kind === "no_sale") {
    return {
      found: true,
      orderRef: located.onlineRef.id,
      transactionId: null,
      check: evaluateCancellation({ transaction: null, onlineOrder: located.online }),
    };
  }

  const [txnSnap, onlineSnap] = await Promise.all([
    located.txnRef.get(),
    located.onlineRef ? located.onlineRef.get() : Promise.resolve(null),
  ]);
  const txn = (txnSnap.data() || {}) as Doc;
  return {
    found: true,
    orderRef: located.onlineRef?.id || params.orderRef,
    transactionId: present(txn.transactionId) ? String(txn.transactionId) : txnSnap.id,
    check: evaluateCancellation({
      transaction: txn,
      onlineOrder: onlineSnap?.exists ? ((onlineSnap.data() || {}) as Doc) : null,
    }),
  };
}

export interface RequestOrderCancellationInput {
  /** The customer, from a verified ID token or the bot's linked chat. Never from a request body. */
  uid: string;
  /** Receipt number (`transactions.transactionId`), as the purchases page sends it. */
  transactionId?: string | number;
  /** Online order reference (`onlineOrders` id), as the bot holds it. */
  orderRef?: string;
  reason?: string;
  /** Validated image (data URL or store-hosted URL); required for scan/wallet. */
  qrCodeImage?: string;
  channel: CancellationChannel;
}

export type RequestOrderCancellationResult =
  | {
      ok: true;
      status: 200;
      message: string;
      transactionDocId: string;
      /** Receipt number of the sale. */
      transactionId: string;
      orderRef: string | null;
    }
  | {
      ok: false;
      status: number;
      code: CancellationRefusalCode;
      error: string;
    };

function failure(
  code: CancellationRefusalCode,
  error: string,
  status: number,
): RequestOrderCancellationResult {
  return { ok: false, code, error, status };
}

const DEFAULT_REASON: Record<CancellationChannel, string> = {
  web: "Customer requested cancellation",
  telegram: "Customer requested cancellation via Telegram",
};

/**
 * File a cancellation request for one of the customer's own orders.
 *
 * Idempotent: the check and the write run in one Firestore transaction, so a
 * second request (a double tap, a retried webhook, two tabs) finds the first
 * one pending and is refused with `already_pending` instead of overwriting it
 * and notifying the owner twice.
 *
 * Never throws; unexpected failures come back as `{ ok: false, status: 500 }`.
 */
export async function requestOrderCancellation(
  input: RequestOrderCancellationInput,
  deps: { db?: Firestore | null; notify?: boolean } = {},
): Promise<RequestOrderCancellationResult> {
  const db = deps.db === undefined ? adminDb : deps.db;
  if (!db) return failure("unavailable", CANCELLATION_MESSAGES.notConfigured, 500);
  if (!input.uid) return failure("not_found", CANCELLATION_MESSAGES.orderNotFound, 404);

  const byReceipt = input.transactionId !== undefined && input.transactionId !== "";

  try {
    const located = await locateOrder(db, input);
    if (located.kind === "missing") {
      return byReceipt
        ? failure("not_found", CANCELLATION_MESSAGES.transactionNotFound, 404)
        : failure("not_found", CANCELLATION_MESSAGES.orderNotFound, 404);
    }
    if (located.kind === "not_owner") {
      return failure("not_owner", CANCELLATION_MESSAGES.notOwner, 403);
    }
    if (located.kind === "no_sale") {
      const check = evaluateCancellation({ transaction: null, onlineOrder: located.online });
      return check.eligible
        ? failure("error", CANCELLATION_MESSAGES.failed, 500)
        : failure(check.code, check.message, check.httpStatus);
    }

    const { txnRef, onlineRef } = located;
    const requestedAt = new Date().toISOString();

    type Outcome =
      | { kind: "refused"; result: RequestOrderCancellationResult }
      | { kind: "created"; txn: Doc };

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const [txnSnap, onlineSnap] = await Promise.all([
        tx.get(txnRef),
        onlineRef ? tx.get(onlineRef) : Promise.resolve(null),
      ]);
      if (!txnSnap.exists) {
        return {
          kind: "refused",
          result: failure("not_found", CANCELLATION_MESSAGES.transactionNotFound, 404),
        };
      }

      const txn = (txnSnap.data() || {}) as Doc;
      const check = evaluateCancellation({
        transaction: txn,
        onlineOrder: onlineSnap?.exists ? ((onlineSnap.data() || {}) as Doc) : null,
        hasPaymentProof: !!input.qrCodeImage,
      });
      if (!check.eligible) {
        return {
          kind: "refused",
          result: failure(check.code, check.message, check.httpStatus),
        };
      }

      const customer = (txn.customer || {}) as { email?: unknown; displayName?: unknown };
      const cancellationRequest: Record<string, unknown> = {
        status: "pending",
        reason: input.reason || DEFAULT_REASON[input.channel],
        requestedAt,
        requestedBy: input.uid,
        customerEmail: typeof customer.email === "string" ? customer.email : "",
        customerName: typeof customer.displayName === "string" ? customer.displayName : "",
        channel: input.channel,
      };
      if (input.qrCodeImage) cancellationRequest.qrCodeImage = input.qrCodeImage;

      // The embedded QR image can push the document past Firestore's 1MiB
      // limit, which surfaces as "Property cancellationRequest contains an
      // invalid nested entity" — meaningless to a customer.
      if (exceedsDocBudget(txn, "cancellationRequest", cancellationRequest)) {
        return {
          kind: "refused",
          result: failure("too_large", CANCELLATION_MESSAGES.tooLarge, 413),
        };
      }

      tx.update(txnRef, {
        cancellationRequest,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { kind: "created", txn };
    });

    if (outcome.kind === "refused") return outcome.result;

    const txn = outcome.txn;
    const receipt = byReceipt
      ? String(input.transactionId)
      : present(txn.transactionId)
        ? String(txn.transactionId)
        : txnRef.id;

    if (deps.notify !== false) {
      await announceRequest(db, {
        receipt,
        transactionDocId: txnRef.id,
        txn,
        uid: input.uid,
        reason: input.reason,
        channel: input.channel,
      });
    }

    return {
      ok: true,
      status: 200,
      message: CANCELLATION_MESSAGES.submitted,
      transactionDocId: txnRef.id,
      transactionId: receipt,
      orderRef: onlineRef?.id ?? null,
    };
  } catch (error) {
    console.error("Error creating cancellation request:", error);
    return failure("error", CANCELLATION_MESSAGES.failed, 500);
  }
}

/** Owner bell + customer acknowledgement. Best effort: the request is saved. */
async function announceRequest(
  db: Firestore,
  params: {
    receipt: string;
    transactionDocId: string;
    txn: Doc;
    uid: string;
    reason?: string;
    channel: CancellationChannel;
  },
): Promise<void> {
  // Owner-facing: shows in the POS bell and routes to the cancellations page.
  try {
    await db.collection("notifications").add({
      type: "cancellation_request",
      title: "Order Cancellation Request",
      message:
        `Customer requested to cancel order #${params.receipt}` +
        (params.channel === "telegram" ? " (via Telegram)" : ""),
      link: "/owner/requests/cancellations",
      metadata: {
        transactionId: params.transactionDocId,
        orderId: params.receipt,
        channel: params.channel,
      },
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error creating owner notification for cancellation request:", error);
  }

  // So the customer is not left wondering whether it went through.
  try {
    const { notifyCustomer } = await import("../notifications/dispatch");
    await notifyCustomer({
      customerId: params.uid,
      event: {
        type: "cancellation_requested",
        order: {
          orderRef: params.receipt,
          totalAmount: Number(params.txn.total || 0),
          paymentMethod: String(params.txn.paymentMethod || ""),
          paymentStatus: String(params.txn.paymentStatus || ""),
        },
        reason: typeof params.reason === "string" ? params.reason : undefined,
      },
    });
  } catch (error) {
    console.error("Error acknowledging cancellation request to customer:", error);
  }
}
