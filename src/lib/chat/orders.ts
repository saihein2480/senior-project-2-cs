import { adminDb } from "../firebase-admin";

/**
 * Order lookup for the chatbot.
 *
 * Reads the `transactions` collection — the same source as /account/purchases —
 * scoped to one customer uid. The previous implementation queried `onlineOrders`
 * by an `orderRef` field that does not exist on these documents, so it could
 * never find a real order.
 *
 * Eligibility mirrors the rules the customer already sees as buttons on the
 * purchases page and the hard checks in /api/transactions/request-cancel, so the
 * bot cannot promise something the API will then refuse.
 */

export type OrderStatus =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "failed"
  | "cancelled"
  | "fully_returned"
  | "partially_returned";

export interface ChatOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  color?: string;
  size?: string;
}

export interface ChatOrder {
  transactionId: string;
  orderRef?: string;
  orderStatus: OrderStatus;
  paymentStatus: string;
  paymentMethod: string;
  isCod: boolean;
  total: number;
  currency: string;
  amountMmk?: number;
  placedAt?: string;
  items: ChatOrderItem[];
  couponCode?: string;
  cancellationRequestStatus?: string;
  refundRequestStatus?: string;
  refundRequestType?: string;
  canCancel: boolean;
  cancelBlockedReason?: string;
  canReturn: boolean;
  returnBlockedReason?: string;
  /** Scan/wallet cancellations require a payment QR upload. */
  cancelNeedsPaymentProof: boolean;
}

function normalizeStatus(
  status?: string,
  paymentStatus?: string,
): OrderStatus {
  const combined = `${(status || "").toLowerCase()} ${(paymentStatus || "").toLowerCase()}`;

  if (/(fully_returned)/.test(combined)) return "fully_returned";
  if (/(partially_returned)/.test(combined)) return "partially_returned";
  if (/(packaging|packed|preparing)/.test(combined)) return "packaging";
  if (/(delivering|shipping|shipped|in_transit)/.test(combined)) {
    return "delivering";
  }
  if (/(delivered|fulfilled|received)/.test(combined)) return "delivered";
  if (/(fail|failed|error|declined|stock_conflict)/.test(combined)) {
    return "failed";
  }
  if (/(cancelled|canceled|void)/.test(combined)) return "cancelled";

  return "pending";
}

function resolveOrderStatus(data: Record<string, unknown>): OrderStatus {
  const explicit = (data.orderStatus as string | undefined)?.toLowerCase();
  const known: OrderStatus[] = [
    "pending",
    "packaging",
    "delivering",
    "delivered",
    "failed",
    "cancelled",
    "fully_returned",
    "partially_returned",
  ];

  if (explicit && (known as string[]).includes(explicit)) {
    return explicit as OrderStatus;
  }

  return normalizeStatus(
    data.status as string | undefined,
    data.paymentStatus as string | undefined,
  );
}

function toIsoString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function mapOrder(data: Record<string, unknown>): ChatOrder {
  const orderStatus = resolveOrderStatus(data);
  const paymentStatus = String(data.paymentStatus || data.status || "unknown");
  const paymentMethod = String(data.paymentMethod || "").toLowerCase();
  const isCod = paymentMethod === "cod";

  const cancellationRequestStatus = (
    data.cancellationRequest as { status?: string } | undefined
  )?.status;
  const refundRequest = data.refundRequest as
    | { status?: string; type?: string }
    | undefined;

  const items = ((data.items as Array<Record<string, unknown>>) || []).map(
    (item) => ({
      name: String(item.groupName || item.name || "Item"),
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || 0),
      color: item.selectedColor ? String(item.selectedColor) : undefined,
      size: item.selectedSize ? String(item.selectedSize) : undefined,
    }),
  );

  // --- Cancellation eligibility (mirrors request-cancel + purchases page) ---
  let canCancel = true;
  let cancelBlockedReason: string | undefined;

  if (orderStatus === "cancelled" || paymentStatus.toLowerCase() === "refunded") {
    canCancel = false;
    cancelBlockedReason = "this order is already cancelled or refunded";
  } else if (cancellationRequestStatus === "pending") {
    canCancel = false;
    cancelBlockedReason =
      "a cancellation request is already pending owner approval";
  } else if (
    data.deliveryStatus === "delivered" ||
    orderStatus === "delivered"
  ) {
    canCancel = false;
    cancelBlockedReason =
      "the order has been delivered, so a return/refund is the right route instead";
  } else if (orderStatus !== "pending" && orderStatus !== "packaging") {
    canCancel = false;
    cancelBlockedReason = `the order is already ${orderStatus.replace("_", " ")}`;
  }

  // --- Return eligibility (mirrors the purchases page buttons) ---
  const isPaidOrder = paymentMethod === "cash" || paymentMethod === "scan";
  const hasCancellationRefund = data.cancellationRefund !== undefined;

  let canReturn = false;
  let returnBlockedReason: string | undefined;

  if (refundRequest?.status === "pending") {
    returnBlockedReason = "a return/refund request is already pending review";
  } else if (
    orderStatus === "delivered" &&
    paymentStatus.toLowerCase() !== "refunded"
  ) {
    canReturn = true;
  } else if (orderStatus === "cancelled" && isPaidOrder && !hasCancellationRefund) {
    canReturn = true;
  } else if (orderStatus !== "delivered") {
    returnBlockedReason =
      "returns open once the order has been delivered";
  } else {
    returnBlockedReason = "this order has already been refunded";
  }

  return {
    transactionId: String(data.transactionId || ""),
    orderRef: data.onlineOrderId ? String(data.onlineOrderId) : undefined,
    orderStatus,
    paymentStatus,
    paymentMethod: paymentMethod || "unknown",
    isCod,
    total: Number(data.total || 0),
    currency: String(data.sellingCurrency || "THB"),
    amountMmk: data.amountMmk ? Number(data.amountMmk) : undefined,
    placedAt: toIsoString(data.timestamp) || toIsoString(data.createdAt),
    items,
    couponCode: (data.couponCode || data.appliedCouponCode) as
      | string
      | undefined,
    cancellationRequestStatus,
    refundRequestStatus: refundRequest?.status,
    refundRequestType: refundRequest?.type,
    canCancel,
    cancelBlockedReason,
    canReturn,
    returnBlockedReason,
    cancelNeedsPaymentProof:
      paymentMethod === "scan" || paymentMethod === "wallet",
  };
}

/**
 * Every order belonging to this customer, newest first.
 * Always scoped by uid — never by an order reference alone — so one customer can
 * never read another's order through the chatbot.
 */
export async function getCustomerOrders(
  customerUid: string,
  max = 10,
): Promise<ChatOrder[]> {
  if (!adminDb) return [];

  try {
    const snapshot = await adminDb
      .collection("transactions")
      .where("customer.uid", "==", customerUid)
      .get();

    const orders = snapshot.docs
      .map((doc) => mapOrder(doc.data() as Record<string, unknown>))
      .sort((a, b) => {
        const aTime = a.placedAt ? new Date(a.placedAt).getTime() : 0;
        const bTime = b.placedAt ? new Date(b.placedAt).getTime() : 0;
        return bTime - aTime;
      });

    return orders.slice(0, max);
  } catch (error) {
    console.error("Error loading customer orders for chat:", error);
    return [];
  }
}

/**
 * A single order, matched by transaction id or online order reference, still
 * scoped to the asking customer.
 */
export async function getCustomerOrderByRef(
  customerUid: string,
  reference: string,
): Promise<ChatOrder | null> {
  const orders = await getCustomerOrders(customerUid, 50);
  const needle = reference.trim().toLowerCase();

  return (
    orders.find(
      (order) =>
        order.transactionId.toLowerCase() === needle ||
        order.orderRef?.toLowerCase() === needle,
    ) ?? null
  );
}
