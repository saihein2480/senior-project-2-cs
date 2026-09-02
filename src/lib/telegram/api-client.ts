/**
 * Telegram Bot API Client
 * Low-level wrapper for Telegram Bot API calls
 */

import type {
  SendMessageOptions,
  SendPhotoOptions,
  EditMessageOptions,
  AnswerCallbackQueryOptions,
} from "./types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Make API request to Telegram
 */
async function telegramRequest(method: string, body: any = {}): Promise<any> {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  try {
    const response = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error(`Telegram API error on ${method}:`, data);
      throw new Error(data.description || "Telegram API request failed");
    }

    return data.result;
  } catch (error) {
    console.error(`Telegram API request failed (${method}):`, error);
    throw error;
  }
}

/**
 * Send text message
 */
export async function sendMessage(options: SendMessageOptions): Promise<any> {
  return telegramRequest("sendMessage", {
    ...options,
    parse_mode: options.parse_mode || "MarkdownV2",
  });
}

/**
 * Send photo with caption
 */
export async function sendPhoto(options: SendPhotoOptions): Promise<any> {
  return telegramRequest("sendPhoto", {
    ...options,
    parse_mode: options.parse_mode || "MarkdownV2",
  });
}

/**
 * Edit message text
 */
export async function editMessageText(options: EditMessageOptions): Promise<any> {
  return telegramRequest("editMessageText", {
    ...options,
    parse_mode: options.parse_mode || "MarkdownV2",
  });
}

/**
 * Edit message caption
 */
export async function editMessageCaption(options: EditMessageOptions): Promise<any> {
  return telegramRequest("editMessageCaption", {
    ...options,
    parse_mode: options.parse_mode || "MarkdownV2",
  });
}

/**
 * Edit message reply markup (keyboard)
 */
export async function editMessageReplyMarkup(options: EditMessageOptions): Promise<any> {
  return telegramRequest("editMessageReplyMarkup", options);
}

/**
 * Answer callback query (acknowledge button press)
 */
export async function answerCallbackQuery(
  options: AnswerCallbackQueryOptions
): Promise<any> {
  return telegramRequest("answerCallbackQuery", options);
}

/**
 * Delete message
 */
export async function deleteMessage(
  chatId: number | string,
  messageId: number
): Promise<any> {
  return telegramRequest("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

/**
 * Send chat action (typing, upload_photo, etc.)
 */
export async function sendChatAction(
  chatId: number | string,
  action: "typing" | "upload_photo" | "upload_document"
): Promise<any> {
  return telegramRequest("sendChatAction", {
    chat_id: chatId,
    action,
  });
}

/**
 * Get webhook info
 */
export async function getWebhookInfo(): Promise<any> {
  return telegramRequest("getWebhookInfo");
}

/**
 * Set webhook
 */
export async function setWebhook(
  url: string,
  secretToken?: string
): Promise<any> {
  return telegramRequest("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

/**
 * Delete webhook
 */
export async function deleteWebhook(): Promise<any> {
  return telegramRequest("deleteWebhook", {
    drop_pending_updates: true,
  });
}

/**
 * Get bot info
 */
export async function getMe(): Promise<any> {
  return telegramRequest("getMe");
}

/**
 * Set bot commands
 */
export async function setMyCommands(
  commands: { command: string; description: string }[]
): Promise<any> {
  return telegramRequest("setMyCommands", { commands });
}

/**
 * Send message safely (catches errors and logs)
 */
export async function sendMessageSafe(
  chatId: number | string,
  text: string,
  options: Partial<SendMessageOptions> = {}
): Promise<boolean> {
  try {
    await sendMessage({
      chat_id: chatId,
      text,
      ...options,
    });
    return true;
  } catch (error) {
    console.error(`Failed to send message to ${chatId}:`, error);
    return false;
  }
}

/**
 * Send photo safely (catches errors and logs)
 */
export async function sendPhotoSafe(
  chatId: number | string,
  photo: string,
  caption?: string,
  options: Partial<SendPhotoOptions> = {}
): Promise<boolean> {
  try {
    await sendPhoto({
      chat_id: chatId,
      photo,
      caption,
      ...options,
    });
    return true;
  } catch (error) {
    console.error(`Failed to send photo to ${chatId}:`, error);
    return false;
  }
}
