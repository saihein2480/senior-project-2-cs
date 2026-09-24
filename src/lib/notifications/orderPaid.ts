/**
 * Everything that must happen once an online order is paid.
 *
 * Payment can be confirmed by two different routes — the live MyanMyanPay
 * callback (`api/mmpay/webhook`) and the sandbox shortcut
 * (`api/mmpay/test-complete`) — and both have to produce identical records.
 * They did not: only the live webhook told the owner and the customer, so a
 * payment completed in sandbox raised no POS notification and sent the customer
 * no email or Telegram message. Keeping these steps in one place is what stops
 * that drift returning.
 *
 * Every step is independently guarded. A paid order is already committed by the
 * time this runs, so a dead SMTP connection or a missing customer record must
 * never turn a successful payment into a failed request — and the live webhook
 * in particular must still return 200, or MyanMyanPay retries a callback that
 * has already been processed.
 *
 * Server-only: depends on `adminDb`.
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { syncOnlineCustomerToPos, updateCustomerStats } from "../updateCustomerStats";

export interface AnnouncePaidOrderInput {
  orderId: string;
  /** Used when the order document has no total, e.g. a legacy record. */
  fallbackAmount?: number;
  /** Used when the order document has no payment method recorded. */
  fallbackPaymentMethod?: string;
}

type OrderCustomer = {
  uid?: string;
  email?: string;
  displayName?: string;
};

/**
 * Claim the right to announce this order, atomically.
 *
 * MyanMyanPay retries callbacks, and the sandbox "complete payment" button can
 * be pressed twice. Without a claim the customer would receive duplicate
 * payment emails and the owner duplicate bell entries. Whoever writes
 * `paidNotifiedAt` first wins; everyone else backs off.
 *
 * @returns the order data if this caller won the claim, otherwise null.
 */
async function claimAnnouncement(
  adminDb: Firestore,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  const orderRef = adminDb.collection("onlineOrders").doc(orderId);

  return adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef);
    if (!snapshot.exists) return null;

    const data = snapshot.data() || {};
    if (data.paidNotifiedAt) return null;

    tx.update(orderRef, { paidNotifiedAt: new Date().toISOString() });
    return data;
  });
}

/**
 * Tell the owner and the customer that an order has been paid, and roll the
 * payment into the customer's totals.
 *
 * Safe to call more than once for the same order: only the first call does
 * anything.
 */
export async function announcePaidOnlineOrder(
  adminDb: Firestore,
  { orderId, fallbackAmount, fallbackPaymentMethod }: AnnouncePaidOrderInput,
): Promise<void> {
  let order: Record<string, unknown> | null = null;

  try {
    order = await claimAnnouncement(adminDb, orderId);
  } catch (error) {
    console.error(`Could not claim paid-order announcement for ${orderId}:`, error);
    return;
  }

  // Already announced by an earlier callback, or the order no longer exists.
  if (!order) return;

  const customer = (order.customer || {}) as OrderCustomer;
  const customerUid = customer.uid;
  const orderTotal = Number(order.total || fallbackAmount || 0);

  // Make sure the buyer exists in the POS customer list and their lifetime
  // totals include this order.
  if (customerUid) {
    try {
      await syncOnlineCustomerToPos(customerUid);
      await updateCustomerStats(customerUid, orderTotal, 1);
    } catch (error) {
      console.error(`Failed to update customer stats for ${orderId}:`, error);
    }
  }

  // Owner-facing bell entry, routed to the online orders page.
  try {
    await adminDb.collection("notifications").add({
      type: "online_order",
      title: "Online Order Paid",
      message: `Order #${orderId} has been paid by ${
        customer.displayName || customer.email || "a customer"
      }`,
      link: "/owner/sales/online-orders",
      metadata: { orderId },
      read: false,
      // A server timestamp, not an ISO string: the POS reads this with
      // `.toDate()` and orders by it, and Firestore sorts strings and
      // timestamps as separate types, so mixing the two mis-sorts the list.
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error(`Failed to create owner notification for ${orderId}:`, error);
  }

  // Customer-facing confirmation: email, Telegram and the storefront bell.
  if (!customerUid) return;

  try {
    const { notifyCustomer } = await import("./dispatch");
    const items = Array.isArray(order.items)
      ? (order.items as Array<{ name?: string; quantity?: number }>).map(
          (item) => ({
            name: item.name || "Item",
            quantity: Number(item.quantity || 1),
          }),
        )
      : undefined;

    await notifyCustomer({
      customerId: customerUid,
      fallbackEmail: customer.email,
      fallbackDisplayName: customer.displayName,
      event: {
        type: "payment_received",
        order: {
          orderRef: orderId,
          totalAmount: orderTotal,
          paymentMethod:
            (order.paymentMethod as string | undefined) ||
            fallbackPaymentMethod ||
            "MMPAY",
          paymentStatus: "paid",
          items,
        },
      },
    });
  } catch (error) {
    console.error(
      `Failed to send payment confirmation to customer for ${orderId}:`,
      error,
    );
  }
}
