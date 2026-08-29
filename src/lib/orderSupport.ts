import { db } from "./firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

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

/**
 * Search for order by reference number
 */
export async function findOrderByRef(orderRef: string): Promise<OrderInfo | null> {
  if (!db) {
    console.error("❌ Firebase not configured");
    return null;
  }

  try {
    const ordersRef = collection(db, "onlineOrders");
    const q = query(ordersRef, where("orderRef", "==", orderRef.toUpperCase()), limit(1));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();

    return {
      orderId: doc.id,
      orderRef: data.orderRef || "",
      status: data.status || "pending",
      paymentMethod: data.paymentMethod || "COD",
      paymentStatus: data.paymentStatus || "pending",
      totalAmount: data.totalAmount || 0,
      createdAt: data.createdAt?.toDate() || new Date(),
      items: data.items || [],
      shippingAddress: data.shippingAddress,
      trackingNumber: data.trackingNumber,
    };
  } catch (error) {
    console.error("Error finding order:", error);
    return null;
  }
}

/**
 * Find recent orders by customer email or phone
 */
export async function findCustomerOrders(
  email?: string,
  phone?: string
): Promise<OrderInfo[]> {
  if (!db) {
    console.error("❌ Firebase not configured");
    return [];
  }

  try {
    const ordersRef = collection(db, "onlineOrders");
    let q;

    if (email) {
      q = query(
        ordersRef,
        where("customerEmail", "==", email),
        orderBy("createdAt", "desc"),
        limit(5)
      );
    } else if (phone) {
      q = query(
        ordersRef,
        where("customerPhone", "==", phone),
        orderBy("createdAt", "desc"),
        limit(5)
      );
    } else {
      return [];
    }

    const querySnapshot = await getDocs(q);
    const orders: OrderInfo[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      orders.push({
        orderId: doc.id,
        orderRef: data.orderRef || "",
        status: data.status || "pending",
        paymentMethod: data.paymentMethod || "COD",
        paymentStatus: data.paymentStatus || "pending",
        totalAmount: data.totalAmount || 0,
        createdAt: data.createdAt?.toDate() || new Date(),
        items: data.items || [],
        shippingAddress: data.shippingAddress,
        trackingNumber: data.trackingNumber,
      });
    });

    return orders;
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
