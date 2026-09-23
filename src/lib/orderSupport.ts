/**
 * Order lookups for the Telegram bot and the AI chat route.
 *
 * Uses the Admin SDK, not the client SDK. Both callers run on the server with no
 * signed-in user, and `firestore.rules` only lets management list `onlineOrders`
 * — so a client-SDK query here was denied outright.
 *
 * Field names matter: `onlineOrders` documents written at checkout carry the
 * reference as `orderId`, the amount as `total` and the email nested at
 * `customer.email`. The previous queries used `orderRef`, `totalAmount` and a
 * top-level `customerEmail`, none of which exist on any of the 247 stored orders.
 */

import { adminDb } from "./firebase-admin";

export interface OrderInfo {
  orderId: string;
  orderRef: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: Date;
  items: {
    productName: string;
    quantity: number;
    price: number;
  }[];
  shippingAddress?: string;
  trackingNumber?: string;
}

/** `createdAt` is written as an ISO string at checkout, not a Timestamp. */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/**
 * Map a stored `onlineOrders` document onto `OrderInfo`.
 *
 * Money is the awkward part, because two generations of checkout wrote different
 * shapes:
 *  - COD orders store a THB `total` and `items[].amount` in THB.
 *  - Older MMPAY orders store only `amountMmk` and `items[].amount` in **MMK**.
 * Reading `items[].amount` as THB therefore quoted those lines ~100x too high.
 *
 * `cartItems[].priceTHB` is the one field written in THB by both, so it is the
 * preferred source for line prices and for reconstructing a total when no THB
 * total was stored. That reconstruction is a subtotal — it excludes tax and
 * discounts — so it is only used when nothing better exists.
 */
function mapOrder(id: string, data: Record<string, unknown>): OrderInfo {
  const cartItems = Array.isArray(data.cartItems)
    ? (data.cartItems as Array<Record<string, unknown>>)
    : [];
  const rawItems = Array.isArray(data.items)
    ? (data.items as Array<Record<string, unknown>>)
    : [];

  const items = cartItems.length
    ? cartItems.map((item) => ({
        productName: String(item.productName || item.name || "Item"),
        quantity: Number(item.quantity || 1),
        price: Number(item.priceTHB ?? item.unitPriceTHB ?? 0),
      }))
    : rawItems.map((item) => ({
        productName: String(item.name || item.productName || "Item"),
        quantity: Number(item.quantity || 1),
        // Only trusted as THB when the document also carries a THB total;
        // otherwise this figure is MMK and would be misleading.
        price:
          data.total !== undefined || data.totalAmount !== undefined
            ? Number(item.amount ?? item.price ?? 0)
            : 0,
      }));

  const storedTotal = Number(data.total ?? data.totalAmount ?? 0);
  const cartSubtotal = cartItems.reduce(
    (sum, item) =>
      sum + Number(item.priceTHB ?? item.unitPriceTHB ?? 0) * Number(item.quantity || 1),
    0,
  );
  const rate = Number(data.exchangeRate ?? 0);
  const fromMmk = rate > 0 ? Number(data.amountMmk ?? 0) / rate : 0;

  return {
    orderId: id,
    // The customer-facing reference is the document id / `orderId`, e.g.
    // "COD-1787817058191-SPKH3D". No stored order has an `orderRef` field.
    orderRef: String(data.orderRef || data.orderId || id),
    status: String(data.status || "pending"),
    paymentMethod: String(data.paymentMethod || data.provider || "COD"),
    paymentStatus: String(data.paymentStatus || "pending"),
    totalAmount: storedTotal || cartSubtotal || fromMmk || 0,
    createdAt: toDate(data.createdAt),
    items,
    shippingAddress:
      typeof data.shippingAddress === "string" ? data.shippingAddress : undefined,
    trackingNumber:
      typeof data.trackingNumber === "string" ? data.trackingNumber : undefined,
  };
}

/**
 * Search for an order by its reference.
 *
 * Tries the document id first — that is what the reference actually is — then
 * falls back to field matches so a future `orderRef` field would also work.
 */
export async function findOrderByRef(orderRef: string): Promise<OrderInfo | null> {
  if (!adminDb) {
    console.error("❌ Firebase Admin not configured");
    return null;
  }

  const ref = orderRef.trim();
  if (!ref) return null;

  try {
    const direct = await adminDb.collection("onlineOrders").doc(ref).get();
    if (direct.exists) {
      return mapOrder(direct.id, direct.data() || {});
    }

    for (const field of ["orderId", "orderRef"]) {
      const snap = await adminDb
        .collection("onlineOrders")
        .where(field, "==", ref)
        .limit(1)
        .get();

      if (!snap.empty) {
        return mapOrder(snap.docs[0].id, snap.docs[0].data());
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding order:", error);
    return null;
  }
}

/**
 * Recent orders for one customer, newest first.
 *
 * Matches on `customer.uid` rather than email: two customer documents can share
 * an email (they do in this database), so the uid is the only exact link.
 *
 * Deliberately no Firestore `orderBy` — combining it with the equality filter
 * needs a composite index that does not exist, and the previous email query
 * failed with `failed-precondition` for exactly that reason. Sorting a single
 * customer's orders in memory avoids the dependency.
 */
export async function findCustomerOrdersByUid(
  uid: string,
  max = 5,
): Promise<OrderInfo[]> {
  if (!adminDb || !uid) return [];

  try {
    const snap = await adminDb
      .collection("onlineOrders")
      .where("customer.uid", "==", uid)
      .get();

    return snap.docs
      .map((doc) => mapOrder(doc.id, doc.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, max);
  } catch (error) {
    console.error("Error finding customer orders by uid:", error);
    return [];
  }
}

/**
 * Find recent orders by customer email or phone.
 *
 * Prefer `findCustomerOrdersByUid` where a uid is available — an email can map to
 * more than one customer document. Kept for callers that only hold contact
 * details.
 */
export async function findCustomerOrders(
  email?: string,
  phone?: string,
  max = 5,
): Promise<OrderInfo[]> {
  if (!adminDb) {
    console.error("❌ Firebase Admin not configured");
    return [];
  }

  // Nested paths: checkout stores these under `customer`, never at the top level.
  const field = email ? "customer.email" : phone ? "customer.phone" : null;
  const value = email || phone;

  if (!field || !value) return [];

  try {
    const snap = await adminDb
      .collection("onlineOrders")
      .where(field, "==", value)
      .get();

    return snap.docs
      .map((doc) => mapOrder(doc.id, doc.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, max);
  } catch (error) {
    console.error("Error finding customer orders:", error);
    return [];
  }
}

/**
 * Format order status for display
 */
export function getOrderStatusDisplay(status: string): {
  icon: string;
  text: string;
  description: string;
} {
  const statusMap: Record<
    string,
    { icon: string; text: string; description: string }
  > = {
    pending: {
      icon: "⏳",
      text: "Pending",
      description: "Your order has been received and is being processed.",
    },
    confirmed: {
      icon: "✅",
      text: "Confirmed",
      description: "Your order has been confirmed and will be prepared soon.",
    },
    processing: {
      icon: "📦",
      text: "Processing",
      description: "We're preparing your order for shipment.",
    },
    shipped: {
      icon: "🚚",
      text: "Shipped",
      description: "Your order is on the way!",
    },
    delivered: {
      icon: "🎉",
      text: "Delivered",
      description: "Your order has been delivered successfully.",
    },
    cancelled: {
      icon: "❌",
      text: "Cancelled",
      description: "This order has been cancelled.",
    },
  };

  return (
    statusMap[status.toLowerCase()] || {
      icon: "❓",
      text: status,
      description: "Order status",
    }
  );
}

/**
 * Check if order can be cancelled
 */
export function canCancelOrder(order: OrderInfo): {
  canCancel: boolean;
  reason?: string;
} {
  // Already cancelled
  if (order.status.toLowerCase() === "cancelled") {
    return { canCancel: false, reason: "Order is already cancelled" };
  }

  // Already delivered
  if (order.status.toLowerCase() === "delivered") {
    return { canCancel: false, reason: "Order has been delivered" };
  }

  // COD orders can always be cancelled before delivery
  if (order.paymentMethod.toUpperCase() === "COD") {
    if (
      ["pending", "confirmed", "processing", "shipped"].includes(
        order.status.toLowerCase()
      )
    ) {
      return { canCancel: true };
    }
  }

  // Online payment orders - check time limit (24 hours for paid orders)
  if (order.paymentStatus.toLowerCase() === "paid") {
    const hoursSinceOrder =
      (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceOrder > 24) {
      return {
        canCancel: false,
        reason: "Online payment orders can only be cancelled within 24 hours",
      };
    }

    if (order.status.toLowerCase() === "shipped") {
      return {
        canCancel: false,
        reason: "Order has already been shipped",
      };
    }

    return { canCancel: true };
  }

  // Unpaid online orders can be cancelled
  if (
    order.paymentStatus.toLowerCase() === "pending" &&
    order.status.toLowerCase() !== "shipped"
  ) {
    return { canCancel: true };
  }

  return { canCancel: false, reason: "This order cannot be cancelled" };
}

/**
 * Check if order can be returned
 */
export function canReturnOrder(order: OrderInfo): {
  canReturn: boolean;
  reason?: string;
} {
  // Must be delivered
  if (order.status.toLowerCase() !== "delivered") {
    return { canReturn: false, reason: "Order must be delivered first" };
  }

  // Check 7-day window
  const daysSinceDelivery =
    (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceDelivery > 7) {
    return {
      canReturn: false,
      reason: "Return window has expired (7 days from delivery)",
    };
  }

  return { canReturn: true };
}

/**
 * Format order information for display
 */
export function formatOrderInfo(order: OrderInfo): string {
  const statusDisplay = getOrderStatusDisplay(order.status);
  const cancelInfo = canCancelOrder(order);
  const returnInfo = canReturnOrder(order);

  const parts: string[] = [];

  // Header
  parts.push(`📦 **Order ${order.orderRef}**\n`);

  // Status
  parts.push(
    `${statusDisplay.icon} **Status:** ${statusDisplay.text}\n${statusDisplay.description}\n`
  );

  // Payment
  parts.push(
    `💳 **Payment:** ${order.paymentMethod} (${order.paymentStatus})`
  );
  parts.push(
    `💰 **Total Amount:** ${new Intl.NumberFormat("en-US").format(order.totalAmount)} MMK\n`
  );

  // Items
  if (order.items.length > 0) {
    parts.push(`📋 **Items:**`);
    order.items.forEach((item) => {
      parts.push(
        `• ${item.productName} x${item.quantity} - ${new Intl.NumberFormat("en-US").format(item.price)} MMK`
      );
    });
    parts.push("");
  }

  // Tracking
  if (order.trackingNumber) {
    parts.push(`🔢 **Tracking Number:** ${order.trackingNumber}\n`);
  }

  // Order date
  parts.push(
    `📅 **Order Date:** ${order.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n`
  );

  // Cancellation info
  if (cancelInfo.canCancel) {
    parts.push(
      `✅ **Can Cancel:** Yes - You can cancel this order${order.paymentMethod.toUpperCase() === "COD" ? " anytime before delivery" : " within 24 hours"}`
    );
  } else if (cancelInfo.reason) {
    parts.push(`❌ **Cannot Cancel:** ${cancelInfo.reason}`);
  }

  // Return info
  if (returnInfo.canReturn) {
    parts.push(
      `✅ **Can Return:** Yes - Within 7 days of delivery (unworn, with tags)`
    );
  } else if (returnInfo.reason) {
    parts.push(`❌ **Cannot Return:** ${returnInfo.reason}`);
  }

  return parts.join("\n");
}

/**
 * Detect if message is about order inquiry
 */
export function isOrderInquiry(message: string): {
  isInquiry: boolean;
  queryType?: "status" | "track" | "cancel" | "return" | "general";
  orderRef?: string;
} {
  const lowerMessage = message.toLowerCase();

  // Extract order reference if present
  const orderRefMatch = message.match(/\b([A-Z]{2,3}\d{6,10})\b/i);
  const orderRef = orderRefMatch ? orderRefMatch[1].toUpperCase() : undefined;

  // Status inquiries
  if (
    lowerMessage.includes("where") &&
    (lowerMessage.includes("order") || lowerMessage.includes("package"))
  ) {
    return { isInquiry: true, queryType: "status", orderRef };
  }

  if (
    lowerMessage.includes("order status") ||
    lowerMessage.includes("track") ||
    lowerMessage.includes("tracking")
  ) {
    return { isInquiry: true, queryType: "track", orderRef };
  }

  // Cancellation inquiries
  if (lowerMessage.includes("cancel") && lowerMessage.includes("order")) {
    return { isInquiry: true, queryType: "cancel", orderRef };
  }

  // Return inquiries
  if (lowerMessage.includes("return") || lowerMessage.includes("refund")) {
    return { isInquiry: true, queryType: "return", orderRef };
  }

  // General order inquiry
  if (lowerMessage.includes("my order") || lowerMessage.includes("order")) {
    return { isInquiry: true, queryType: "general", orderRef };
  }

  return { isInquiry: false };
}
