/**
 * Telegram Inline Keyboard Builders
 */

import type { InlineKeyboard, InlineKeyboardButton } from "./types";
import type { SearchProduct } from "../productSearch";
import type { OrderInfo } from "../orderSupport";
import { publicSiteUrl } from "../publicUrl";

/**
 * Create main menu keyboard
 */
/**
 * Main menu.
 *
 * `branchName` adds a row showing which branch the customer is shopping, with a
 * way to switch. Everything below it is scoped to that branch, so leaving it
 * unlabelled would make stock differences between branches look like bugs.
 */
export function createMainMenuKeyboard(branchName?: string): InlineKeyboard {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: "🛍️ Browse Products", callback_data: "menu_products" },
      { text: "🔍 Search", callback_data: "menu_search" },
    ],
    [
      { text: "✨ New Arrivals", callback_data: "browse_new_1" },
      { text: "🔥 Best Sellers", callback_data: "browse_best_1" },
    ],
    [
      { text: "🛒 My Cart", callback_data: "menu_cart" },
      { text: "📦 My Orders", callback_data: "menu_orders" },
    ],
    [
      { text: "🎁 Promotions", callback_data: "menu_promotions" },
      { text: "👤 Profile", callback_data: "menu_profile" },
    ],
  ];

  if (branchName) {
    rows.push([
      {
        text: `🏪 ${branchName} — change`,
        callback_data: "menu_branch",
      },
    ]);
  }

  rows.push([{ text: "❓ Help", callback_data: "menu_help" }]);

  return { inline_keyboard: rows };
}

/**
 * Branch picker.
 *
 * Buttons carry the shop **id**, which is what `stocks.shop` stores, so the
 * selection survives a branch being renamed. Ids are 20 characters, so
 * `branch_<id>` sits well inside Telegram's 64-byte callback_data limit — unlike
 * branch names, which are owner-entered and may be non-Latin.
 */
export function createBranchKeyboard(
  shops: Array<{ id: string; name: string }>,
  currentId?: string,
): InlineKeyboard {
  const rows: InlineKeyboardButton[][] = shops.map((shop) => [
    {
      text: `${shop.id === currentId ? "✅" : "🏪"} ${shop.name}`,
      callback_data: `branch_${shop.id}`,
    },
  ]);

  return { inline_keyboard: rows };
}

/**
 * Decorative icon for a category name.
 *
 * Category names come from whatever the owner typed in the POS, so there is no
 * icon field to read. Best-effort match on common clothing words, falling back
 * to a neutral tag. Purely cosmetic — never used for filtering.
 */
function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  // Order matters: the first match wins, so more specific words come first.
  // "Short Skirt" must hit the skirt rule before the "short" bottoms rule.
  const table: Array<[string[], string]> = [
    [["skirt"], "👚"],
    [["t-shirt", "tshirt", "tee", "top"], "👕"],
    [["shirt", "blouse"], "👔"],
    [["dress", "gown"], "👗"],
    [["hoodie", "sweater", "sweatshirt"], "🧶"],
    [["jacket", "coat", "outer"], "🧥"],
    [["jean", "trouser", "pant", "short", "bottom"], "👖"],
    [["shoe", "sneaker", "sandal", "boot", "footwear"], "👟"],
    [["bag", "purse", "backpack"], "👜"],
    [["hat", "cap"], "🧢"],
    [["accessor", "jewel", "watch", "belt"], "💎"],
    [["set", "outfit"], "👘"],
    [["kid", "child", "baby"], "🧸"],
  ];

  for (const [needles, icon] of table) {
    if (needles.some((needle) => n.includes(needle))) return icon;
  }
  return "🏷️";
}

/** Keep the keyboard tappable; the rest stay reachable from the website. */
const MAX_CATEGORY_BUTTONS = 24;

/**
 * Create the product categories keyboard from the store's own categories.
 *
 * Buttons carry the category's **index**, not its name. Names are owner-entered
 * and may be non-Latin — a Burmese name costs 3 bytes per character in UTF-8, so
 * it can exceed Telegram's 64-byte callback_data limit, and Telegram rejects the
 * entire message when that happens. The index is re-resolved against a fresh
 * read when the button is tapped; see `handleCategoryCallback`.
 */
export function createCategoriesKeyboard(categories: string[]): InlineKeyboard {
  const shown = categories.slice(0, MAX_CATEGORY_BUTTONS);

  const buttons: InlineKeyboardButton[] = shown.map((name, index) => ({
    text: `${categoryIcon(name)} ${name.length > 24 ? `${name.slice(0, 23)}…` : name}`,
    callback_data: `category_${index}`,
  }));

  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  rows.push([{ text: "🛍️ All Products", callback_data: "category_all" }]);
  rows.push([{ text: "🔙 Back", callback_data: "menu_main" }]);

  return { inline_keyboard: rows };
}

/**
 * Keyboard under a page of browse results.
 *
 * One numbered button per product on the page, then Prev/Next, then a way back
 * to the category list. `selector` is the category index or "all", matching the
 * `browse_<selector>_<page>` callback the handler parses.
 */
export function createBrowseKeyboard(options: {
  selector: string;
  page: number;
  totalPages: number;
  /** Product ids on this page, in display order. */
  productIds: string[];
  /** 1-based number of the first product, so labels match the text. */
  firstIndex: number;
  /** Absolute storefront URL for this listing, when one can be linked. */
  websiteUrl?: string;
  /**
   * Skip the per-product number buttons. Used when each product was already
   * sent as its own photo card carrying its own Add to Cart / View Details.
   */
  navigationOnly?: boolean;
}): InlineKeyboard {
  const rows: InlineKeyboardButton[][] = [];

  // Numbered shortcuts to each product on this page.
  if (!options.navigationOnly) {
    const numberRow: InlineKeyboardButton[] = options.productIds.map((id, i) => ({
      text: String(options.firstIndex + i),
      callback_data: `product_view_${id}`,
    }));
    if (numberRow.length > 0) rows.push(numberRow);
  }

  if (options.totalPages > 1) {
    const nav: InlineKeyboardButton[] = [];

    if (options.page > 1) {
      nav.push({
        text: "⬅️ Prev",
        callback_data: `browse_${options.selector}_${options.page - 1}`,
      });
    }

    nav.push({
      text: `📄 ${options.page}/${options.totalPages}`,
      callback_data: "noop",
    });

    if (options.page < options.totalPages) {
      nav.push({
        text: "Next ➡️",
        callback_data: `browse_${options.selector}_${options.page + 1}`,
      });
    }

    rows.push(nav);
  }

  if (options.websiteUrl && isTelegramLinkableUrl(options.websiteUrl)) {
    rows.push([{ text: "🌐 View on website", url: options.websiteUrl }]);
  }

  rows.push([{ text: "🔙 Categories", callback_data: "menu_products" }]);

  return { inline_keyboard: rows };
}

/**
 * Buttons under a product photo card inside a listing.
 *
 * Deliberately compact — five of these appear per page, so it stays to a single
 * row and omits the navigation, which the page's own footer message carries.
 */
export function createProductCardKeyboard(
  productId: string,
  inStock: boolean,
): InlineKeyboard {
  if (!inStock) {
    return {
      inline_keyboard: [
        [{ text: "🔍 View Details", callback_data: `product_view_${productId}` }],
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        { text: "➕ Add to Cart", callback_data: `product_add_${productId}` },
        { text: "🔍 Details", callback_data: `product_view_${productId}` },
      ],
    ],
  };
}

/**
 * Colour picker for adding a product to the cart.
 *
 * Carries the variant's **index** rather than its id or colour name: colour names
 * are owner-entered and may be non-Latin, and callback_data is capped at 64
 * bytes. The index is resolved against a fresh product read on the next step.
 */
export function createColourPickKeyboard(
  productId: string,
  variants: Array<{ color: string; stock: number }>,
): InlineKeyboard {
  const buttons: InlineKeyboardButton[] = variants
    .map((variant, index) => ({ variant, index }))
    .filter(({ variant }) => variant.stock > 0)
    .map(({ variant, index }) => ({
      text: variant.color || `Option ${index + 1}`,
      callback_data: `pick_${productId}_${index}`,
    }));

  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  rows.push([
    { text: "🔙 Back", callback_data: `product_view_${productId}` },
  ]);

  return { inline_keyboard: rows };
}

/**
 * Size picker for a chosen colour variant. `padd_` commits to the cart.
 */
export function createSizePickKeyboard(
  productId: string,
  variantIndex: number,
  sizes: Array<{ size: string; quantity: number }>,
): InlineKeyboard {
  const buttons: InlineKeyboardButton[] = sizes
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.quantity > 0)
    .map(({ entry, index }) => ({
      text: `${entry.size} (${entry.quantity})`,
      callback_data: `padd_${productId}_${variantIndex}_${index}`,
    }));

  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }

  rows.push([
    { text: "🔙 Back", callback_data: `product_add_${productId}` },
  ]);

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

/**
 * Storefront base URL for links sent into a Telegram chat.
 *
 * Delegates to the shared resolver, which prefers a genuinely public address
 * over the build-time `NEXT_PUBLIC_APP_URL` — a button pointing at localhost is
 * useless to the customer and is rejected by Telegram anyway.
 */
export function storefrontBaseUrl(): string {
  return publicSiteUrl();
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
 * Absolute URL for one order inside the customer's purchase history.
 *
 * The history page has no per-order route, so the reference is passed as a query
 * parameter and the page filters itself down to that order on load.
 */
export function orderDetailUrl(orderRef: string): string {
  return `${storefrontBaseUrl()}/account/purchases?order=${encodeURIComponent(orderRef)}`;
}

/**
 * One "view details" button per order, opening it on the website.
 *
 * Returns `null` when the storefront URL is not one Telegram will accept on a
 * button — on a local build the caller must put the links in the message text
 * instead, or the whole message is rejected.
 */
export function createOrderListKeyboard(
  orderRefs: string[],
): InlineKeyboard | null {
  if (!isTelegramLinkableUrl(storefrontBaseUrl())) return null;

  const rows: InlineKeyboardButton[][] = orderRefs.map((ref) => [
    { text: `📄 ${ref}`, url: orderDetailUrl(ref) },
  ]);

  rows.push([
    { text: "🧾 All purchases", url: `${storefrontBaseUrl()}/account/purchases` },
  ]);
  rows.push([{ text: "🏠 Main Menu", callback_data: "menu_main" }]);

  return { inline_keyboard: rows };
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
