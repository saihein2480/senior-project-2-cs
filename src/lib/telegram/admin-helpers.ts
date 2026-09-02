/**
 * Telegram Admin Helper Functions
 * Utilities for sending notifications from admin system
 */

import { sendMessageSafe } from "./api-client";

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

/**
 * Send notification to admin
 */
export async function notifyAdmin(message: string): Promise<boolean> {
  if (!ADMIN_CHAT_ID) {
    console.log("Admin chat ID not configured");
    return false;
  }

  return await sendMessageSafe(ADMIN_CHAT_ID, message);
}

/**
 * Notify admin about new order
 */
export async function notifyAdminNewOrder(order: {
  orderRef: string;
  total: number;
  paymentMethod: string;
  customerName?: string;
}): Promise<boolean> {
  const message =
    `🛒 *New Order Received\\!*\n\n` +
    `📦 Order: ${order.orderRef}\n` +
    `👤 Customer: ${order.customerName || "Guest"}\n` +
    `💰 Total: ${order.total} THB\n` +
    `💳 Payment: ${order.paymentMethod}\n\n` +
    `Check admin panel for details\\.`;

  return await notifyAdmin(message);
}

/**
 * Notify admin about low stock
 */
export async function notifyAdminLowStock(product: {
  name: string;
  stock: number;
  threshold: number;
}): Promise<boolean> {
  const message =
    `⚠️ *Low Stock Alert\\!*\n\n` +
    `Product: ${product.name}\n` +
    `Current Stock: ${product.stock}\n` +
    `Threshold: ${product.threshold}\n\n` +
    `Please restock soon\\.`;

  return await notifyAdmin(message);
}

/**
 * Notify admin about payment received
 */
export async function notifyAdminPaymentReceived(payment: {
  orderRef: string;
  amount: number;
  method: string;
}): Promise<boolean> {
  const message =
    `💰 *Payment Received\\!*\n\n` +
    `📦 Order: ${payment.orderRef}\n` +
    `💵 Amount: ${payment.amount} THB\n` +
    `💳 Method: ${payment.method}\n\n` +
    `Order can be processed now\\.`;

  return await notifyAdmin(message);
}

/**
 * Notify admin about cancellation request
 */
export async function notifyAdminCancellationRequest(request: {
  orderRef: string;
  reason: string;
  customerName?: string;
}): Promise<boolean> {
  const message =
    `❌ *Cancellation Request*\n\n` +
    `📦 Order: ${request.orderRef}\n` +
    `👤 Customer: ${request.customerName || "Unknown"}\n` +
    `📝 Reason: ${request.reason}\n\n` +
    `Please review in admin panel\\.`;

  return await notifyAdmin(message);
}

/**
 * Notify admin about return/refund request
 */
export async function notifyAdminReturnRequest(request: {
  orderRef: string;
  type: "return" | "refund";
  reason: string;
  customerName?: string;
}): Promise<boolean> {
  const message =
    `↩️ *${request.type === "return" ? "Return" : "Refund"} Request*\n\n` +
    `📦 Order: ${request.orderRef}\n` +
    `👤 Customer: ${request.customerName || "Unknown"}\n` +
    `📝 Reason: ${request.reason}\n\n` +
    `Please review in admin panel\\.`;

  return await notifyAdmin(message);
}

/**
 * Notify admin about system error
 */
export async function notifyAdminError(error: {
  message: string;
  context?: string;
  stack?: string;
}): Promise<boolean> {
  const message =
    `🚨 *System Error*\n\n` +
    `Error: ${error.message}\n` +
    (error.context ? `Context: ${error.context}\n` : "") +
    `\nPlease check server logs\\.`;

  return await notifyAdmin(message);
}

/**
 * Send test notification to admin
 */
export async function sendAdminTestNotification(): Promise<boolean> {
  const message =
    `✅ *Test Notification*\n\n` +
    `Telegram integration is working correctly\\!\n\n` +
    `You will receive admin notifications for:\n` +
    `• New orders\n` +
    `• Payment confirmations\n` +
    `• Cancellation requests\n` +
    `• Low stock alerts\n` +
    `• System errors`;

  return await notifyAdmin(message);
}
