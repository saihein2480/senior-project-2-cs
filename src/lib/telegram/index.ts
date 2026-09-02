/**
 * Telegram Integration - Main Export
 * Centralized exports for all Telegram functionality
 */

// Core bot service
export { handleTelegramUpdate } from "./bot-service";

// API client
export {
  sendMessage,
  sendPhoto,
  editMessageText,
  answerCallbackQuery,
  sendMessageSafe,
  sendPhotoSafe,
  getWebhookInfo,
  setWebhook,
  deleteWebhook,
} from "./api-client";

// Authentication
export {
  generateLinkToken,
  verifyLinkToken,
  linkTelegramToCustomer,
  unlinkTelegramFromCustomer,
} from "./auth-service";

// Customer service
export {
  getCustomerByTelegramId,
  getCustomerById,
  updateNotificationPreferences,
  isTelegramNotificationsEnabled,
  getAllTelegramCustomers,
} from "./customer-service";

// Cart management
export {
  getTelegramCart,
  addToTelegramCart,
  removeFromTelegramCart,
  updateTelegramCartQuantity,
  clearTelegramCart,
  mergeTelegramCartWithCustomer,
} from "./cart-service";

// Notifications
export {
  sendOrderConfirmationNotification,
  sendPaymentConfirmationNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  sendOrderCancelledNotification,
  sendRefundProcessedNotification,
  sendPromotionNotification,
  sendBulkNotification,
  sendLowStockAlertNotification,
  sendBackInStockNotification,
} from "./notifications";

// Admin helpers
export {
  notifyAdmin,
  notifyAdminNewOrder,
  notifyAdminLowStock,
  notifyAdminPaymentReceived,
  notifyAdminCancellationRequest,
  notifyAdminReturnRequest,
  notifyAdminError,
  sendAdminTestNotification,
} from "./admin-helpers";

// AI integration
export { processWithAI, getAIProductRecommendation } from "./ai-integration";

// Formatters
export {
  formatWelcomeMessage,
  formatHelpMessage,
  formatProduct,
  formatProductList,
  formatOrder,
  formatOrderList,
  formatCart,
  formatPrice,
  formatError,
  formatSuccess,
  escapeMarkdown,
} from "./formatters";

// Keyboards
export {
  createMainMenuKeyboard,
  createCategoriesKeyboard,
  createProductKeyboard,
  createPaginationKeyboard,
  createCartKeyboard,
  createOrderKeyboard,
  createConfirmationKeyboard,
  createAccountLinkKeyboard,
  createBackButton,
} from "./keyboards";

// Types
export type {
  TelegramUser,
  TelegramChat,
  TelegramMessage,
  TelegramCallbackQuery,
  CustomerTelegramData,
  TelegramCart,
  TelegramCartItem,
  AccountLinkToken,
  BotContext,
  InlineKeyboard,
  InlineKeyboardButton,
  SendMessageOptions,
  SendPhotoOptions,
} from "./types";
