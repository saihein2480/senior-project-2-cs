/**
 * Telegram Integration Types
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_markup?: any;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
  chat_instance: string;
}

export interface CustomerTelegramData {
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

export interface TelegramCart {
  items: TelegramCartItem[];
  chatId: string;
  updatedAt: Date;
}

export interface TelegramCartItem {
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

export interface AccountLinkToken {
  token: string;
  customerId: string;
  telegramChatId: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
  /**
   * Which side started the link, and therefore which half of the pair is
   * already known and trusted:
   *  - "telegram": the bot issued it into a chat via /link, so `telegramChatId`
   *    is trusted and `customerId` is filled in once the customer authenticates
   *    on the storefront.
   *  - "web": the storefront issued it to a signed-in customer, so `customerId`
   *    is trusted and `telegramChatId` is filled in when the bot receives the
   *    deep-link /start.
   *
   * The two are not interchangeable: consuming a "web" token through the
   * storefront route would link an empty chat id, and consuming a "telegram"
   * token through the bot would link an empty customer id. Absent means
   * "telegram" for tokens created before this field existed.
   */
  direction?: "telegram" | "web";
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOptions {
  chat_id: number | string;
  text: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: InlineKeyboard;
  disable_web_page_preview?: boolean;
}

export interface SendPhotoOptions {
  chat_id: number | string;
  photo: string;
  caption?: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: InlineKeyboard;
}

export interface EditMessageOptions {
  chat_id?: number | string;
  message_id?: number;
  inline_message_id?: string;
  text?: string;
  caption?: string;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: InlineKeyboard;
}

export interface AnswerCallbackQueryOptions {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
  url?: string;
  cache_time?: number;
}

export type BotContext = {
  chatId: string;
  userId: number;
  username?: string;
  firstName?: string;
  /** Telegram surname, when the account has one. Optional on Telegram's side. */
  lastName?: string;
  messageId?: number;
  text?: string;
  callbackData?: string;
};

export type CommandHandler = (ctx: BotContext) => Promise<void>;
