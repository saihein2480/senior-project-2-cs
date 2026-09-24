/**
 * Customer-facing wording for order state.
 *
 * Stored values are internal tokens — `pending`, `SUCCESS`, `fully_returned`,
 * `scan` — written by two generations of checkout and by the POS. They are not
 * fit to show anyone. These helpers are the single vocabulary for turning them
 * into words, shared by the purchase history page and the Telegram bot so the
 * two never disagree about what an order's state is called.
 */

export type PurchaseOrderStatus =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "failed"
  | "cancelled"
  | "fully_returned"
  | "partially_returned";

export type NormalisedPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "pending_refund"
  | "refund_rejected"
  | "unknown";

/**
 * Collapse the stored order/payment state onto the fulfilment path.
 *
 * Both fields are consulted because neither is reliable alone: a paid order may
 * carry `status: "paid"` with the real progress only in `paymentStatus`, and a
 * returned order records the return in `status`.
 */
export function normalizePurchaseOrderStatus(
  status?: string,
  paymentStatus?: string,
): PurchaseOrderStatus {
  const combined = `${(status || "").toLowerCase()} ${(paymentStatus || "").toLowerCase()}`;

  if (/(packaging|packed|preparing)/.test(combined)) return "packaging";
  if (/(delivering|shipping|shipped|in_transit)/.test(combined)) {
    return "delivering";
  }
  if (/(delivered|fulfilled|received)/.test(combined)) return "delivered";
  if (/(fail|failed|error|declined|stock_conflict)/.test(combined)) {
    return "failed";
  }
  if (/(fully_returned)/.test(combined)) {
    return "fully_returned";
  }
  if (/(partially_returned)/.test(combined)) {
    return "partially_returned";
  }
  if (/(cancelled|canceled|void)/.test(combined)) {
    return "cancelled";
  }

  // Paid/successful payment starts the fulfillment workflow from pending.
  return "pending";
}

export function getPurchaseOrderStatusLabel(status: PurchaseOrderStatus) {
  if (status === "pending") return "Pending";
  if (status === "packaging") return "Packaging";
  if (status === "delivering") return "Delivering";
  if (status === "delivered") return "Delivered";
  if (status === "failed") return "Failed";
  if (status === "fully_returned") return "Fully Returned";
  if (status === "partially_returned") return "Partially Returned";
  return "Cancelled";
}

export function normalizePaymentStatus(
  status?: string,
  paymentStatus?: string,
): NormalisedPaymentStatus {
  // First check paymentStatus field if available (for COD and online orders)
  if (paymentStatus) {
    const ps = paymentStatus.toLowerCase();
    if (/(success|succeeded|paid|completed)/.test(ps)) return "paid";
    if (/(pending_refund)/.test(ps)) return "pending_refund";
    if (/(refund_rejected)/.test(ps)) return "refund_rejected";
    if (/(partially_refunded|partial)/.test(ps)) return "partially_refunded";
    if (/(refunded)/.test(ps)) return "refunded";
    if (/(pending|processing|created|initiated)/.test(ps)) return "pending";
    if (/(fail|failed|error|declined|stock_conflict)/.test(ps)) return "failed";
    if (/(cancelled|canceled|void)/.test(ps)) return "cancelled";
  }

  // Fallback to status field
  const raw = (status || "").toLowerCase();

  if (/(success|succeeded|paid|completed)/.test(raw)) return "paid";
  if (/(pending_refund)/.test(raw)) return "pending_refund";
  if (/(refund_rejected)/.test(raw)) return "refund_rejected";
  if (/(pending|processing|created|initiated)/.test(raw)) return "pending";
  if (/(fail|failed|error|declined|stock_conflict)/.test(raw)) {
    return "failed";
  }
  if (/(cancelled|canceled|void)/.test(raw)) return "cancelled";
  // Check for partially_refunded BEFORE refunded to avoid false match
  if (/(partially_refunded|partial)/.test(raw)) return "partially_refunded";
  if (/(refunded)/.test(raw)) return "refunded";

  return "unknown";
}

/**
 * Last resort for a token no branch above recognises.
 *
 * Internal values are snake_case, so a plain capitalise leaves things like
 * "No_refund_needed" on screen — which is how `no_refund_needed` was being shown.
 */
function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function getPaymentStatusLabel(status?: string, paymentStatus?: string) {
  // Prioritize paymentStatus field, then fall back to status
  const normalized = normalizePaymentStatus(status, paymentStatus);
  if (normalized === "paid") return "Paid";
  if (normalized === "pending_refund") return "Pending Refund";
  if (normalized === "refund_rejected") return "Refund Rejected";
  if (normalized === "pending") return "Pending";
  if (normalized === "failed") return "Failed";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "refunded") return "Fully Refunded";
  if (normalized === "partially_refunded") return "Partially Refunded";

  return titleCase(paymentStatus || status || "-");
}

/**
 * How the customer paid, in words.
 *
 * Two fields describe this and neither is complete: `provider` is the gateway
 * (`MMPAY`, `COD`) and `paymentMethod` is the instrument (`scan`, `cod`), missing
 * on older orders. Naming the instrument is more useful when we have it, with the
 * gateway as the fallback.
 */
export function getPaymentMethodLabel(
  paymentMethod?: string,
  provider?: string,
): string {
  const method = (paymentMethod || "").trim().toLowerCase();
  const gateway = (provider || "").trim().toLowerCase();

  if (method === "cod" || gateway === "cod") return "Cash on Delivery";
  if (method === "scan" || method === "qr") return "MyanMyanPay (QR Scan)";
  if (method === "card") return "Card";
  if (method === "cash") return "Cash";
  if (method === "transfer" || method === "bank_transfer") {
    return "Bank Transfer";
  }
  if (gateway === "mmpay") return "MyanMyanPay";

  const fallback = paymentMethod || provider;
  if (!fallback) return "-";

  // Unknown token: make it readable rather than showing a raw identifier.
  return titleCase(fallback);
}
