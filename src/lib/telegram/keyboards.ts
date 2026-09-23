/**
 * Telegram Inline Keyboard Builders
 */

import type { InlineKeyboard, InlineKeyboardButton } from "./types";
import type { SearchProduct } from "../productSearch";
import type { OrderInfo } from "../orderSupport";

/**
 * Create main menu keyboard
 */
export function createMainMenuKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "🛍️ Browse Products", callback_data: "menu_products" },
        { text: "🔍 Search", callback_data: "menu_search" },
      ],
      [
        { text: "🛒 My Cart", callback_data: "menu_cart" },
        { text: "📦 My Orders", callback_data: "menu_orders" },
      ],
      [
        { text: "🎁 Promotions", callback_data: "menu_promotions" },
        { text: "👤 Profile", callback_data: "menu_profile" },
      ],
      [{ text: "❓ Help", callback_data: "menu_help" }],
    ],
  };
}

/**
 * Create product categories keyboard
 */
export function createCategoriesKeyboard(): InlineKeyboard {
  const categories = [
    { text: "👕 T-Shirts", callback_data: "category_t-shirt" },
    { text: "👔 Shirts", callback_data: "category_shirt" },
    { text: "👖 Jeans", callback_data: "category_jeans" },
    { text: "👗 Dresses", callback_data: "category_dress" },
    { text: "🧥 Jackets", callback_data: "category_jacket" },
    { text: "👟 Shoes", callback_data: "category_shoes" },
    { text: "🔙 Back", callback_data: "menu_main" },
  ];

  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < categories.length - 1; i += 2) {
    rows.push(categories.slice(i, i + 2));
  }
  rows.push([categories[categories.length - 1]]);

  return { inline_keyboard: rows };
}

/**
 * Create product detail keyboard
 */
export function createProductKeyboard(
  productId: string,
  inStock: boolean = true
): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];

  if (inStock) {
    buttons.push([
      { text: "➕ Add to Cart", callback_data: `product_add_${productId}` },
      { text: "🔍 View Details", callback_data: `product_view_${productId}` },
    ]);
  } else {
    buttons.push([
      { text: "🔔 Notify When Available", callback_data: `product_notify_${productId}` },
    ]);
  }

  buttons.push([
    { text: "🔙 Back to List", callback_data: "menu_products" },
    { text: "🏠 Main Menu", callback_data: "menu_main" },
  ]);

  return { inline_keyboard: buttons };
}

/**
 * Create pagination keyboard
 */
export function createPaginationKeyboard(
  currentPage: number,
  totalPages: number,
  prefix: string = "page"
): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];

  const navRow: InlineKeyboardButton[] = [];

  if (currentPage > 1) {
    navRow.push({
      text: "⬅️ Previous",
      callback_data: `${prefix}_${currentPage - 1}`,
    });
  }

  navRow.push({
    text: `📄 ${currentPage}/${totalPages}`,
    callback_data: "noop",
  });

  if (currentPage < totalPages) {
    navRow.push({
      text: "➡️ Next",
      callback_data: `${prefix}_${currentPage + 1}`,
    });
  }

  buttons.push(navRow);
  buttons.push([{ text: "🔙 Back", callback_data: "menu_main" }]);

  return { inline_keyboard: buttons };
}

/**
 * Create cart keyboard
 */
export function createCartKeyboard(hasItems: boolean = true): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];

  if (hasItems) {
    buttons.push([
      { text: "🛍️ Checkout", callback_data: "cart_checkout" },
      { text: "🗑️ Clear Cart", callback_data: "cart_clear" },
    ]);
  }

  buttons.push([
    { text: "➕ Add More Items", callback_data: "menu_products" },
    { text: "🏠 Main Menu", callback_data: "menu_main" },
  ]);

  return { inline_keyboard: buttons };
}

/**
 * Create cart item keyboard
 */
export function createCartItemKeyboard(itemId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "➖", callback_data: `cart_decrease_${itemId}` },
        { text: "🗑️ Remove", callback_data: `cart_remove_${itemId}` },
        { text: "➕", callback_data: `cart_increase_${itemId}` },
      ],
    ],
  };
}

/**
 * Create order detail keyboard
 */
export function createOrderKeyboard(order: OrderInfo): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];

  // Add action buttons based on order status
  const actionRow: InlineKeyboardButton[] = [];

  if (order.status.toLowerCase() === "shipped" || order.status.toLowerCase() === "processing") {
    actionRow.push({
      text: "📍 Track Order",
      callback_data: `order_track_${order.orderRef}`,
    });
  }

  if (
    order.status.toLowerCase() === "pending" ||
    order.status.toLowerCase() === "confirmed"
  ) {
    actionRow.push({
      text: "❌ Cancel Order",
      callback_data: `order_cancel_${order.orderRef}`,
    });
  }

  if (order.status.toLowerCase() === "delivered") {
    actionRow.push({
      text: "↩️ Return/Refund",
      callback_data: `order_return_${order.orderRef}`,
    });
  }

  if (actionRow.length > 0) {
    buttons.push(actionRow);
  }

  buttons.push([
    { text: "🔙 Back to Orders", callback_data: "menu_orders" },
    { text: "🏠 Main Menu", callback_data: "menu_main" },
  ]);

  return { inline_keyboard: buttons };
}

/**
 * Create confirmation keyboard
 */
export function createConfirmationKeyboard(
  confirmData: string,
  cancelData: string = "menu_main"
): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm", callback_data: confirmData },
        { text: "❌ Cancel", callback_data: cancelData },
      ],
    ],
  };
}

/** Storefront base URL with any trailing slashes removed. */
export function storefrontBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(
    /\/+$/,
    "",
  );
}

/**
 * Can Telegram accept this URL on an inline keyboard button?
 *
 * Telegram validates button URLs server-side and rejects anything that is not
 * publicly resolvable with `Bad Request: ... is invalid: Wrong HTTP URL`. That
 * rejection fails the whole `sendMessage`, so a localhost URL does not merely
 * produce a dead button — it means the message never arrives at all.
 *
 * Local development therefore cannot use a URL button, and callers need to fall
 * back to putting the link in the message text (which is not validated).
 */
export function isTelegramLinkableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.protocol === "https:") return true;

    // Plain http is only accepted for a real public host.
    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost");
    return !isLocal && host.includes(".");
  } catch {
    return false;
  }
}

/** Absolute URL a customer opens to finish linking their Telegram account. */
export function accountLinkUrl(token: string): string {
  return `${storefrontBaseUrl()}/account/link-telegram?token=${token}`;
}

/**
 * Create account link keyboard.
 *
 * Returns `null` when the storefront URL is not something Telegram will accept
 * on a button, so the caller can degrade to a text link instead of having the
 * whole message rejected.
 */
export function createAccountLinkKeyboard(token: string): InlineKeyboard | null {
  const linkUrl = accountLinkUrl(token);

  if (!isTelegramLinkableUrl(linkUrl)) {
    return null;
  }

  return {
    inline_keyboard: [
      [{ text: "🔗 Link Account", url: linkUrl }],
      [{ text: "🔙 Back", callback_data: "menu_main" }],
    ],
  };
}

/**
 * Create size selection keyboard
 */
export function createSizeKeyboard(
  productId: string,
  sizes: string[]
): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];

  // Group sizes in rows of 3
  for (let i = 0; i < sizes.length; i += 3) {
    const row = sizes.slice(i, i + 3).map((size) => ({
      text: size,
      callback_data: `select_size_${productId}_${size}`,
    }));
    buttons.push(row);
  }

  buttons.push([{ text: "🔙 Back", callback_data: `product_view_${productId}` }]);

  return { inline_keyboard: buttons };
}

/**
 * Create color selection keyboard
 */
export function createColorKeyboard(
  productId: string,
  colors: string[]
): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];

  // Group colors in rows of 2
  for (let i = 0; i < colors.length; i += 2) {
    const row = colors.slice(i, i + 2).map((color) => ({
      text: `🎨 ${color}`,
      callback_data: `select_color_${productId}_${color}`,
    }));
    buttons.push(row);
  }

  buttons.push([{ text: "🔙 Back", callback_data: `product_view_${productId}` }]);

  return { inline_keyboard: buttons };
}

/**
 * Create back button
 */
export function createBackButton(callbackData: string = "menu_main"): InlineKeyboard {
  return {
    inline_keyboard: [[{ text: "🔙 Back", callback_data: callbackData }]],
  };
}

/**
 * Create web app button
 */
export function createWebAppButton(text: string, url: string): InlineKeyboard {
  return {
    inline_keyboard: [[{ text, web_app: { url } }]],
  };
}
