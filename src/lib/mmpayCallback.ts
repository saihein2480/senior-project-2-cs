/**
 * Rules for applying a MyanMyanPay callback to an order.
 *
 * Kept out of the route so it can be exercised directly: the route module pulls
 * in the payment SDK and `next/server`, and this is the part with the subtle
 * behaviour.
 */

export type MmpayCallbackStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  /**
   * Not in MyanMyanPay's documented set, but what it actually sends when a QR
   * session lapses — observed on real callbacks, which carry `status: "EXPIRED"`
   * alongside `condition: "EXPIRED"`.
   */
  | "EXPIRED";

/**
 * Payment states that are final from the gateway's point of view.
 *
 * Reaching one of these means money moved, either to us or back to the customer.
 */
export function isSettledPaymentStatus(paymentStatus: unknown): boolean {
  const value = String(paymentStatus ?? "").toLowerCase();
  return /(success|succeeded|paid|completed|refund)/.test(value);
}

/**
 * May this callback change the order's payment state?
 *
 * MyanMyanPay emits lifecycle events for the QR session, not only for the
 * payment, and they can arrive after settlement. Two real orders were paid — a
 * `transactions` record was written and stock deducted — and then received a
 * later `status: "EXPIRED"` callback when the QR's own three-minute window
 * lapsed. The previous unconditional write applied it, so
 * `paymentStatus` became `EXPIRED` and `status` fell back to `pending` roughly
 * fifteen minutes after the sale. The owner watched the value change in the
 * online-orders table, and the rows dropped out of both the Paid and Pending
 * filters because `EXPIRED` normalised to "unknown".
 *
 * A settled order therefore only accepts another settling callback, so
 * SUCCESS → REFUNDED still works. PENDING, EXPIRED and FAILED are ignored once
 * money has moved.
 */
export function shouldApplyCallback(
  currentPaymentStatus: unknown,
  incomingStatus: string,
): boolean {
  if (!isSettledPaymentStatus(currentPaymentStatus)) return true;
  return isSettledPaymentStatus(incomingStatus);
}

/** Order-level status implied by a gateway payment status. */
export function orderStatusFor(paymentStatus: string): string {
  if (paymentStatus === "SUCCESS") return "paid";
  if (paymentStatus === "REFUNDED") return "refunded";
  if (paymentStatus === "FAILED" || paymentStatus === "EXPIRED") {
    return "failed";
  }
  return "pending";
}
