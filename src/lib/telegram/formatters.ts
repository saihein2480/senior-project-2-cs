/**
 * Telegram Message Formatters
 * Formats data for Telegram messages with proper escaping
 */

import type { SearchProduct } from "../productSearch";
import type { OrderInfo } from "../orderSupport";

/**
 * Escape special characters for Telegram MarkdownV2
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

/**
 * Format price in MMK
 */
export function formatPrice(priceThb: number): string {
  const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE) || 43;
  const priceMmk = priceThb * mmkRate;
  return new Intl.NumberFormat("en-US").format(priceMmk) + " MMK";
}

/**
 * Format product for Telegram message
 */
export function formatProduct(product: SearchProduct): string {
  const parts: string[] = [];

  parts.push(`🛍️ *${escapeMarkdown(product.name)}*\n`);
  parts.push(`💰 Price: *${escapeMarkdown(formatPrice(product.price))}*`);

  if (product.category) {
    parts.push(`📁 Category: ${escapeMarkdown(product.category)}`);
  }

  if (product.colors && product.colors.length > 0) {
    parts.push(`🎨 Colors: ${product.colors.map(c => escapeMarkdown(c)).join(", ")}`);
  }

  if (product.stock > 0) {
    parts.push(`📦 Stock: ${product.stock} available`);
  } else {
    parts.push(`❌ Out of stock`);
  }

  if (product.isNew) {
    parts.push(`\n✨ *NEW ARRIVAL* ✨`);
  }

  if (product.description) {
    parts.push(`\n${escapeMarkdown(product.description.substring(0, 200))}`);
  }

  return parts.join("\n");
}

/**
 * Format product list for Telegram
 */
export function formatProductList(products: SearchProduct[], page: number = 1, pageSize: number = 5): string {
  if (products.length === 0) {
    return "❌ No products found. Try a different search or browse our categories.";
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageProducts = products.slice(start, end);
  const totalPages = Math.ceil(products.length / pageSize);

  const parts: string[] = [];
  parts.push(`🛍️ *Found ${products.length} product${products.length !== 1 ? 's' : ''}*\n`);
  parts.push(`📄 Page ${page} of ${totalPages}\n`);

  pageProducts.forEach((product, index) => {
    const num = start + index + 1;
    parts.push(`${num}\\. *${escapeMarkdown(product.name)}*`);
    parts.push(`   💰 ${escapeMarkdown(formatPrice(product.price))}`);
    if (product.isNew) parts.push(`   ✨ NEW`);
    parts.push("");
  });

  return parts.join("\n");
}

/**
 * Format order status icon
 */
function getOrderStatusIcon(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "⏳",
    confirmed: "✅",
    processing: "📦",
    shipped: "🚚",
    delivered: "🎉",
    cancelled: "❌",
    refunded: "💰",
  };
  return statusMap[status.toLowerCase()] || "📋";
}

/**
 * Format order for Telegram message
 */
export function formatOrder(order: OrderInfo): string {
  const parts: string[] = [];

  const statusIcon = getOrderStatusIcon(order.status);
  parts.push(`📦 *Order ${escapeMarkdown(order.orderRef)}*\n`);
  parts.push(`${statusIcon} *Status:* ${escapeMarkdown(order.status)}`);
  parts.push(`💳 *Payment:* ${escapeMarkdown(order.paymentMethod)} \\(${escapeMarkdown(order.paymentStatus)}\\)`);
  parts.push(`💰 *Total:* ${escapeMarkdown(formatPrice(order.totalAmount))}\n`);

  if (order.items && order.items.length > 0) {
    parts.push(`📋 *Items:*`);
    order.items.forEach((item) => {
      parts.push(
        `  • ${escapeMarkdown(item.productName)} x${item.quantity} \\- ${escapeMarkdown(formatPrice(item.price))}`
      );
    });
    parts.push("");
  }

  if (order.trackingNumber) {
    parts.push(`🔢 *Tracking:* ${escapeMarkdown(order.trackingNumber)}`);
  }

  const orderDate = new Date(order.createdAt);
  parts.push(
    `📅 *Ordered:* ${escapeMarkdown(orderDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }))}`
  );

  return parts.join("\n");
}

/**
 * Format order list for Telegram
 */
export function formatOrderList(orders: OrderInfo[]): string {
  if (orders.length === 0) {
    return "📦 You don't have any orders yet.\n\nStart shopping with /products or /search";
  }

  const parts: string[] = [];
  parts.push(`📦 *Your Recent Orders*\n`);

  orders.forEach((order, index) => {
    const statusIcon = getOrderStatusIcon(order.status);
    parts.push(
      `${index + 1}\\. ${statusIcon} *${escapeMarkdown(order.orderRef)}* \\- ${escapeMarkdown(formatPrice(order.totalAmount))}`
    );
    parts.push(`   ${escapeMarkdown(order.status)} • ${escapeMarkdown(order.paymentMethod)}`);
    parts.push("");
  });

  parts.push("Tap an order to view details\\.");

  return parts.join("\n");
}

/**
 * Format cart for Telegram message
 */
export function formatCart(items: any[], subtotal: number): string {
  if (items.length === 0) {
    return "🛒 Your cart is empty.\n\nStart shopping with /products or /search";
  }

  const parts: string[] = [];
  parts.push(`🛒 *Your Shopping Cart*\n`);

  items.forEach((item, index) => {
    parts.push(`${index + 1}\\. *${escapeMarkdown(item.name)}*`);
    if (item.color) parts.push(`   Color: ${escapeMarkdown(item.color)}`);
    if (item.size) parts.push(`   Size: ${escapeMarkdown(item.size)}`);
    parts.push(
      `   ${escapeMarkdown(formatPrice(item.price))} x ${item.quantity} \\= ${escapeMarkdown(formatPrice(item.price * item.quantity))}`
    );
    parts.push("");
  });

  parts.push(`💰 *Subtotal:* ${escapeMarkdown(formatPrice(subtotal))}`);

  return parts.join("\n");
}

/**
 * Format welcome message
 */
export function formatWelcomeMessage(firstName?: string): string {
  const greeting = firstName ? `Hi ${escapeMarkdown(firstName)}` : "Hello";

  return `${greeting}\\! 👋

Welcome to *Swe Trendy Hub* \\- your personal shopping assistant\\!

I can help you:
🛍️ Browse and search products
📦 Track your orders
🤖 Get AI\\-powered recommendations
🛒 Manage your shopping cart
🎁 View promotions and deals

*Quick Start:*
• /products \\- Browse all products
• /search \\- Search for specific items
• /promotions \\- View current deals
• /help \\- See all commands

Let's find your perfect style\\! 💫`;
}

/**
 * Format help message
 */
export function formatHelpMessage(): string {
  return `🤖 *Swe Trendy Hub Bot Help*

*Shopping Commands:*
/products \\- Browse all products
/search \\<query\\> \\- Search for products
/cart \\- View your shopping cart
/promotions \\- Current deals & offers

*Order Commands:*
/orders \\- View your order history
/track \\<orderRef\\> \\- Track an order
/cancel \\<orderRef\\> \\- Cancel an order

*Account Commands:*
/profile \\- View your profile
/link \\- Link your web account
/account \\- Account settings

*Other Commands:*
/help \\- Show this message
/start \\- Show main menu

*Natural Language:*
You can also just chat with me naturally\\!

Examples:
• "Show me black jeans"
• "Where is my order OR12345678?"
• "I need an outfit for work"
• "Any discounts available?"

Need more help? Visit our website or contact support\\!`;
}

/**
 * Truncate text to fit Telegram limits
 */
export function truncateText(text: string, maxLength: number = 4096): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Format error message
 */
export function formatError(error: string): string {
  return `❌ *Error*\n\n${escapeMarkdown(error)}\n\nPlease try again or contact support if the problem persists\\.`;
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return `✅ *Success*\n\n${escapeMarkdown(message)}`;
}
