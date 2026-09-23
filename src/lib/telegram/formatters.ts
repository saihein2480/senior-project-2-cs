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
 * THB -> MMK rate used by `formatPrice`.
 *
 * Held in module state so `formatPrice` can stay synchronous — it is called from
 * deep inside message builders that have no business doing I/O. Callers prime it
 * once per interaction via `setMmkRate(await getMmkRate())`; see `primeCurrency`
 * in bot-service. The fallback chain matches the storefront's `useCurrencyRate()`
 * so an unprimed call still quotes the same number the website would.
 */
let activeMmkRate = (() => {
  const envRate = Number(process.env.NEXT_PUBLIC_MMK_RATE);
  return Number.isFinite(envRate) && envRate > 0 ? envRate : 55;
})();

/** Point `formatPrice` at the owner's configured rate. */
export function setMmkRate(rate: number): void {
  if (Number.isFinite(rate) && rate > 0) {
    activeMmkRate = rate;
  }
}

export function getActiveMmkRate(): number {
  return activeMmkRate;
}

/** `฿1,075` — integers stay whole, fractions keep two places. */
function formatThb(priceThb: number): string {
  const rounded = Math.round(priceThb * 100) / 100;
  return `฿${
    Number.isInteger(rounded)
      ? rounded.toLocaleString("en-US")
      : rounded.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  }`;
}

/** `15,050 Ks` — matches the storefront's MMK label. */
function formatMmk(priceThb: number): string {
  return `${Math.round(priceThb * activeMmkRate).toLocaleString("en-US")} Ks`;
}

/**
 * Format a THB price showing both currencies, e.g. `฿1,075 (15,050 Ks)`.
 *
 * The website shows one currency at a time because the customer picks it in the
 * header; a chat has no such switch, so both are shown rather than guessing.
 */
export function formatPrice(priceThb: number): string {
  const amount = Number(priceThb) || 0;
  return `${formatThb(amount)} (${formatMmk(amount)})`;
}

/** MMK only, for tight spots like cart line totals. */
export function formatPriceMmk(priceThb: number): string {
  return formatMmk(Number(priceThb) || 0);
}

/**
 * Format product for Telegram message
 */
export function formatProduct(product: SearchProduct): string {
  const parts: string[] = [];

  parts.push(`🛍️ *${escapeMarkdown(product.displayName || product.name)}*\n`);
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

/** How many products fit comfortably in one chat message. */
export const PRODUCTS_PER_PAGE = 5;

export interface ProductPage {
  /** Products on this page, in order. */
  items: SearchProduct[];
  /** 1-based, already clamped into range. */
  page: number;
  totalPages: number;
  total: number;
  /** 1-based index of the first item, for "showing 6-10 of 34". */
  firstIndex: number;
}

/**
 * Slice a result set into a page, clamping the requested page into range.
 *
 * Shared by the renderer and by the caller that builds the pagination keyboard,
 * so the buttons can never disagree with the text about how many pages there are.
 */
export function paginateProducts(
  products: SearchProduct[],
  page: number,
  pageSize: number = PRODUCTS_PER_PAGE,
): ProductPage {
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: products.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    firstIndex: start + 1,
  };
}

/**
 * How many genuinely different colours a product offers.
 *
 * Counted on distinct names rather than `colorVariants.length`, because
 * `searchProducts` merges same-named products and concatenates their variants —
 * an unscoped search therefore reports "4 colours" for a product that has two,
 * listed once per branch.
 */
function distinctColours(product: SearchProduct): number {
  const names = new Set<string>();

  for (const variant of product.colorVariants || []) {
    const name = (variant.color || "").trim().toLowerCase();
    if (name) names.add(name);
  }

  if (names.size > 0) return names.size;

  return new Set(
    (product.colors || []).map((c) => c.trim().toLowerCase()).filter(Boolean),
  ).size;
}

/** Distinct sizes that are actually in stock, e.g. ["S","M","L"]. */
function inStockSizes(product: SearchProduct): string[] {
  const sizes = new Set<string>();
  for (const variant of product.colorVariants || []) {
    for (const sq of variant.sizeQuantities || []) {
      if (Number(sq.quantity) > 0 && sq.size) sizes.add(String(sq.size));
    }
  }
  return [...sizes];
}

/**
 * Format one page of products.
 *
 * Mirrors what a product card shows on the website — name, price, colours,
 * sizes, stock state and the NEW badge — because this list is the customer's
 * only view of the catalogue inside Telegram.
 */
export function formatProductPage(
  pageData: ProductPage,
  heading?: string,
  /**
   * Closing line. Defaults to the numbered-button hint; pass something else when
   * the products were sent as cards carrying their own buttons, and "" to omit.
   */
  footerHint: string = "Tap a number below to see details.",
): string {
  if (pageData.total === 0) {
    return "❌ No products found. Try a different search or browse our categories.";
  }

  const lastIndex = pageData.firstIndex + pageData.items.length - 1;
  const parts: string[] = [];

  if (heading) parts.push(`🛍️ *${escapeMarkdown(heading)}*`);
  parts.push(
    escapeMarkdown(
      `Showing ${pageData.firstIndex}-${lastIndex} of ${pageData.total} product${pageData.total !== 1 ? "s" : ""}`,
    ),
  );
  parts.push("");

  pageData.items.forEach((product, index) => {
    const num = pageData.firstIndex + index;
    const title = product.displayName || product.name;

    parts.push(`${num}\\. *${escapeMarkdown(title)}*`);
    parts.push(`   💰 ${escapeMarkdown(formatPrice(product.price))}`);

    const colours = distinctColours(product);
    if (colours > 1) {
      parts.push(`   🎨 ${colours} colours`);
    }

    const sizes = inStockSizes(product);
    if (sizes.length > 0) {
      parts.push(`   📐 ${escapeMarkdown(sizes.join(", "))}`);
    }

    if (product.stock > 0) {
      parts.push(`   📦 ${product.stock} in stock`);
    } else {
      parts.push(`   ❌ Out of stock`);
    }

    if (product.isNew) parts.push(`   ✨ NEW`);
    parts.push("");
  });

  if (footerHint) parts.push(escapeMarkdown(footerHint));

  return parts.join("\n");
}

/**
 * Format product list for Telegram.
 *
 * @deprecated Use `paginateProducts` + `formatProductPage`, which keep the page
 * text and the pagination buttons derived from the same numbers. This wrapper
 * printed "Page 1 of 7" with no way to reach page 2.
 */
export function formatProductList(products: SearchProduct[], page: number = 1, pageSize: number = 5): string {
  return formatProductPage(paginateProducts(products, page, pageSize));
}

/**
 * Caption for one product sent as a photo card in a listing.
 *
 * Kept inside Telegram's 1024-character caption limit: a caption that overflows
 * makes `sendPhoto` fail outright, which would drop the product entirely.
 */
export function formatProductCard(
  product: SearchProduct,
  position?: { index: number; total: number },
): string {
  const parts: string[] = [];
  const title = product.displayName || product.name;

  parts.push(`🛍️ *${escapeMarkdown(title)}*`);
  parts.push(`💰 ${escapeMarkdown(formatPrice(product.price))}`);

  const colours = distinctColours(product);
  if (colours > 1) parts.push(`🎨 ${colours} colours`);

  const sizes = inStockSizes(product);
  if (sizes.length > 0) {
    parts.push(`📐 ${escapeMarkdown(sizes.join(", "))}`);
  }

  parts.push(
    product.stock > 0 ? `📦 ${product.stock} in stock` : `❌ Out of stock`,
  );

  if (product.isNew) parts.push(`✨ *NEW ARRIVAL*`);

  if (position) {
    parts.push("");
    parts.push(
      escapeMarkdown(`Item ${position.index} of ${position.total}`),
    );
  }

  const caption = parts.join("\n");
  return caption.length > 1024 ? `${caption.slice(0, 1020)}...` : caption;
}

/** Shape of the fields `formatProductDetail` needs, from `lib/productInfo`. */
export interface ProductDetailLike {
  name: string;
  price: number;
  category?: string;
  description?: string;
  material?: string;
  availableColors: string[];
  availableSizes: string[];
  totalStock: number;
  stockBySize?: Record<string, number>;
}

/**
 * Full product detail card.
 *
 * Separate from `formatProduct` because the detail lookup returns a
 * `ProductInfo` — `totalStock`/`availableColors`/`availableSizes` — not a
 * `SearchProduct`. The two were previously bridged with an `as any` cast, so the
 * stock and colour lines read from fields that did not exist and every product
 * rendered as "Out of stock" with no colours listed.
 */
export function formatProductDetail(product: ProductDetailLike): string {
  const parts: string[] = [];

  parts.push(`🛍️ *${escapeMarkdown(product.name)}*`);
  parts.push(`💰 *${escapeMarkdown(formatPrice(product.price))}*`);

  if (product.category) {
    parts.push(`📁 ${escapeMarkdown(product.category)}`);
  }

  if (product.availableColors.length > 0) {
    parts.push(`🎨 Colours: ${escapeMarkdown(product.availableColors.join(", "))}`);
  }

  if (product.availableSizes.length > 0) {
    const sizes = product.stockBySize
      ? product.availableSizes
          .map((size) => `${size} (${product.stockBySize?.[size] ?? 0})`)
          .join(", ")
      : product.availableSizes.join(", ");
    parts.push(`📐 Sizes: ${escapeMarkdown(sizes)}`);
  }

  if (product.material) {
    parts.push(`🧵 ${escapeMarkdown(product.material)}`);
  }

  parts.push(
    product.totalStock > 0
      ? `📦 ${product.totalStock} in stock`
      : `❌ Out of stock`,
  );

  if (product.description) {
    parts.push("");
    parts.push(escapeMarkdown(product.description.substring(0, 350)));
  }

  const caption = parts.join("\n");
  return caption.length > 1024 ? `${caption.slice(0, 1020)}...` : caption;
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
