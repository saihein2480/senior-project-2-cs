# Telegram Integration API Reference

## Overview

This document provides a complete API reference for the Telegram integration, including all available functions, types, and usage examples.

## Table of Contents

- [Core Bot Functions](#core-bot-functions)
- [Authentication & Linking](#authentication--linking)
- [Customer Service](#customer-service)
- [Cart Management](#cart-management)
- [Notifications](#notifications)
- [Admin Helpers](#admin-helpers)
- [AI Integration](#ai-integration)
- [Formatters](#formatters)
- [Keyboards](#keyboards)
- [API Endpoints](#api-endpoints)

---

## Core Bot Functions

### `handleTelegramUpdate(update: any)`

Main entry point for processing Telegram updates.

```typescript
import { handleTelegramUpdate } from "@/lib/telegram";

// In your webhook handler
await handleTelegramUpdate(update);
```

---

## Authentication & Linking

### `generateLinkToken(telegramChatId: string)`

Generate a secure token for account linking.

```typescript
import { generateLinkToken } from "@/lib/telegram";

const token = await generateLinkToken("123456789");
// Returns: "a1b2c3d4..."
```

### `verifyLinkToken(token: string, customerId: string)`

Verify and use a link token.

```typescript
import { verifyLinkToken } from "@/lib/telegram";

const result = await verifyLinkToken(token, customerId);
// Returns: { valid: boolean, error?: string, telegramChatId?: string }
```

### `linkTelegramToCustomer(customerId, telegramData)`

Link Telegram account to customer.

```typescript
import { linkTelegramToCustomer } from "@/lib/telegram";

const success = await linkTelegramToCustomer(customerId, {
  chatId: "123456789",
  username: "johndoe",
  firstName: "John",
  lastName: "Doe"
});
```

### `unlinkTelegramFromCustomer(customerId: string)`

Unlink Telegram from customer account.

```typescript
import { unlinkTelegramFromCustomer } from "@/lib/telegram";

const success = await unlinkTelegramFromCustomer(customerId);
```

---

## Customer Service

### `getCustomerByTelegramId(telegramChatId: string)`

Get customer by Telegram chat ID.

```typescript
import { getCustomerByTelegramId } from "@/lib/telegram";

const customer = await getCustomerByTelegramId("123456789");
// Returns: { id, email, displayName, phone, telegramChatId, ... } | null
```

### `getCustomerById(customerId: string)`

Get customer by customer ID.

```typescript
import { getCustomerById } from "@/lib/telegram";

const customer = await getCustomerById("customer_id");
```

### `updateNotificationPreferences(customerId, preferences)`

Update notification preferences.

```typescript
import { updateNotificationPreferences } from "@/lib/telegram";

await updateNotificationPreferences(customerId, {
  telegram: true,
  orderUpdates: true,
  promotions: false,
  deliveryAlerts: true
});
```

### `isTelegramNotificationsEnabled(customerId: string)`

Check if Telegram notifications are enabled.

```typescript
import { isTelegramNotificationsEnabled } from "@/lib/telegram";

const enabled = await isTelegramNotificationsEnabled(customerId);
// Returns: boolean
```

---

## Cart Management

### `getTelegramCart(chatId: string)`

Get cart for Telegram user.

```typescript
import { getTelegramCart } from "@/lib/telegram";

const cart = await getTelegramCart("123456789");
// Returns: { items: [], chatId, updatedAt } | null
```

### `addToTelegramCart(chatId, item)`

Add item to Telegram cart.

```typescript
import { addToTelegramCart } from "@/lib/telegram";

const success = await addToTelegramCart(chatId, {
  productId: "prod_123",
  name: "Black T-Shirt",
  image: "https://...",
  color: "Black",
  size: "M",
  price: 25.00,
  quantity: 1,
  maxQuantity: 10
});
```

### `removeFromTelegramCart(chatId, productId, variantId?)`

Remove item from cart.

```typescript
import { removeFromTelegramCart } from "@/lib/telegram";

const success = await removeFromTelegramCart(chatId, productId, variantId);
```

### `updateTelegramCartQuantity(chatId, productId, quantity, variantId?)`

Update cart item quantity.

```typescript
import { updateTelegramCartQuantity } from "@/lib/telegram";

const success = await updateTelegramCartQuantity(chatId, productId, 3, variantId);
```

### `clearTelegramCart(chatId: string)`

Clear entire cart.

```typescript
import { clearTelegramCart } from "@/lib/telegram";

const success = await clearTelegramCart(chatId);
```

### `mergeTelegramCartWithCustomer(chatId, customerId)`

Merge Telegram cart with customer cart (used during account linking).

```typescript
import { mergeTelegramCartWithCustomer } from "@/lib/telegram";

const success = await mergeTelegramCartWithCustomer(chatId, customerId);
```

---

## Notifications

### `sendOrderConfirmationNotification(customerId, order)`

Send order confirmation notification.

```typescript
import { sendOrderConfirmationNotification } from "@/lib/telegram";

const success = await sendOrderConfirmationNotification(customerId, {
  orderRef: "OR12345678",
  totalAmount: 150000,
  paymentMethod: "COD",
  items: [...],
  createdAt: new Date(),
  // ... other OrderInfo fields
});
```

### `sendPaymentConfirmationNotification(customerId, order)`

Send payment confirmation.

```typescript
import { sendPaymentConfirmationNotification } from "@/lib/telegram";

const success = await sendPaymentConfirmationNotification(customerId, order);
```

### `sendOrderShippedNotification(customerId, order)`

Send shipping notification.

```typescript
import { sendOrderShippedNotification } from "@/lib/telegram";

const success = await sendOrderShippedNotification(customerId, order);
```

### `sendOrderDeliveredNotification(customerId, order)`

Send delivery confirmation.

```typescript
import { sendOrderDeliveredNotification } from "@/lib/telegram";

const success = await sendOrderDeliveredNotification(customerId, order);
```

### `sendOrderCancelledNotification(customerId, order, reason?)`

Send cancellation notification.

```typescript
import { sendOrderCancelledNotification } from "@/lib/telegram";

const success = await sendOrderCancelledNotification(
  customerId, 
  order, 
  "Customer requested cancellation"
);
```

### `sendRefundProcessedNotification(customerId, order, refundAmount)`

Send refund confirmation.

```typescript
import { sendRefundProcessedNotification } from "@/lib/telegram";

const success = await sendRefundProcessedNotification(
  customerId,
  order,
  150000 // refund amount
);
```

### `sendPromotionNotification(customerId, promotion)`

Send promotion notification.

```typescript
import { sendPromotionNotification } from "@/lib/telegram";

const success = await sendPromotionNotification(customerId, {
  title: "Weekend Sale",
  description: "Get 20% off all items",
  couponCode: "WEEKEND20",
  image: "https://..." // optional
});
```

### `sendBulkNotification(message, onlyPromotionEnabled?)`

Send bulk notification to all customers.

```typescript
import { sendBulkNotification } from "@/lib/telegram";

const result = await sendBulkNotification(
  "🎉 Flash Sale! 50% off selected items!",
  true // only send to customers who enabled promotions
);
// Returns: { sent: number, failed: number }
```

### `sendLowStockAlertNotification(customerId, product)`

Send low stock alert.

```typescript
import { sendLowStockAlertNotification } from "@/lib/telegram";

const success = await sendLowStockAlertNotification(customerId, {
  name: "Black Jeans",
  image: "https://...",
  price: 50000,
  stock: 2
});
```

### `sendBackInStockNotification(customerId, product)`

Send back in stock notification.

```typescript
import { sendBackInStockNotification } from "@/lib/telegram";

const success = await sendBackInStockNotification(customerId, {
  name: "Black Jeans",
  image: "https://...",
  price: 50000
});
```

---

## Admin Helpers

### `notifyAdmin(message: string)`

Send generic message to admin.

```typescript
import { notifyAdmin } from "@/lib/telegram";

await notifyAdmin("System maintenance completed successfully.");
```

### `notifyAdminNewOrder(order)`

Notify admin about new order.

```typescript
import { notifyAdminNewOrder } from "@/lib/telegram";

await notifyAdminNewOrder({
  orderRef: "OR12345678",
  total: 150000,
  paymentMethod: "COD",
  customerName: "John Doe"
});
```

### `notifyAdminLowStock(product)`

Notify admin about low stock.

```typescript
import { notifyAdminLowStock } from "@/lib/telegram";

await notifyAdminLowStock({
  name: "Black T-Shirt",
  stock: 3,
  threshold: 5
});
```

### `notifyAdminPaymentReceived(payment)`

Notify admin about payment.

```typescript
import { notifyAdminPaymentReceived } from "@/lib/telegram";

await notifyAdminPaymentReceived({
  orderRef: "OR12345678",
  amount: 150000,
  method: "MyanmarPay"
});
```

### `notifyAdminCancellationRequest(request)`

Notify admin about cancellation request.

```typescript
import { notifyAdminCancellationRequest } from "@/lib/telegram";

await notifyAdminCancellationRequest({
  orderRef: "OR12345678",
  reason: "Changed mind",
  customerName: "John Doe"
});
```

### `notifyAdminReturnRequest(request)`

Notify admin about return/refund request.

```typescript
import { notifyAdminReturnRequest } from "@/lib/telegram";

await notifyAdminReturnRequest({
  orderRef: "OR12345678",
  type: "return",
  reason: "Size doesn't fit",
  customerName: "John Doe"
});
```

### `notifyAdminError(error)`

Notify admin about system error.

```typescript
import { notifyAdminError } from "@/lib/telegram";

await notifyAdminError({
  message: "Database connection failed",
  context: "Order processing",
  stack: error.stack
});
```

---

## AI Integration

### `processWithAI(message, chatHistory?)`

Process message with AI assistant.

```typescript
import { processWithAI } from "@/lib/telegram";

const response = await processWithAI(
  "Show me black jeans under 50000",
  [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Hello! How can I help?" }
  ]
);
// Returns: { text, products?, isOutfit?, requiresProductSearch? }
```

### `getAIProductRecommendation(userPreferences: string)`

Get AI product recommendation.

```typescript
import { getAIProductRecommendation } from "@/lib/telegram";

const recommendation = await getAIProductRecommendation(
  "casual outfit for work"
);
// Returns: string (AI recommendation)
```

---

## Formatters

### `formatWelcomeMessage(firstName?: string)`

Format welcome message.

```typescript
import { formatWelcomeMessage } from "@/lib/telegram";

const message = formatWelcomeMessage("John");
```

### `formatHelpMessage()`

Format help message.

```typescript
import { formatHelpMessage } from "@/lib/telegram";

const message = formatHelpMessage();
```

### `formatProduct(product)`

Format product for display.

```typescript
import { formatProduct } from "@/lib/telegram";

const text = formatProduct(product);
```

### `formatProductList(products, page?, pageSize?)`

Format product list.

```typescript
import { formatProductList } from "@/lib/telegram";

const text = formatProductList(products, 1, 5);
```

### `formatOrder(order)`

Format order details.

```typescript
import { formatOrder } from "@/lib/telegram";

const text = formatOrder(order);
```

### `formatOrderList(orders)`

Format order list.

```typescript
import { formatOrderList } from "@/lib/telegram";

const text = formatOrderList(orders);
```

### `formatCart(items, subtotal)`

Format cart contents.

```typescript
import { formatCart } from "@/lib/telegram";

const text = formatCart(cartItems, 150000);
```

### `formatPrice(priceThb: number)`

Format price in MMK.

```typescript
import { formatPrice } from "@/lib/telegram";

const formatted = formatPrice(50); // "2,150 MMK"
```

### `escapeMarkdown(text: string)`

Escape special characters for Telegram MarkdownV2.

```typescript
import { escapeMarkdown } from "@/lib/telegram";

const escaped = escapeMarkdown("Price: $50 (50% off!)");
```

---

## Keyboards

### `createMainMenuKeyboard()`

Create main menu inline keyboard.

```typescript
import { createMainMenuKeyboard } from "@/lib/telegram";

const keyboard = createMainMenuKeyboard();
```

### `createCategoriesKeyboard()`

Create categories keyboard.

```typescript
import { createCategoriesKeyboard } from "@/lib/telegram";

const keyboard = createCategoriesKeyboard();
```

### `createProductKeyboard(productId, inStock?)`

Create product actions keyboard.

```typescript
import { createProductKeyboard } from "@/lib/telegram";

const keyboard = createProductKeyboard("prod_123", true);
```

### `createCartKeyboard(hasItems?)`

Create cart keyboard.

```typescript
import { createCartKeyboard } from "@/lib/telegram";

const keyboard = createCartKeyboard(true);
```

### `createOrderKeyboard(order)`

Create order actions keyboard.

```typescript
import { createOrderKeyboard } from "@/lib/telegram";

const keyboard = createOrderKeyboard(order);
```

### `createConfirmationKeyboard(confirmData, cancelData?)`

Create confirmation keyboard.

```typescript
import { createConfirmationKeyboard } from "@/lib/telegram";

const keyboard = createConfirmationKeyboard(
  "confirm_cancel_OR12345678",
  "menu_orders"
);
```

### `createAccountLinkKeyboard(token: string)`

Create account link keyboard.

```typescript
import { createAccountLinkKeyboard } from "@/lib/telegram";

const keyboard = createAccountLinkKeyboard(token);
```

---

## API Endpoints

### POST `/api/telegram/webhook`

Telegram webhook endpoint for receiving updates.

**Headers:**
- `x-telegram-bot-api-secret-token`: Your webhook secret

**Body:**
```json
{
  "update_id": 123456789,
  "message": { ... }
}
```

### GET `/api/telegram/setup-webhook`

Setup or get webhook information.

**Query Parameters:**
- `action`: "info" | "delete" | undefined (default: setup)

**Response:**
```json
{
  "success": true,
  "message": "Webhook configured successfully",
  "webhook": { ... }
}
```

### POST `/api/telegram/link-account`

Link Telegram account with customer account.

**Body:**
```json
{
  "token": "link_token",
  "customerId": "customer_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account linked successfully"
}
```

### POST `/api/telegram/send-notification`

Send notification to customer (admin use).

**Body:**
```json
{
  "type": "order_confirmation" | "payment_confirmation" | "order_shipped" | "order_delivered" | "order_cancelled" | "refund_processed" | "promotion" | "bulk",
  "customerId": "customer_id",
  "data": {
    "order": { ... },
    "promotion": { ... },
    "message": "...",
    // ... type-specific data
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notification sent successfully"
}
```

---

## Usage Examples

### Complete Order Flow with Notifications

```typescript
import {
  sendOrderConfirmationNotification,
  sendPaymentConfirmationNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  notifyAdminNewOrder
} from "@/lib/telegram";

// 1. Order placed
await sendOrderConfirmationNotification(customerId, order);
await notifyAdminNewOrder(order);

// 2. Payment confirmed
await sendPaymentConfirmationNotification(customerId, order);

// 3. Order shipped
await sendOrderShippedNotification(customerId, order);

// 4. Order delivered
await sendOrderDeliveredNotification(customerId, order);
```

### Account Linking Flow

```typescript
import {
  generateLinkToken,
  verifyLinkToken,
  linkTelegramToCustomer,
  mergeTelegramCartWithCustomer
} from "@/lib/telegram";

// 1. User initiates linking from Telegram
const token = await generateLinkToken(telegramChatId);

// 2. User clicks link and logs in on web

// 3. Verify token and link accounts
const verification = await verifyLinkToken(token, customerId);
if (verification.valid) {
  await linkTelegramToCustomer(customerId, {
    chatId: verification.telegramChatId!,
    username: "johndoe"
  });
  
  // 4. Merge carts
  await mergeTelegramCartWithCustomer(verification.telegramChatId!, customerId);
}
```

### Sending Bulk Promotions

```typescript
import { sendBulkNotification } from "@/lib/telegram";

const result = await sendBulkNotification(
  "🎉 Flash Sale! 50% off all items this weekend! Use code FLASH50",
  true // only to users who enabled promotions
);

console.log(`Sent to ${result.sent} customers, ${result.failed} failed`);
```

---

## Type Definitions

### `OrderInfo`

```typescript
interface OrderInfo {
  orderId: string;
  orderRef: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: Date;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  shippingAddress?: string;
  trackingNumber?: string;
}
```

### `CustomerTelegramData`

```typescript
interface CustomerTelegramData {
  telegramChatId?: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  telegramLinkedAt?: Date;
  notificationPreferences?: {
    telegram: boolean;
    orderUpdates: boolean;
    promotions: boolean;
    deliveryAlerts: boolean;
  };
}
```

### `TelegramCartItem`

```typescript
interface TelegramCartItem {
  productId: string;
  name: string;
  image?: string;
  color?: string;
  size?: string;
  variantId?: string;
  price: number;
  quantity: number;
  maxQuantity?: number;
}
```

---

## Error Handling

All functions return boolean for success/failure or null for not found. Always check return values:

```typescript
const success = await sendOrderConfirmationNotification(customerId, order);
if (!success) {
  console.error("Failed to send notification");
  // Handle error (retry, log, notify admin, etc.)
}
```

For functions that may return null:

```typescript
const customer = await getCustomerByTelegramId(chatId);
if (!customer) {
  // Customer not found or not linked
  await sendMessage({
    chat_id: chatId,
    text: "Please link your account first with /link"
  });
  return;
}
```

---

## Rate Limiting

Telegram has strict rate limits:
- 30 messages per second to different users
- 1 message per second to the same user
- 20 messages per minute to the same group

The `sendBulkNotification` function automatically implements rate limiting (35ms delay between messages).

---

## Security Best Practices

1. **Validate webhook secret** - Always verify the `x-telegram-bot-api-secret-token` header
2. **Sanitize user input** - Use `escapeMarkdown()` for all user-generated content
3. **Verify account ownership** - Check that the user owns the order/cart before allowing actions
4. **Secure tokens** - Link tokens expire after 15 minutes and can only be used once
5. **Environment variables** - Never commit `TELEGRAM_BOT_TOKEN` or other secrets

---

## Testing

### Test Webhook Setup

```bash
curl https://yourdomain.com/api/telegram/setup-webhook
```

### Test Admin Notification

```typescript
import { sendAdminTestNotification } from "@/lib/telegram";

await sendAdminTestNotification();
```

### Test Bot Commands

In Telegram:
```
/start
/help
/products
/search black shirt
/cart
/orders
```

---

## Support

For issues or questions:
- Check the main documentation: `TELEGRAM_INTEGRATION.md`
- Review Telegram Bot API docs: https://core.telegram.org/bots/api
- Check server logs for detailed error messages
