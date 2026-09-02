# Telegram Integration Usage Examples

This document provides practical examples of how to use the Telegram integration in different scenarios.

## Table of Contents

- [Order Management Integration](#order-management-integration)
- [Inventory Management Integration](#inventory-management-integration)
- [Customer Service Integration](#customer-service-integration)
- [Marketing Campaigns](#marketing-campaigns)
- [Admin Dashboard Integration](#admin-dashboard-integration)

---

## Order Management Integration

### Example 1: Complete Order Lifecycle

Integrate notifications into your order management system:

```typescript
// File: src/lib/order-processor.ts

import {
  sendOrderConfirmationNotification,
  sendPaymentConfirmationNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  notifyAdminNewOrder,
  notifyAdminPaymentReceived
} from "./telegram";

export async function processNewOrder(order: any, customerId: string) {
  try {
    // 1. Create order in database
    const createdOrder = await createOrderInDB(order);
    
    // 2. Send confirmation to customer
    await sendOrderConfirmationNotification(customerId, createdOrder);
    
    // 3. Notify admin
    await notifyAdminNewOrder({
      orderRef: createdOrder.orderRef,
      total: createdOrder.totalAmount,
      paymentMethod: createdOrder.paymentMethod,
      customerName: order.customerName
    });
    
    return { success: true, order: createdOrder };
  } catch (error) {
    console.error("Order processing failed:", error);
    return { success: false, error };
  }
}

export async function updateOrderStatus(
  orderId: string, 
  status: string, 
  customerId: string
) {
  const order = await getOrderById(orderId);
  
  // Update status in database
  await updateOrderInDB(orderId, { status });
  
  // Send appropriate notification
  switch (status) {
    case "paid":
      await sendPaymentConfirmationNotification(customerId, order);
      await notifyAdminPaymentReceived({
        orderRef: order.orderRef,
        amount: order.totalAmount,
        method: order.paymentMethod
      });
      break;
      
    case "shipped":
      await sendOrderShippedNotification(customerId, order);
      break;
      
    case "delivered":
      await sendOrderDeliveredNotification(customerId, order);
      break;
  }
}
```

### Example 2: Payment Webhook Handler

```typescript
// File: src/app/api/mmpay/webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import { sendPaymentConfirmationNotification } from "../../../../lib/telegram";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  
  if (payload.status === "SUCCESS") {
    const order = await getOrderByTransactionId(payload.transactionId);
    const customer = await getCustomerByOrderId(order.id);
    
    // Update order payment status
    await updateOrderPaymentStatus(order.id, "paid");
    
    // Send Telegram notification
    await sendPaymentConfirmationNotification(customer.id, order);
  }
  
  return NextResponse.json({ received: true });
}
```

### Example 3: Order Cancellation Flow

```typescript
// File: src/app/api/orders/[orderId]/cancel/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  sendOrderCancelledNotification,
  notifyAdminCancellationRequest
} from "../../../../../lib/telegram";

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const { reason, customerId } = await req.json();
  const order = await getOrderById(params.orderId);
  
  // Verify customer owns this order
  if (order.customerId !== customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  
  // Check if cancellation is allowed
  const { canCancelOrder } = await import("@/lib/orderSupport");
  const cancelInfo = canCancelOrder(order);
  
  if (!cancelInfo.canCancel) {
    return NextResponse.json(
      { error: cancelInfo.reason },
      { status: 400 }
    );
  }
  
  // Process cancellation
  await updateOrderStatus(params.orderId, "cancelled");
  
  // Send notifications
  await sendOrderCancelledNotification(customerId, order, reason);
  await notifyAdminCancellationRequest({
    orderRef: order.orderRef,
    reason,
    customerName: order.customerName
  });
  
  return NextResponse.json({ success: true });
}
```

---

## Inventory Management Integration

### Example 4: Low Stock Alerts

```typescript
// File: src/lib/inventory-monitor.ts

import { 
  notifyAdminLowStock,
  sendLowStockAlertNotification 
} from "./telegram";

export async function checkInventoryLevels() {
  const products = await getAllProducts();
  
  for (const product of products) {
    const threshold = product.lowStockThreshold || 5;
    
    if (product.stock <= threshold && product.stock > 0) {
      // Notify admin
      await notifyAdminLowStock({
        name: product.name,
        stock: product.stock,
        threshold
      });
      
      // Notify customers who wishlisted this item
      const wishlisters = await getCustomersWhoWishlisted(product.id);
      for (const customer of wishlisters) {
        await sendLowStockAlertNotification(customer.id, {
          name: product.name,
          image: product.image,
          price: product.price,
          stock: product.stock
        });
      }
    }
  }
}

// Run every hour
setInterval(checkInventoryLevels, 60 * 60 * 1000);
```

### Example 5: Back in Stock Notifications

```typescript
// File: src/lib/stock-updater.ts

import { sendBackInStockNotification } from "./telegram";

export async function updateProductStock(
  productId: string, 
  newStock: number
) {
  const product = await getProductById(productId);
  const wasOutOfStock = product.stock === 0;
  
  // Update stock
  await updateProduct(productId, { stock: newStock });
  
  // If back in stock, notify interested customers
  if (wasOutOfStock && newStock > 0) {
    const subscribers = await getStockNotificationSubscribers(productId);
    
    for (const subscriber of subscribers) {
      await sendBackInStockNotification(subscriber.customerId, {
        name: product.name,
        image: product.image,
        price: product.price
      });
    }
    
    // Clear notification subscriptions
    await clearStockNotificationSubscribers(productId);
  }
}
```

---

## Customer Service Integration

### Example 6: Customer Support Dashboard

```typescript
// File: src/app/admin/support/page.tsx

"use client";

import { useState } from "react";
import { sendMessageSafe } from "@/lib/telegram/api-client";

export default function SupportPage() {
  const [chatId, setChatId] = useState("");
  const [message, setMessage] = useState("");
  
  const handleSendMessage = async () => {
    const success = await sendMessageSafe(chatId, message);
    if (success) {
      alert("Message sent successfully!");
      setMessage("");
    } else {
      alert("Failed to send message");
    }
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Send Customer Message</h1>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Customer Telegram Chat ID"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          className="w-full px-4 py-2 border rounded"
        />
        
        <textarea
          placeholder="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full px-4 py-2 border rounded"
        />
        
        <button
          onClick={handleSendMessage}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Send Message
        </button>
      </div>
    </div>
  );
}
```

### Example 7: Automated Refund Processing

```typescript
// File: src/lib/refund-processor.ts

import {
  sendRefundProcessedNotification,
  notifyAdmin
} from "./telegram";

export async function processRefund(
  orderId: string,
  refundAmount: number,
  reason: string
) {
  try {
    const order = await getOrderById(orderId);
    const customer = await getCustomerByOrderId(orderId);
    
    // Process refund through payment gateway
    const refund = await processPaymentRefund(
      order.paymentTransactionId,
      refundAmount
    );
    
    if (refund.success) {
      // Update order status
      await updateOrder(orderId, {
        status: "refunded",
        refundAmount,
        refundReason: reason,
        refundedAt: new Date()
      });
      
      // Notify customer
      await sendRefundProcessedNotification(
        customer.id,
        order,
        refundAmount
      );
      
      // Notify admin
      await notifyAdmin(
        `Refund processed for order ${order.orderRef}: ${refundAmount} THB`
      );
    }
    
    return refund;
  } catch (error) {
    console.error("Refund processing failed:", error);
    throw error;
  }
}
```

---

## Marketing Campaigns

### Example 8: Flash Sale Announcement

```typescript
// File: src/app/admin/marketing/flash-sale/page.tsx

"use client";

import { useState } from "react";
import { sendBulkNotification } from "@/lib/telegram";

export default function FlashSalePage() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  const handleSendFlashSale = async () => {
    setSending(true);
    
    const res = await sendBulkNotification(
      `🎉 *FLASH SALE ALERT\\!*\n\n${message}\n\nShop now: /products`,
      true // only to customers who enabled promotions
    );
    
    setResult(res);
    setSending(false);
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Flash Sale Announcement</h1>
      
      <textarea
        placeholder="Enter flash sale details..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={6}
        className="w-full px-4 py-2 border rounded mb-4"
      />
      
      <button
        onClick={handleSendFlashSale}
        disabled={sending}
        className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
      >
        {sending ? "Sending..." : "Send to All Customers"}
      </button>
      
      {result && (
        <div className="mt-4 p-4 bg-green-50 rounded">
          <p>✅ Sent to {result.sent} customers</p>
          {result.failed > 0 && (
            <p className="text-red-600">❌ {result.failed} failed</p>
          )}
        </div>
      )}
    </div>
  );
}
```

### Example 9: New Arrival Announcements

```typescript
// File: src/lib/product-publisher.ts

import { sendPromotionNotification } from "./telegram";
import { getAllTelegramCustomers } from "./telegram";

export async function announceNewArrivals(products: any[]) {
  const customers = await getAllTelegramCustomers();
  
  for (const customer of customers) {
    // Rate limiting: 35ms between messages
    await new Promise(resolve => setTimeout(resolve, 35));
    
    await sendPromotionNotification(customer.id, {
      title: "🆕 New Arrivals Just Landed!",
      description: `Check out our latest collection! ${products.length} new items added.`,
      image: products[0]?.image
    });
  }
}
```

### Example 10: Personalized Promotions

```typescript
// File: src/lib/personalized-marketing.ts

import { sendPromotionNotification } from "./telegram";

export async function sendPersonalizedPromotions() {
  const customers = await getAllCustomersWithPurchaseHistory();
  
  for (const customer of customers) {
    // Analyze purchase history
    const preferences = await analyzeCustomerPreferences(customer.id);
    
    // Generate personalized promotion
    const promo = await generatePersonalizedPromo(preferences);
    
    if (promo && customer.telegramChatId) {
      await sendPromotionNotification(customer.id, {
        title: `Special Offer Just for You! ${promo.discountPercent}% Off`,
        description: promo.description,
        couponCode: promo.code,
        image: promo.image
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 35));
    }
  }
}
```

---

## Admin Dashboard Integration

### Example 11: Real-time Order Monitoring

```typescript
// File: src/lib/order-monitor.ts

import { notifyAdminNewOrder, notifyAdminError } from "./telegram";

// Firebase realtime listener
export function startOrderMonitoring() {
  const ordersRef = collection(db, "onlineOrders");
  const q = query(ordersRef, where("status", "==", "pending"));
  
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const order = change.doc.data();
        
        try {
          await notifyAdminNewOrder({
            orderRef: order.orderRef,
            total: order.totalAmount,
            paymentMethod: order.paymentMethod,
            customerName: order.customerName
          });
        } catch (error) {
          console.error("Failed to notify admin:", error);
        }
      }
    });
  }, (error) => {
    notifyAdminError({
      message: "Order monitoring error",
      context: "Firebase snapshot listener",
      stack: error.stack
    });
  });
}
```

### Example 12: System Health Monitoring

```typescript
// File: src/lib/health-monitor.ts

import { notifyAdminError } from "./telegram";

export function setupHealthMonitoring() {
  // Monitor database connection
  setInterval(async () => {
    try {
      await db.collection("health").doc("check").get();
    } catch (error) {
      await notifyAdminError({
        message: "Database connection failed",
        context: "Health check",
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Monitor API response times
  monitorAPIPerformance();
  
  // Monitor error rates
  monitorErrorRates();
}

function monitorErrorRates() {
  let errorCount = 0;
  const THRESHOLD = 10;
  const TIME_WINDOW = 60 * 1000; // 1 minute
  
  setInterval(async () => {
    if (errorCount >= THRESHOLD) {
      await notifyAdminError({
        message: `High error rate detected: ${errorCount} errors in ${TIME_WINDOW / 1000}s`,
        context: "Error rate monitoring"
      });
      errorCount = 0;
    }
  }, TIME_WINDOW);
  
  // Track errors
  process.on("uncaughtException", () => {
    errorCount++;
  });
}
```

---

## Integration Best Practices

### 1. Error Handling

Always handle errors gracefully:

```typescript
try {
  const success = await sendOrderConfirmationNotification(customerId, order);
  if (!success) {
    // Log error but don't fail the order
    console.error("Failed to send Telegram notification");
    // Could retry later or use fallback notification method
  }
} catch (error) {
  console.error("Telegram notification error:", error);
  // Order should still succeed even if notification fails
}
```

### 2. Async Processing

Don't block critical paths:

```typescript
// BAD: Blocking order creation
await createOrder(order);
await sendOrderConfirmationNotification(customerId, order); // Blocks response

// GOOD: Fire and forget
await createOrder(order);
sendOrderConfirmationNotification(customerId, order).catch(console.error);
return { success: true, order };
```

### 3. Rate Limiting

Respect Telegram's rate limits:

```typescript
// For bulk operations
const customers = await getAllTelegramCustomers();
for (const customer of customers) {
  await sendPromotionNotification(customer.id, promo);
  await new Promise(resolve => setTimeout(resolve, 35)); // 35ms delay
}
```

### 4. User Preferences

Always check notification preferences:

```typescript
const customer = await getCustomerById(customerId);
if (customer?.notificationPreferences?.promotions) {
  await sendPromotionNotification(customerId, promo);
}
```

### 5. Logging

Log all notification attempts:

```typescript
console.log(`📨 Sending notification to customer ${customerId}`);
const success = await sendOrderConfirmationNotification(customerId, order);
console.log(success ? "✅ Sent successfully" : "❌ Failed to send");
```

---

## Testing Your Integration

### Test in Development

```typescript
// test-telegram.ts
import { sendAdminTestNotification } from "./lib/telegram";

async function test() {
  await sendAdminTestNotification();
  console.log("Test notification sent!");
}

test();
```

Run with:
```bash
npx ts-node test-telegram.ts
```

### Test Notifications

```bash
curl -X POST http://localhost:3001/api/telegram/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "type": "promotion",
    "customerId": "test_customer_id",
    "data": {
      "promotion": {
        "title": "Test Promotion",
        "description": "This is a test",
        "couponCode": "TEST123"
      }
    }
  }'
```

---

## Conclusion

These examples demonstrate how to integrate Telegram notifications throughout your e-commerce platform. Remember to:

- Handle errors gracefully
- Respect rate limits
- Check user preferences
- Use async processing
- Test thoroughly before production

For more information, see:
- `TELEGRAM_INTEGRATION.md` - Setup guide
- `TELEGRAM_API_REFERENCE.md` - API documentation
