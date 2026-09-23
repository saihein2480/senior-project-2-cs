/**
 * Telegram Bot Service Layer
 * Main bot logic, command handlers, and message processors
 */

import {
  sendMessage,
  sendPhoto,
  sendPhotoSafe,
  answerCallbackQuery,
  sendChatAction,
  editMessageText,
} from "./api-client";
import {
  formatWelcomeMessage,
  formatHelpMessage,
  formatProductList,
  formatProduct,
  formatError,
  formatSuccess,
  escapeMarkdown,
  formatPrice,
  formatOrderList,
  formatOrder,
  formatProductPage,
  formatProductCard,
  formatProductDetail,
  paginateProducts,
  setMmkRate,
} from "./formatters";
import {
  createMainMenuKeyboard,
  createCategoriesKeyboard,
  createBrowseKeyboard,
  createProductKeyboard,
  createProductCardKeyboard,
  createColourPickKeyboard,
  createSizePickKeyboard,
  createCartKeyboard,
  createBackButton,
  storefrontBaseUrl,
} from "./keyboards";
import { searchProducts, type SearchProduct } from "../productSearch";
import { findOrderByRef } from "../orderSupport";
import { getCustomerByTelegramId } from "./customer-service";
import { linkTelegramToCustomer } from "./auth-service";
import { getTelegramCart, addToTelegramCart } from "./cart-service";
import { getProductById } from "../productInfo";
import type { BotContext } from "./types";

/**
 * Process incoming Telegram update
 */
export async function handleTelegramUpdate(update: any): Promise<void> {
  try {
    // Handle text messages
    if (update.message?.text) {
      await handleMessage(update.message);
    }

    // Handle callback queries (button presses)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (error) {
    console.error("Error handling update:", error);
  }
}

/**
 * Handle text messages
 */
async function handleMessage(message: any): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text;
  const userId = message.from.id;
  const firstName = message.from.first_name;
  const username = message.from.username;

  console.log(`📩 Message from ${username || userId}: ${text}`);

  const ctx: BotContext = {
    chatId: chatId.toString(),
    userId,
    username,
    firstName,
    text,
    messageId: message.message_id,
  };

  try {
    // Command handling
    if (text.startsWith("/")) {
      await handleCommand(ctx);
      return;
    }

    // Natural language processing
    await handleNaturalLanguage(ctx);
  } catch (error) {
    console.error("Error handling message:", error);
    await sendMessage({
      chat_id: chatId,
      text: formatError("Sorry, something went wrong. Please try again."),
    });
  }
}

/**
 * Handle commands
 */
async function handleCommand(ctx: BotContext): Promise<void> {
  const text = ctx.text || "";
  const command = text.split(" ")[0].toLowerCase();
  const args = text.split(" ").slice(1).join(" ");

  const commandHandlers: Record<string, () => Promise<void>> = {
    "/start": () => handleStartCommand(ctx, args),
    "/help": () => handleHelpCommand(ctx),
    "/products": () => handleProductsCommand(ctx),
    "/search": () => handleSearchCommand(ctx, args),
    "/cart": () => handleCartCommand(ctx),
    "/orders": () => handleOrdersCommand(ctx),
    "/track": () => handleTrackCommand(ctx, args),
    "/profile": () => handleProfileCommand(ctx),
    "/link": () => handleLinkCommand(ctx),
    "/promotions": () => handlePromotionsCommand(ctx),
    "/cancel": () => handleCancelOrderCommand(ctx, args),
    "/newarrivals": () => renderBrowsePage(ctx, "new", 1),
    "/bestsellers": () => renderBrowsePage(ctx, "best", 1),
  };

  const handler = commandHandlers[command];
  if (handler) {
    await handler();
  } else {
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError(`Unknown command: ${escapeMarkdown(command)}\n\nUse /help to see available commands\\.`),
    });
  }
}

/**
 * Handle /start command.
 *
 * Telegram passes deep-link payloads here: opening
 * `https://t.me/<bot>?start=link_<token>` arrives as `/start link_<token>`.
 * That is how the storefront-initiated linking flow completes — the customer
 * gets the token while signed in on the website, and tapping through proves they
 * also control this chat.
 */
async function handleStartCommand(ctx: BotContext, args = ""): Promise<void> {
  const payload = args.trim();

  if (payload.startsWith("link_")) {
    await completeWebLink(ctx, payload.slice("link_".length));
    return;
  }

  const welcomeMessage = formatWelcomeMessage(ctx.firstName);

  await sendMessage({
    chat_id: ctx.chatId,
    text: welcomeMessage,
    reply_markup: createMainMenuKeyboard(),
  });
}

/**
 * Finish a storefront-initiated link.
 *
 * `ctx.chatId` comes from the Telegram update, so it is the one half of the pair
 * the caller cannot influence; the token supplies the customer. Messages use
 * HTML because emails and error text contain characters MarkdownV2 would choke
 * on.
 */
async function completeWebLink(ctx: BotContext, token: string): Promise<void> {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (!token) {
    await sendMessage({
      chat_id: ctx.chatId,
      text: "⚠️ <b>Link failed</b>\n\nThis link is not valid. Open your profile on our website and tap Connect Telegram again.",
      parse_mode: "HTML",
    });
    return;
  }

  try {
    const existing = await getCustomerByTelegramId(ctx.chatId);
    if (existing) {
      await sendMessage({
        chat_id: ctx.chatId,
        text:
          `✅ <b>Already linked</b>\n\nThis Telegram account is already connected to ` +
          `<b>${escape(existing.email || "your account")}</b>.\n\n` +
          `Use /profile to see your details.`,
        parse_mode: "HTML",
      });
      return;
    }

    const { claimWebLinkToken, linkTelegramToCustomer } = await import(
      "./auth-service"
    );

    const claim = await claimWebLinkToken(token, ctx.chatId);

    if (!claim.valid || !claim.customerId) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: `⚠️ <b>Link failed</b>\n\n${escape(claim.error || "This link is not valid.")}`,
        parse_mode: "HTML",
      });
      return;
    }

    const linked = await linkTelegramToCustomer(claim.customerId, {
      chatId: ctx.chatId,
      username: ctx.username,
      firstName: ctx.firstName,
    });

    if (!linked) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: "⚠️ <b>Link failed</b>\n\nSomething went wrong on our side. Please request a new link and try again.",
        parse_mode: "HTML",
      });
      return;
    }

    // Best-effort: a failed cart merge must not make a successful link look
    // broken to the customer.
    try {
      const { mergeTelegramCartWithCustomer } = await import("./cart-service");
      await mergeTelegramCartWithCustomer(ctx.chatId, claim.customerId);
    } catch (mergeError) {
      console.error("Cart merge after web link failed:", mergeError);
    }

    await sendMessage({
      chat_id: ctx.chatId,
      text:
        `🎉 <b>Account linked!</b>\n\n` +
        `You'll now get order updates, delivery alerts and promotions right here.\n\n` +
        `Use /profile to view your account or /orders to track a purchase.`,
      parse_mode: "HTML",
      reply_markup: createMainMenuKeyboard(),
    });

    console.log(
      `✅ Linked chat ${ctx.chatId} to customer ${claim.customerId} via web deep link`,
    );
  } catch (error) {
    console.error("Web link completion error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: "⚠️ <b>Link failed</b>\n\nSomething went wrong. Please try again.",
      parse_mode: "HTML",
    });
  }
}

/**
 * Handle /help command
 */
async function handleHelpCommand(ctx: BotContext): Promise<void> {
  await sendMessage({
    chat_id: ctx.chatId,
    text: formatHelpMessage(),
    reply_markup: createBackButton(),
  });
}

/**
 * Categories for the browse keyboard, read fresh from the POS on every use.
 *
 * Deliberately uncached: the owner's category list is the source of truth and a
 * chat has no UI to push updates into, so reading it at the moment the customer
 * taps is what "live" means here.
 */
async function loadCategories(): Promise<string[]> {
  const { getStoreCategories } = await import("../categories");
  return getStoreCategories();
}

/**
 * Point the price formatter at the owner's configured THB -> MMK rate.
 *
 * Called before building any message that quotes a price. `formatPrice` is
 * synchronous by design (it runs deep inside message builders), so the rate is
 * pushed to it rather than fetched by it. `getMmkRate` caches, so the extra
 * Firestore read is amortised across a minute of traffic.
 */
async function primeCurrency(): Promise<void> {
  try {
    const { getMmkRate } = await import("../storeSettings");
    setMmkRate(await getMmkRate());
  } catch (error) {
    // Falls back to NEXT_PUBLIC_MMK_RATE, which is the same chain the website
    // uses, so a failure here shows a slightly stale rate rather than nothing.
    console.error("Could not prime currency rate:", error);
  }
}

/** A resolved product listing: what to show, what to call it, where it lives. */
interface Listing {
  products: SearchProduct[];
  heading: string;
  websitePath: string;
}

/**
 * Resolve a browse selector into a product list.
 *
 * `all` | `new` | `best` | a numeric category index. Names are not used as
 * selectors because callback_data is capped at 64 bytes and category names are
 * owner-entered; see `createCategoriesKeyboard`.
 *
 * Returns null when a numeric index no longer matches the category list, which
 * happens when the owner edits categories while a keyboard is still open.
 */
async function resolveListing(selector: string): Promise<Listing | null> {
  if (selector === "all") {
    return {
      products: await searchProducts({}),
      heading: "All Products",
      websitePath: "/view-all",
    };
  }

  if (selector === "new") {
    return {
      products: await searchProducts({ isNew: true }),
      heading: "New Arrivals",
      websitePath: "/new-arrivals",
    };
  }

  if (selector === "best") {
    const { getBestSellerProductIds } = await import("../bestSellers");
    const [ranking, catalogue] = await Promise.all([
      getBestSellerProductIds(),
      searchProducts({}),
    ]);

    // Order the catalogue by the ranking, dropping products that never sold.
    // Ranked ids can also point at deleted products, which the lookup skips.
    const byId = new Map(catalogue.map((product) => [product.id, product]));
    const products = ranking
      .map((id) => byId.get(id))
      .filter((product): product is SearchProduct => !!product);

    return { products, heading: "Best Sellers", websitePath: "/best-sellers" };
  }

  const categories = await loadCategories();
  const index = Number(selector);

  if (!Number.isInteger(index) || index < 0 || index >= categories.length) {
    return null;
  }

  const category = categories[index];
  return {
    products: await searchProducts({ category }),
    heading: category,
    websitePath: `/view-all?category=${encodeURIComponent(category)}`,
  };
}

/**
 * Handle /products command
 */
async function handleProductsCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  const categories = await loadCategories();

  if (categories.length === 0) {
    // No categories configured in the POS yet — still let them browse.
    await sendMessage({
      chat_id: ctx.chatId,
      text: "🛍️ *Browse Products*\n\nNo categories are set up yet\\.",
      reply_markup: createCategoriesKeyboard([]),
    });
    return;
  }

  await sendMessage({
    chat_id: ctx.chatId,
    text: "🛍️ *Browse Products*\n\nSelect a category to view products:",
    reply_markup: createCategoriesKeyboard(categories),
  });
}

/**
 * Handle /search command
 */
async function handleSearchCommand(ctx: BotContext, query: string): Promise<void> {
  if (!query || query.trim() === "") {
    await sendMessage({
      chat_id: ctx.chatId,
      text: "🔍 *Search Products*\n\nUsage: /search \\<query\\>\n\nExample:\n• /search black jeans\n• /search t\\-shirt\n• /search shoes under 50000",
      reply_markup: createBackButton(),
    });
    return;
  }

  await sendChatAction(ctx.chatId, "typing");

  try {
    const products = await searchProducts({ keyword: query });

    if (products.length === 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: `🔍 No products found for "${escapeMarkdown(query)}"\n\nTry different keywords or browse by category\\.`,
        reply_markup: createCategoriesKeyboard(await loadCategories()),
      });
      return;
    }

    // Show first product with photo
    const firstProduct = products[0];
    const productText = formatProduct(firstProduct);

    if (firstProduct.image) {
      await sendPhoto({
        chat_id: ctx.chatId,
        photo: firstProduct.image,
        caption: productText,
        reply_markup: createProductKeyboard(firstProduct.id, firstProduct.stock > 0),
      });
    } else {
      await sendMessage({
        chat_id: ctx.chatId,
        text: productText,
        reply_markup: createProductKeyboard(firstProduct.id, firstProduct.stock > 0),
      });
    }

    // Show summary of results
    if (products.length > 1) {
      const summary = formatProductList(products);
      await sendMessage({
        chat_id: ctx.chatId,
        text: summary,
      });
    }
  } catch (error) {
    console.error("Search error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to search products. Please try again."),
    });
  }
}

/**
 * Handle /cart command
 */
async function handleCartCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    const cart = await getTelegramCart(ctx.chatId);

    if (!cart || cart.items.length === 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: "🛒 Your cart is empty\\.\n\nStart shopping with /products or /search",
        reply_markup: createMainMenuKeyboard(),
      });
      return;
    }

    const { formatCart } = await import("./formatters");
    const { createCartKeyboard } = await import("./keyboards");

    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const cartText = formatCart(cart.items, subtotal);

    await sendMessage({
      chat_id: ctx.chatId,
      text: cartText,
      reply_markup: createCartKeyboard(true),
    });
  } catch (error) {
    console.error("Cart error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load cart. Please try again."),
    });
  }
}

/**
 * Handle /orders command
 */
async function handleOrdersCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    const customer = await getCustomerByTelegramId(ctx.chatId);

    if (!customer) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: "👤 Please link your account first to view orders\\.\n\nUse /link to link your account\\.",
        reply_markup: createBackButton(),
      });
      return;
    }

    // Import order functions
    const { findCustomerOrders } = await import("../orderSupport");
    const orders = await findCustomerOrders(customer.email);

    const ordersText = formatOrderList(orders);

    await sendMessage({
      chat_id: ctx.chatId,
      text: ordersText,
      reply_markup: createBackButton(),
    });
  } catch (error) {
    console.error("Orders error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load orders. Please try again."),
    });
  }
}

/**
 * Handle /track command
 */
async function handleTrackCommand(ctx: BotContext, orderRef: string): Promise<void> {
  if (!orderRef || orderRef.trim() === "") {
    await sendMessage({
      chat_id: ctx.chatId,
      text: "📦 *Track Order*\n\nUsage: /track \\<orderRef\\>\n\nExample: /track OR12345678",
      reply_markup: createBackButton(),
    });
    return;
  }

  await sendChatAction(ctx.chatId, "typing");

  try {
    const order = await findOrderByRef(orderRef.trim());

    if (!order) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError(`Order ${escapeMarkdown(orderRef)} not found\\.\n\nPlease check the order reference and try again\\.`),
      });
      return;
    }

    const orderText = formatOrder(order);

    await sendMessage({
      chat_id: ctx.chatId,
      text: orderText,
      reply_markup: createBackButton(),
    });
  } catch (error) {
    console.error("Track error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to track order. Please try again."),
    });
  }
}

/**
 * Handle /profile command
 */
async function handleProfileCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    const customer = await getCustomerByTelegramId(ctx.chatId);

    if (!customer) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: "👤 *Your Profile*\n\nYou haven't linked your account yet\\.\n\nUse /link to connect your Telegram with your web account\\.",
        reply_markup: createBackButton(),
      });
      return;
    }

    const profileText = `👤 *Your Profile*\n\n` +
      `📧 Email: ${escapeMarkdown(customer.email)}\n` +
      `👤 Name: ${escapeMarkdown(customer.displayName || "Not set")}\n` +
      `📱 Phone: ${escapeMarkdown(customer.phone || "Not set")}\n` +
      `🆔 Telegram: @${escapeMarkdown(ctx.username || "unknown")}\n\n` +
      `✅ Account linked successfully`;

    await sendMessage({
      chat_id: ctx.chatId,
      text: profileText,
      reply_markup: createBackButton(),
    });
  } catch (error) {
    console.error("Profile error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load profile. Please try again."),
    });
  }
}

/**
 * Handle /link command
 */
async function handleLinkCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    // Check if already linked
    const customer = await getCustomerByTelegramId(ctx.chatId);

    if (customer) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: `✅ Your account is already linked\\!\n\nEmail: ${escapeMarkdown(customer.email)}\n\nUse /profile to view your profile\\.`,
        reply_markup: createBackButton(),
      });
      return;
    }

    // Generate link token
    const { generateLinkToken } = await import("./auth-service");
    const token = await generateLinkToken(ctx.chatId);

    const { createAccountLinkKeyboard, accountLinkUrl } = await import(
      "./keyboards"
    );

    const keyboard = createAccountLinkKeyboard(token);
    const linkUrl = accountLinkUrl(token);

    // HTML rather than MarkdownV2: the URL is full of characters MarkdownV2
    // treats as syntax (`.`, `-`, `_`, `=`), and one missed escape makes
    // Telegram reject the message outright.
    const steps = keyboard
      ? `1. Tap the button below\n` +
        `2. Log in to your account\n` +
        `3. Confirm the linking`
      : `1. Open this link in your browser:\n` +
        `<code>${linkUrl}</code>\n` +
        `2. Log in to your account\n` +
        `3. Confirm the linking`;

    const linkText =
      `🔗 <b>Link Your Account</b>\n\n` +
      `To link your Telegram with your web account:\n\n` +
      `${steps}\n\n` +
      `⏰ Link expires in 15 minutes.`;

    await sendMessage({
      chat_id: ctx.chatId,
      text: linkText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      // Omitted entirely when the storefront URL is not public — Telegram
      // rejects the whole message for an unreachable button URL.
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
  } catch (error) {
    console.error("Link error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to generate link. Please try again."),
    });
  }
}

/**
 * Handle /promotions command
 */
async function handlePromotionsCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    const { getActivePromotions, formatPromotions } = await import("../promotions");
    const promotions = getActivePromotions();
    const promotionsText = `🎁 *Current Promotions*\n\n` + formatPromotions(promotions);

    await sendMessage({
      chat_id: ctx.chatId,
      text: promotionsText,
      reply_markup: createBackButton(),
    });
  } catch (error) {
    console.error("Promotions error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load promotions. Please try again."),
    });
  }
}

/**
 * Handle /cancel command
 */
async function handleCancelOrderCommand(ctx: BotContext, orderRef: string): Promise<void> {
  if (!orderRef || orderRef.trim() === "") {
    await sendMessage({
      chat_id: ctx.chatId,
      text: "❌ *Cancel Order*\n\nUsage: /cancel \\<orderRef\\>\n\nExample: /cancel OR12345678",
      reply_markup: createBackButton(),
    });
    return;
  }

  await sendChatAction(ctx.chatId, "typing");

  try {
    const order = await findOrderByRef(orderRef.trim());

    if (!order) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError(`Order ${escapeMarkdown(orderRef)} not found\\.`),
      });
      return;
    }

    const { canCancelOrder } = await import("../orderSupport");
    const cancelInfo = canCancelOrder(order);

    if (!cancelInfo.canCancel) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError(cancelInfo.reason || "This order cannot be cancelled\\."),
      });
      return;
    }

    const confirmText = `❌ *Cancel Order*\n\n` +
      `Order: ${escapeMarkdown(order.orderRef)}\n` +
      `Total: ${escapeMarkdown(formatPrice(order.totalAmount))}\n\n` +
      `Are you sure you want to cancel this order?`;

    const { createConfirmationKeyboard } = await import("./keyboards");

    await sendMessage({
      chat_id: ctx.chatId,
      text: confirmText,
      reply_markup: createConfirmationKeyboard(`confirm_cancel_${order.orderRef}`),
    });
  } catch (error) {
    console.error("Cancel error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to process cancellation. Please try again."),
    });
  }
}

/**
 * Handle callback queries (button presses)
 */
async function handleCallbackQuery(query: any): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const callbackData = query.data;
  const userId = query.from.id;

  console.log(`🔘 Callback from ${userId}: ${callbackData}`);

  // Acknowledge the callback
  await answerCallbackQuery({
    callback_query_id: query.id,
  });

  if (!chatId) return;

  const ctx: BotContext = {
    chatId: chatId.toString(),
    userId,
    username: query.from.username,
    firstName: query.from.first_name,
    messageId,
    callbackData,
  };

  try {
    // Route callback to appropriate handler
    if (callbackData.startsWith("menu_")) {
      await handleMenuCallback(ctx, callbackData);
    } else if (callbackData.startsWith("category_")) {
      await handleCategoryCallback(ctx, callbackData);
    } else if (callbackData.startsWith("browse_")) {
      await handleBrowseCallback(ctx, callbackData);
    } else if (callbackData.startsWith("product_")) {
      await handleProductCallback(ctx, callbackData);
    } else if (callbackData.startsWith("padd_")) {
      // Checked before "pick_" would matter; both are add-to-cart steps.
      await handleAddToCartCallback(ctx, callbackData);
    } else if (callbackData.startsWith("pick_")) {
      await handleColourPickCallback(ctx, callbackData);
    } else if (callbackData.startsWith("cart_")) {
      await handleCartCallback(ctx, callbackData);
    } else if (callbackData.startsWith("order_")) {
      await handleOrderCallback(ctx, callbackData);
    }
  } catch (error) {
    console.error("Error handling callback:", error);
  }
}

/**
 * Handle menu callbacks
 */
async function handleMenuCallback(ctx: BotContext, data: string): Promise<void> {
  const action = data.replace("menu_", "");

  const menuHandlers: Record<string, () => Promise<void>> = {
    main: () => handleStartCommand(ctx),
    products: () => handleProductsCommand(ctx),
    search: async () => {
      await sendMessage({
        chat_id: ctx.chatId,
        text: "🔍 *Search Products*\n\nSend me what you're looking for\\!\n\nExamples:\n• black jeans\n• t\\-shirt under 30000\n• red dress",
      });
    },
    cart: () => handleCartCommand(ctx),
    orders: () => handleOrdersCommand(ctx),
    promotions: () => handlePromotionsCommand(ctx),
    profile: () => handleProfileCommand(ctx),
    help: () => handleHelpCommand(ctx),
  };

  const handler = menuHandlers[action];
  if (handler) {
    await handler();
  }
}

/**
 * Handle category callbacks
 */
async function handleCategoryCallback(ctx: BotContext, data: string): Promise<void> {
  // Entry point from the categories keyboard: always page 1.
  await renderBrowsePage(ctx, data.replace("category_", ""), 1);
}

/**
 * Handle browse pagination callbacks: `browse_<selector>_<page>`.
 */
async function handleBrowseCallback(ctx: BotContext, data: string): Promise<void> {
  const rest = data.replace("browse_", "");
  const separator = rest.lastIndexOf("_");

  if (separator === -1) {
    await renderBrowsePage(ctx, rest, 1);
    return;
  }

  const selector = rest.slice(0, separator);
  const page = Number(rest.slice(separator + 1));
  await renderBrowsePage(ctx, selector, Number.isFinite(page) ? page : 1);
}

/**
 * Render one page of a category listing.
 *
 * `selector` is a category index, or "all". Held as an index rather than a name
 * because callback_data is capped at 64 bytes and category names are
 * owner-entered; see `createCategoriesKeyboard`.
 *
 * Paging edits the existing message rather than sending a new one, so browsing
 * does not bury the chat in near-identical lists.
 */
async function renderBrowsePage(
  ctx: BotContext,
  selector: string,
  page: number,
): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    await primeCurrency();

    const listing = await resolveListing(selector);

    if (!listing) {
      // The owner changed the category list after this keyboard was sent.
      await sendMessage({
        chat_id: ctx.chatId,
        text: "🛍️ *Browse Products*\n\nOur categories have changed\\. Please pick again:",
        reply_markup: createCategoriesKeyboard(await loadCategories()),
      });
      return;
    }

    if (listing.products.length === 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: `No products in ${escapeMarkdown(listing.heading)} right now\\.`,
        reply_markup: createCategoriesKeyboard(await loadCategories()),
      });
      return;
    }

    const pageData = paginateProducts(listing.products, page);

    // Each product goes out as its own photo card. A single text list cannot
    // carry images, and images are what make this usable as a catalogue — but it
    // does mean one message per product, so the page size stays small.
    await sendChatAction(ctx.chatId, "upload_photo");

    for (let i = 0; i < pageData.items.length; i++) {
      const product = pageData.items[i];
      const caption = formatProductCard(product, {
        index: pageData.firstIndex + i,
        total: pageData.total,
      });
      const keyboard = createProductCardKeyboard(product.id, product.stock > 0);

      // Fall back to a text card when a product has no artwork, rather than
      // skipping it — sendPhoto with an empty URL fails the whole message.
      if (product.image) {
        const sent = await sendPhotoSafe(
          ctx.chatId,
          product.image,
          caption,
          { reply_markup: keyboard },
        );
        if (sent) continue;
        console.error(`Photo failed for product ${product.id}, sending text`);
      }

      await sendMessage({
        chat_id: ctx.chatId,
        text: caption,
        reply_markup: keyboard,
      });
    }

    // Footer carries the page position and navigation. Sent after the cards so
    // the controls sit at the bottom of the chat, where the customer is looking.
    const websiteUrl = `${storefrontBaseUrl()}${listing.websitePath}`;
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatProductPage(
        pageData,
        listing.heading,
        pageData.totalPages > 1
          ? "Use Prev/Next to see more."
          : "Use the buttons on each item to add it to your cart.",
      ),
      reply_markup: createBrowseKeyboard({
        selector,
        page: pageData.page,
        totalPages: pageData.totalPages,
        productIds: pageData.items.map((p) => p.id),
        firstIndex: pageData.firstIndex,
        websiteUrl,
        // The cards above already carry per-product buttons.
        navigationOnly: true,
      }),
    });
  } catch (error) {
    console.error("Browse error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load products. Please try again."),
    });
  }
}

/**
 * Handle product callbacks
 */
async function handleProductCallback(ctx: BotContext, data: string): Promise<void> {
  const [action, productId] = data.replace("product_", "").split("_");

  if (action === "add") {
    await startAddToCart(ctx, productId);
    return;
  }

  if (action === "view") {
    await showProductDetail(ctx, productId);
    return;
  }

  if (action === "notify") {
    await sendMessage({
      chat_id: ctx.chatId,
      text: "🔔 We'll let you know when this is back in stock\\.",
      reply_markup: createBackButton(),
    });
  }
}

/**
 * Show one product's full detail as a photo card.
 *
 * Previously this sent a text-only message built by `formatProduct(product as
 * any)` — but the lookup returns a `ProductInfo`, whose stock and colour fields
 * are named differently, so the cast silently produced "Out of stock" with no
 * colours for every product. `formatProductDetail` reads the right fields.
 */
async function showProductDetail(ctx: BotContext, productId: string): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    await primeCurrency();

    const product = await getProductById(productId);

    if (!product) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError("Sorry, that product is no longer available."),
        reply_markup: createBackButton(),
      });
      return;
    }

    const caption = formatProductDetail(product);
    const keyboard = createProductKeyboard(productId, product.totalStock > 0);

    if (product.image) {
      const sent = await sendPhotoSafe(ctx.chatId, product.image, caption, {
        reply_markup: keyboard,
      });
      if (sent) return;
      console.error(`Detail photo failed for ${productId}, sending text`);
    }

    await sendMessage({
      chat_id: ctx.chatId,
      text: caption,
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error("View product error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load that product. Please try again."),
    });
  }
}

/**
 * Step 1 of adding to cart: pick a colour.
 *
 * Clothing cannot be added without a size, and sizes are stocked per colour, so
 * the flow is colour -> size -> add. A single-colour product skips straight to
 * sizes so the common case stays one tap.
 */
async function startAddToCart(ctx: BotContext, productId: string): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  try {
    const product = await getProductById(productId);

    if (!product || product.totalStock <= 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError("Sorry, that product is out of stock."),
        reply_markup: createBackButton(),
      });
      return;
    }

    const stocked = product.colorVariants
      .map((variant, index) => ({
        index,
        color: variant.color,
        stock: variant.sizeQuantities.reduce(
          (sum, sq) => sum + (Number(sq.quantity) || 0),
          0,
        ),
      }))
      .filter((variant) => variant.stock > 0);

    if (stocked.length === 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError("Sorry, that product is out of stock."),
        reply_markup: createBackButton(),
      });
      return;
    }

    if (stocked.length === 1) {
      await promptForSize(ctx, productId, stocked[0].index);
      return;
    }

    await sendMessage({
      chat_id: ctx.chatId,
      text:
        `🎨 *${escapeMarkdown(product.name)}*\n\n` +
        `Which colour would you like?`,
      reply_markup: createColourPickKeyboard(
        productId,
        product.colorVariants.map((variant) => ({
          color: variant.color,
          stock: variant.sizeQuantities.reduce(
            (sum, sq) => sum + (Number(sq.quantity) || 0),
            0,
          ),
        })),
      ),
    });
  } catch (error) {
    console.error("Add to cart (colour step) error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Could not start adding to cart. Please try again."),
    });
  }
}

/** Step 2: pick a size within the chosen colour. */
async function promptForSize(
  ctx: BotContext,
  productId: string,
  variantIndex: number,
): Promise<void> {
  const product = await getProductById(productId);
  const variant = product?.colorVariants[variantIndex];

  if (!product || !variant) {
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("That option is no longer available."),
      reply_markup: createBackButton(),
    });
    return;
  }

  const available = variant.sizeQuantities.filter((sq) => sq.quantity > 0);

  if (available.length === 0) {
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("That colour just sold out. Please pick another."),
      reply_markup: createProductKeyboard(productId, product.totalStock > 0),
    });
    return;
  }

  const colourLabel = variant.color ? ` \\- ${escapeMarkdown(variant.color)}` : "";

  await sendMessage({
    chat_id: ctx.chatId,
    text:
      `📐 *${escapeMarkdown(product.name)}*${colourLabel}\n\n` +
      `Which size? The number in brackets is how many are left\\.`,
    reply_markup: createSizePickKeyboard(
      productId,
      variantIndex,
      variant.sizeQuantities,
    ),
  });
}

/** Handle the colour choice: `pick_<productId>_<variantIndex>`. */
async function handleColourPickCallback(
  ctx: BotContext,
  data: string,
): Promise<void> {
  const rest = data.replace("pick_", "");
  const separator = rest.lastIndexOf("_");

  if (separator === -1) return;

  const productId = rest.slice(0, separator);
  const variantIndex = Number(rest.slice(separator + 1));

  if (!Number.isInteger(variantIndex)) return;

  await promptForSize(ctx, productId, variantIndex);
}

/**
 * Step 3: commit to the cart. `padd_<productId>_<variantIndex>_<sizeIndex>`.
 *
 * Indices are re-resolved against a fresh product read, so a size that sold out
 * while the keyboard was open is rejected rather than oversold.
 */
async function handleAddToCartCallback(
  ctx: BotContext,
  data: string,
): Promise<void> {
  const parts = data.replace("padd_", "").split("_");
  const sizeIndex = Number(parts.pop());
  const variantIndex = Number(parts.pop());
  const productId = parts.join("_");

  if (!productId || !Number.isInteger(variantIndex) || !Number.isInteger(sizeIndex)) {
    return;
  }

  await sendChatAction(ctx.chatId, "typing");

  try {
    await primeCurrency();

    const product = await getProductById(productId);
    const variant = product?.colorVariants[variantIndex];
    const sizeEntry = variant?.sizeQuantities[sizeIndex];

    if (!product || !variant || !sizeEntry || sizeEntry.quantity <= 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError("That size just sold out. Please pick another."),
        reply_markup: createProductKeyboard(productId, (product?.totalStock ?? 0) > 0),
      });
      return;
    }

    const added = await addToTelegramCart(ctx.chatId, {
      productId,
      name: product.name,
      image: variant.image || product.image,
      variantId: variant.id || undefined,
      color: variant.color || undefined,
      size: sizeEntry.size,
      price: product.price,
      quantity: 1,
      maxQuantity: sizeEntry.quantity,
    });

    if (!added) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: formatError("Could not add that to your cart. Please try again."),
      });
      return;
    }

    const cart = await getTelegramCart(ctx.chatId);
    const units = (cart?.items || []).reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = (cart?.items || []).reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const detail = [variant.color, sizeEntry.size].filter(Boolean).join(" / ");

    await sendMessage({
      chat_id: ctx.chatId,
      text:
        `✅ *Added to cart*\n\n` +
        `${escapeMarkdown(product.name)}${detail ? ` \\(${escapeMarkdown(detail)}\\)` : ""}\n` +
        `💰 ${escapeMarkdown(formatPrice(product.price))}\n\n` +
        `🛒 Cart: ${units} item${units === 1 ? "" : "s"} \\- ${escapeMarkdown(formatPrice(subtotal))}`,
      reply_markup: createCartKeyboard(true),
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Could not add that to your cart. Please try again."),
    });
  }
}

/**
 * Handle cart callbacks
 */
async function handleCartCallback(ctx: BotContext, data: string): Promise<void> {
  const action = data.replace("cart_", "");

  if (action === "clear") {
    const { clearTelegramCart } = await import("./cart-service");
    const cleared = await clearTelegramCart(ctx.chatId);

    await sendMessage({
      chat_id: ctx.chatId,
      text: cleared
        ? "🗑️ Your cart is now empty\\."
        : formatError("Could not clear your cart. Please try again."),
      reply_markup: createMainMenuKeyboard(),
    });
    return;
  }

  if (action === "checkout") {
    await sendCheckoutInstructions(ctx);
    return;
  }

  // Item-level editing (increase/decrease/remove) is not wired up yet; the cart
  // is carried to the website for checkout, where those controls already exist.
  await handleCartCommand(ctx);
}

/**
 * Hand the customer over to the website to pay.
 *
 * Checkout needs an address, a payment method and a verified account, so it is
 * not something to rebuild in chat. A linked account gets its Telegram cart
 * merged into the web cart on link, so the items travel with them.
 */
async function sendCheckoutInstructions(ctx: BotContext): Promise<void> {
  const customer = await getCustomerByTelegramId(ctx.chatId);
  const cartUrl = `${storefrontBaseUrl()}/cart`;
  const { isTelegramLinkableUrl } = await import("./keyboards");

  const lines = [
    `🛍️ <b>Checkout</b>`,
    ``,
    customer
      ? `Your account is linked, so your cart is waiting for you on the website.`
      : `Link your account first with /link so this cart follows you to the website.`,
    ``,
    `Open the cart to choose delivery and payment:`,
  ];

  if (!isTelegramLinkableUrl(cartUrl)) {
    // Telegram rejects the whole message for a non-public button URL, so on a
    // local build the link goes in the body as copyable text instead.
    lines.push(`<code>${cartUrl}</code>`);
  }

  await sendMessage({
    chat_id: ctx.chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(isTelegramLinkableUrl(cartUrl)
      ? {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🛒 Open my cart", url: cartUrl }],
              [{ text: "🏠 Main Menu", callback_data: "menu_main" }],
            ],
          },
        }
      : {}),
  });
}

/**
 * Handle order callbacks
 */
async function handleOrderCallback(ctx: BotContext, data: string): Promise<void> {
  await sendMessage({
    chat_id: ctx.chatId,
    text: "📦 Order management is coming soon\\!",
  });
}

/**
 * Handle natural language messages
 */
async function handleNaturalLanguage(ctx: BotContext): Promise<void> {
  const text = (ctx.text || "").toLowerCase();

  // Check for greetings
  if (/(hi|hello|hey|good morning|good afternoon)/i.test(text)) {
    await handleStartCommand(ctx);
    return;
  }

  // Check for help requests
  if (/(help|what can you do|commands)/i.test(text)) {
    await handleHelpCommand(ctx);
    return;
  }

  // Default: treat as search
  await handleSearchCommand(ctx, ctx.text || "");
}
