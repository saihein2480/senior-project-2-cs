/**
 * Telegram Bot Service Layer
 * Main bot logic, command handlers, and message processors
 */

import {
  sendMessage,
  sendPhoto,
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
} from "./formatters";
import {
  createMainMenuKeyboard,
  createCategoriesKeyboard,
  createProductKeyboard,
  createBackButton,
} from "./keyboards";
import { searchProducts } from "../productSearch";
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
 * Handle /products command
 */
async function handleProductsCommand(ctx: BotContext): Promise<void> {
  await sendChatAction(ctx.chatId, "typing");

  await sendMessage({
    chat_id: ctx.chatId,
    text: "🛍️ *Browse Products*\n\nSelect a category to view products:",
    reply_markup: createCategoriesKeyboard(),
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
        reply_markup: createCategoriesKeyboard(),
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
    } else if (callbackData.startsWith("product_")) {
      await handleProductCallback(ctx, callbackData);
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
  const category = data.replace("category_", "");

  await sendChatAction(ctx.chatId, "typing");

  try {
    const products = await searchProducts({ category });

    if (products.length === 0) {
      await sendMessage({
        chat_id: ctx.chatId,
        text: `No products found in ${escapeMarkdown(category)} category\\.`,
        reply_markup: createCategoriesKeyboard(),
      });
      return;
    }

    const listText = formatProductList(products);
    await sendMessage({
      chat_id: ctx.chatId,
      text: listText,
    });

    // Show first product with image
    const firstProduct = products[0];
    if (firstProduct.image) {
      await sendPhoto({
        chat_id: ctx.chatId,
        photo: firstProduct.image,
        caption: formatProduct(firstProduct),
        reply_markup: createProductKeyboard(firstProduct.id, firstProduct.stock > 0),
      });
    }
  } catch (error) {
    console.error("Category error:", error);
    await sendMessage({
      chat_id: ctx.chatId,
      text: formatError("Failed to load category. Please try again."),
    });
  }
}

/**
 * Handle product callbacks
 */
async function handleProductCallback(ctx: BotContext, data: string): Promise<void> {
  const [action, productId] = data.replace("product_", "").split("_");

  if (action === "add") {
    await sendMessage({
      chat_id: ctx.chatId,
      text: "🛒 *Add to Cart*\n\nThis feature is coming soon\\!\n\nFor now, please use our website to complete your purchase\\.",
    });
  } else if (action === "view") {
    try {
      const product = await getProductById(productId);
      if (product) {
        await sendMessage({
          chat_id: ctx.chatId,
          text: formatProduct(product as any),
          reply_markup: createProductKeyboard(productId, product.totalStock > 0),
        });
      }
    } catch (error) {
      console.error("View product error:", error);
    }
  }
}

/**
 * Handle cart callbacks
 */
async function handleCartCallback(ctx: BotContext, data: string): Promise<void> {
  await sendMessage({
    chat_id: ctx.chatId,
    text: "🛒 Cart management is coming soon\\!\n\nPlease use our website for checkout\\.",
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
