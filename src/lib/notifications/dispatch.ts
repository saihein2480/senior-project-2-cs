/**
 * Cross-channel customer notification dispatcher.
 *
 * One call reaches a customer everywhere we can: their email inbox, their
 * Telegram chat (when linked), and the in-app bell on the storefront. Channels
 * are independent — a dead SMTP connection must not stop the Telegram message,
 * so every channel is attempted and reported on separately.
 *
 * Server-only: depends on `adminDb` and on nodemailer.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { isEmailConfigured, sendMail } from "../email/mailer";
import { sendMessageSafe, sendPhotoSafe } from "../telegram/api-client";
import { buildNotificationContent } from "./content";
import type {
  CustomerNotificationEvent,
  DispatchResult,
  NotificationPreferences,
  NotificationPreferenceKey,
} from "./types";

/** Shape we need off a `customers/{uid}` document to deliver anything. */
export interface NotificationTarget {
  customerId: string;
  email?: string;
  displayName?: string;
  telegramChatId?: string;
  notificationPreferences?: NotificationPreferences;
}

export interface NotifyCustomerInput {
  customerId: string;
  event: CustomerNotificationEvent;
  /** Used when the customer document has no email yet (e.g. guest checkout). */
  fallbackEmail?: string;
  fallbackDisplayName?: string;
  /** Skip the Firestore bell record. Broadcasts set this to avoid thousands of docs. */
  skipInApp?: boolean;
}

/**
 * Is a preference flag on?
 *
 * Absent means on. Customers who registered before a flag existed — and
 * everyone who never linked Telegram, who has no `notificationPreferences` map
 * at all — must still receive their order mail, so only an explicit `false`
 * counts as opting out.
 */
function isPreferenceEnabled(
  preferences: NotificationPreferences | undefined,
  key: NotificationPreferenceKey,
): boolean {
  return preferences?.[key] !== false;
}

/**
 * Decide which channels this event may use for this customer.
 *
 * The topic flag (`orderUpdates` / `deliveryAlerts` / `promotions`) gates both
 * channels, so muting promotions stops promotional email as well as promotional
 * Telegram messages. `email` and `telegram` are the per-channel master
 * switches on top of that.
 */
export function resolveChannels(
  target: NotificationTarget,
  preference: NotificationPreferenceKey,
): {
  email: { allowed: boolean; reason?: string };
  telegram: { allowed: boolean; reason?: string };
} {
  const preferences = target.notificationPreferences;

  // "telegram" as a topic means "the Telegram master switch"; there is no
  // matching email topic, so treat it as always-on for the mail channel.
  const topicAllowed =
    preference === "telegram" || preference === "email"
      ? true
      : isPreferenceEnabled(preferences, preference);

  const emailAddress = target.email?.trim();
  let email: { allowed: boolean; reason?: string };
  if (!emailAddress) {
    email = { allowed: false, reason: "customer has no email address" };
  } else if (!isEmailConfigured) {
    email = {
      allowed: false,
      reason: "email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD)",
    };
  } else if (!isPreferenceEnabled(preferences, "email")) {
    email = { allowed: false, reason: "customer disabled email notifications" };
  } else if (!topicAllowed) {
    email = { allowed: false, reason: `customer disabled ${preference}` };
  } else {
    email = { allowed: true };
  }

  let telegram: { allowed: boolean; reason?: string };
  if (!target.telegramChatId) {
    telegram = { allowed: false, reason: "Telegram account not linked" };
  } else if (!process.env.TELEGRAM_BOT_TOKEN) {
    telegram = { allowed: false, reason: "TELEGRAM_BOT_TOKEN is not configured" };
  } else if (!isPreferenceEnabled(preferences, "telegram")) {
    telegram = { allowed: false, reason: "customer disabled Telegram messages" };
  } else if (!topicAllowed) {
    telegram = { allowed: false, reason: `customer disabled ${preference}` };
  } else {
    telegram = { allowed: true };
  }

  return { email, telegram };
}

/**
 * Load the delivery details for one customer.
 *
 * Reads `customers/{uid}` directly rather than going through
 * `telegram/customer-service` so a single read serves both channels.
 */
export async function loadNotificationTarget(
  customerId: string,
): Promise<NotificationTarget | null> {
  if (!adminDb) {
    console.error("Cannot load notification target: Firebase Admin not configured");
    return null;
  }

  try {
    const snapshot = await adminDb.collection("customers").doc(customerId).get();
    if (!snapshot.exists) return null;

    const data = snapshot.data() || {};
    return {
      customerId,
      email: data.email || "",
      displayName: data.displayName || "",
      telegramChatId: data.telegramChatId || undefined,
      notificationPreferences: data.notificationPreferences || undefined,
    };
  } catch (error) {
    console.error(`Failed to load customer ${customerId}:`, error);
    return null;
  }
}

/**
 * Write the storefront bell record.
 *
 * `userId` is what marks a document as customer-facing: the POS owner views
 * deliberately filter those out of the shared `notifications` collection.
 */
async function writeInAppNotification(
  customerId: string,
  content: ReturnType<typeof buildNotificationContent>,
  event: CustomerNotificationEvent,
): Promise<boolean> {
  if (!adminDb) return false;

  try {
    const orderRef =
      "order" in event && event.order ? event.order.orderRef : undefined;

    await adminDb.collection("notifications").add({
      userId: customerId,
      type: content.inApp.type,
      title: content.inApp.title,
      message: content.inApp.message,
      link: content.inApp.link || null,
      ...(orderRef ? { orderId: orderRef, onlineOrderId: orderRef } : {}),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Failed to write in-app notification:", error);
    return false;
  }
}

/**
 * Deliver one event to one customer across every permitted channel.
 *
 * Never throws: callers are webhooks, API routes and order-status handlers that
 * must not fail their primary job because a notification could not go out.
 */
export async function notifyCustomer(
  input: NotifyCustomerInput,
): Promise<DispatchResult> {
  const { customerId, event } = input;
  const result: DispatchResult = {
    customerId,
    type: event.type,
    email: null,
    telegram: null,
    inApp: null,
    skipped: {},
  };

  const stored = await loadNotificationTarget(customerId);

  // Fall back to the address supplied by the caller so a brand-new checkout
  // still gets its confirmation even if the customer document lags behind.
  const target: NotificationTarget = {
    customerId,
    email: stored?.email || input.fallbackEmail || "",
    displayName: stored?.displayName || input.fallbackDisplayName || "",
    telegramChatId: stored?.telegramChatId,
    notificationPreferences: stored?.notificationPreferences,
  };

  const content = buildNotificationContent(event, {
    displayName: target.displayName || undefined,
  });
  const channels = resolveChannels(target, content.preference);

  if (channels.email.allowed) {
    const sent = await sendMail({
      to: target.email as string,
      subject: content.email.subject,
      html: content.email.html,
      text: content.email.text,
    });
    result.email = sent.sent;
    if (!sent.sent && sent.error) {
      result.skipped!.email = sent.error;
    }
  } else {
    result.skipped!.email = channels.email.reason;
  }

  if (channels.telegram.allowed) {
    const chatId = target.telegramChatId as string;
    // A promotion with artwork reads far better as a photo with a caption.
    // Telegram caps captions at 1024 characters, so fall back to a plain
    // message when the body is too long to ride along with the image.
    const canUsePhoto =
      !!content.telegram.photo && content.telegram.html.length <= 1024;

    result.telegram = canUsePhoto
      ? await sendPhotoSafe(
          chatId,
          content.telegram.photo as string,
          content.telegram.html,
          { parse_mode: "HTML" },
        )
      : await sendMessageSafe(chatId, content.telegram.html, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
  } else {
    result.skipped!.telegram = channels.telegram.reason;
  }

  if (input.skipInApp) {
    result.skipped!.inApp = "skipped by caller";
  } else {
    result.inApp = await writeInAppNotification(customerId, content, event);
  }

  console.log(
    `[notify] ${event.type} -> ${customerId}: email=${result.email} telegram=${result.telegram} inApp=${result.inApp}`,
    Object.keys(result.skipped || {}).length ? result.skipped : "",
  );

  return result;
}
