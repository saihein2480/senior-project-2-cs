/**
 * Telegram Notification System
 * Send automated notifications to customers via Telegram
 *
 * @deprecated Use `notifyCustomer` from `lib/notifications/dispatch` instead.
 *
 * These senders only reach Telegram, so a customer who has not linked the bot —
 * which today is all of them — gets nothing at all. The dispatcher sends the
 * same event by email, by Telegram and to the in-app bell from one call, with
 * the wording shared between channels in `lib/notifications/content`.
 *
 * Two further reasons not to add callers here:
 *  - every function below treats a missing `notificationPreferences` map as
 *    "opted out" (`!customer.notificationPreferences?.orderUpdates`), but the
 *    map is only written when a customer links Telegram, so existing customers
 *    are silently skipped. The dispatcher defaults an absent flag to on.
 *  - the bodies are hand-escaped MarkdownV2; one unescaped `.` or `!` makes the
 *    Telegram API reject the message and `sendMessageSafe` swallow it as
 *    `false`. The dispatcher uses HTML, which only needs `&`, `<` and `>`.
 *
 * Kept because documents/TELEGRAM_API_REFERENCE.md describes them.
 */

import { sendMessageSafe, sendPhotoSafe } from "./api-client";
import { getCustomerById, isTelegramNotificationsEnabled } from "./customer-service";
import { escapeMarkdown, formatPrice } from "./formatters";
import type { OrderInfo } from "../orderSupport";

/**
 * Send order confirmation notification
 */
export async function sendOrderConfirmationNotification(
  customerId: string,
  order: OrderInfo
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId) {
      console.log(`Customer ${customerId} doesn't have Telegram linked`);
      return false;
    }

    if (!customer.notificationPreferences?.orderUpdates) {
      console.log(`Customer ${customerId} has order updates disabled`);
      return false;
    }

    const message =
      `🎉 *Order Confirmed\\!*\n\n` +
      `Your order has been successfully placed\\.\n\n` +
      `📦 *Order:* ${escapeMarkdown(order.orderRef)}\n` +
      `💰 *Total:* ${escapeMarkdown(formatPrice(order.totalAmount))}\n` +
      `💳 *Payment:* ${escapeMarkdown(order.paymentMethod)}\n\n` +
      `We'll notify you when your order is ready for shipment\\.\n\n` +
      `Track your order: /track ${escapeMarkdown(order.orderRef)}`;

    return await sendMessageSafe(customer.telegramChatId, message);
  } catch (error) {
    console.error("Error sending order confirmation:", error);
    return false;
  }
}

/**
 * Send payment confirmation notification
 */
export async function sendPaymentConfirmationNotification(
  customerId: string,
  order: OrderInfo
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.orderUpdates) {
      return false;
    }

    const message =
      `✅ *Payment Received\\!*\n\n` +
      `Your payment has been confirmed\\.\n\n` +
      `📦 *Order:* ${escapeMarkdown(order.orderRef)}\n` +
      `💰 *Amount:* ${escapeMarkdown(formatPrice(order.totalAmount))}\n` +
      `💳 *Method:* ${escapeMarkdown(order.paymentMethod)}\n\n` +
      `Your order is now being processed\\.\n\n` +
      `Track your order: /track ${escapeMarkdown(order.orderRef)}`;

    return await sendMessageSafe(customer.telegramChatId, message);
  } catch (error) {
    console.error("Error sending payment confirmation:", error);
    return false;
  }
}

/**
 * Send order shipped notification
 */
export async function sendOrderShippedNotification(
  customerId: string,
  order: OrderInfo
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.deliveryAlerts) {
      return false;
    }

    let message =
      `🚚 *Order Shipped\\!*\n\n` +
      `Your order is on its way\\!\n\n` +
      `📦 *Order:* ${escapeMarkdown(order.orderRef)}\n`;

    if (order.trackingNumber) {
      message += `🔢 *Tracking:* ${escapeMarkdown(order.trackingNumber)}\n`;
    }

    message += `\nExpected delivery: 2\\-5 business days\n\n` +
      `Track your order: /track ${escapeMarkdown(order.orderRef)}`;

    return await sendMessageSafe(customer.telegramChatId, message);
  } catch (error) {
    console.error("Error sending order shipped notification:", error);
    return false;
  }
}

/**
 * Send order delivered notification
 */
export async function sendOrderDeliveredNotification(
  customerId: string,
  order: OrderInfo
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.deliveryAlerts) {
      return false;
    }

    const message =
      `🎉 *Order Delivered\\!*\n\n` +
      `Your order has been successfully delivered\\.\n\n` +
      `📦 *Order:* ${escapeMarkdown(order.orderRef)}\n` +
      `💰 *Total:* ${escapeMarkdown(formatPrice(order.totalAmount))}\n\n` +
      `Thank you for shopping with us\\!\n\n` +
      `Need to return? You have 7 days from delivery\\.\n` +
      `Use /orders to manage your order\\.`;

    return await sendMessageSafe(customer.telegramChatId, message);
  } catch (error) {
    console.error("Error sending order delivered notification:", error);
    return false;
  }
}

/**
 * Send order cancelled notification
 */
export async function sendOrderCancelledNotification(
  customerId: string,
  order: OrderInfo,
  reason?: string
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.orderUpdates) {
      return false;
    }

    let message =
      `❌ *Order Cancelled*\n\n` +
      `Your order has been cancelled\\.\n\n` +
      `📦 *Order:* ${escapeMarkdown(order.orderRef)}\n` +
      `💰 *Amount:* ${escapeMarkdown(formatPrice(order.totalAmount))}\n`;

    if (reason) {
      message += `\n📝 *Reason:* ${escapeMarkdown(reason)}\n`;
    }

    if (order.paymentStatus === "paid") {
      message += `\n💰 Refund will be processed within 5\\-7 business days\\.`;
    }

    message += `\n\nNeed help? Contact our support team\\.`;

    return await sendMessageSafe(customer.telegramChatId, message);
  } catch (error) {
    console.error("Error sending order cancelled notification:", error);
    return false;
  }
}

/**
 * Send refund processed notification
 */
export async function sendRefundProcessedNotification(
  customerId: string,
  order: OrderInfo,
  refundAmount: number
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.orderUpdates) {
      return false;
    }

    const message =
      `💰 *Refund Processed*\n\n` +
      `Your refund has been processed\\.\n\n` +
      `📦 *Order:* ${escapeMarkdown(order.orderRef)}\n` +
      `💵 *Refund Amount:* ${escapeMarkdown(formatPrice(refundAmount))}\n` +
      `💳 *Method:* ${escapeMarkdown(order.paymentMethod)}\n\n` +
      `The amount will be credited to your account within 5\\-7 business days\\.\n\n` +
      `Thank you for your patience\\!`;

    return await sendMessageSafe(customer.telegramChatId, message);
  } catch (error) {
    console.error("Error sending refund notification:", error);
    return false;
  }
}

/**
 * Send promotion notification
 */
export async function sendPromotionNotification(
  customerId: string,
  promotion: {
    title: string;
    description: string;
    couponCode?: string;
    image?: string;
  }
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.promotions) {
      return false;
    }

    let message =
      `🎁 *${escapeMarkdown(promotion.title)}*\n\n` +
      `${escapeMarkdown(promotion.description)}\n`;

    if (promotion.couponCode) {
      message += `\n🎫 *Code:* ${escapeMarkdown(promotion.couponCode)}\n`;
    }

    message += `\nShop now: /products`;

    if (promotion.image) {
      return await sendPhotoSafe(customer.telegramChatId, promotion.image, message);
    } else {
      return await sendMessageSafe(customer.telegramChatId, message);
    }
  } catch (error) {
    console.error("Error sending promotion notification:", error);
    return false;
  }
}

/**
 * Send bulk notification to all Telegram customers
 */
export async function sendBulkNotification(
  message: string,
  onlyPromotionEnabled: boolean = true
): Promise<{ sent: number; failed: number }> {
  const { getAllTelegramCustomers } = await import("./customer-service");
  const customers = await getAllTelegramCustomers();

  let sent = 0;
  let failed = 0;

  for (const customer of customers) {
    try {
      const customerData = await getCustomerById(customer.id);

      if (onlyPromotionEnabled && !customerData?.notificationPreferences?.promotions) {
        continue;
      }

      const success = await sendMessageSafe(customer.telegramChatId, message);

      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Rate limiting: wait 35ms between messages (max 30 msg/sec)
      await new Promise((resolve) => setTimeout(resolve, 35));
    } catch (error) {
      console.error(`Failed to send to customer ${customer.id}:`, error);
      failed++;
    }
  }

  console.log(`✅ Bulk notification sent: ${sent} success, ${failed} failed`);

  return { sent, failed };
}

/**
 * Send low stock alert notification (to customer who wishlisted)
 */
export async function sendLowStockAlertNotification(
  customerId: string,
  product: {
    name: string;
    image?: string;
    price: number;
    stock: number;
  }
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.telegram) {
      return false;
    }

    const message =
      `⚠️ *Low Stock Alert\\!*\n\n` +
      `${escapeMarkdown(product.name)}\n` +
      `💰 ${escapeMarkdown(formatPrice(product.price))}\n\n` +
      `Only ${product.stock} item${product.stock !== 1 ? "s" : ""} left in stock\\!\n\n` +
      `Order now before it's gone: /products`;

    if (product.image) {
      return await sendPhotoSafe(customer.telegramChatId, product.image, message);
    } else {
      return await sendMessageSafe(customer.telegramChatId, message);
    }
  } catch (error) {
    console.error("Error sending low stock alert:", error);
    return false;
  }
}

/**
 * Send back in stock notification
 */
export async function sendBackInStockNotification(
  customerId: string,
  product: {
    name: string;
    image?: string;
    price: number;
  }
): Promise<boolean> {
  try {
    const customer = await getCustomerById(customerId);

    if (!customer?.telegramChatId || !customer.notificationPreferences?.telegram) {
      return false;
    }

    const message =
      `✅ *Back in Stock\\!*\n\n` +
      `${escapeMarkdown(product.name)}\n` +
      `💰 ${escapeMarkdown(formatPrice(product.price))}\n\n` +
      `The item you were interested in is back in stock\\!\n\n` +
      `Shop now: /products`;

    if (product.image) {
      return await sendPhotoSafe(customer.telegramChatId, product.image, message);
    } else {
      return await sendMessageSafe(customer.telegramChatId, message);
    }
  } catch (error) {
    console.error("Error sending back in stock notification:", error);
    return false;
  }
}
