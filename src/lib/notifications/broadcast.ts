/**
 * Store-wide customer announcements (new promotion, new loyalty rewards).
 *
 * Unlike `notifyCustomer`, this walks the whole `customers` collection, so it is
 * deliberately conservative: recipients are paced to stay inside Telegram's
 * ~30 messages/second ceiling and Gmail's much stricter SMTP limits, the
 * audience is capped, and each message is addressed individually so no customer
 * ever sees another customer's address.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { isEmailConfigured, sendMail } from "../email/mailer";
import { sendMessageSafe, sendPhotoSafe } from "../telegram/api-client";
import { buildNotificationContent } from "./content";
import { resolveChannels, type NotificationTarget } from "./dispatch";
import type { BroadcastResult, CustomerNotificationEvent } from "./types";

/**
 * Hard ceiling on one broadcast.
 *
 * A free Gmail account is cut off around 500 messages a day, so a store with a
 * bigger list needs a real ESP rather than a higher number here.
 */
const DEFAULT_MAX_RECIPIENTS = 400;

/** Telegram tolerates ~30 messages/second; 40ms leaves headroom. */
const TELEGRAM_PACING_MS = 40;

/** Gmail SMTP throttles aggressively, so leave a wider gap between messages. */
const EMAIL_PACING_MS = 250;

/** Firestore caps a write batch at 500 operations. */
const FIRESTORE_BATCH_LIMIT = 450;

export interface BroadcastOptions {
  maxRecipients?: number;
  /** Also drop a record in each customer's storefront bell. Default true. */
  includeInApp?: boolean;
  /** Restrict to these customer ids instead of the whole list. */
  onlyCustomerIds?: string[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Good enough to weed out the placeholder addresses that POS walk-in customers
 * are sometimes created with. Full RFC validation is not the point; not wasting
 * SMTP attempts on `n/a` is.
 */
function looksLikeEmail(value: string | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/**
 * Everyone we could conceivably reach: a usable email address, a linked
 * Telegram chat, or both.
 *
 * Reads the collection once and filters in memory rather than using
 * `where("telegramChatId", "!=", null)` — that query silently drops every
 * document where the field was never written, which is most of them.
 */
export async function loadBroadcastAudience(
  options: BroadcastOptions = {},
): Promise<NotificationTarget[]> {
  if (!adminDb) {
    console.error("Cannot load broadcast audience: Firebase Admin not configured");
    return [];
  }

  const targets: NotificationTarget[] = [];

  try {
    if (options.onlyCustomerIds?.length) {
      const refs = options.onlyCustomerIds.map((id) =>
        adminDb!.collection("customers").doc(id),
      );
      const snapshots = await adminDb.getAll(...refs);
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists) return;
        const data = snapshot.data() || {};
        targets.push({
          customerId: snapshot.id,
          email: data.email || "",
          displayName: data.displayName || "",
          telegramChatId: data.telegramChatId || undefined,
          notificationPreferences: data.notificationPreferences || undefined,
        });
      });
    } else {
      const snapshot = await adminDb.collection("customers").get();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const email = (data.email || "").trim();
        const telegramChatId = data.telegramChatId || undefined;

        if (!looksLikeEmail(email) && !telegramChatId) return;

        targets.push({
          customerId: doc.id,
          email,
          displayName: data.displayName || "",
          telegramChatId,
          notificationPreferences: data.notificationPreferences || undefined,
        });
      });
    }
  } catch (error) {
    console.error("Failed to load broadcast audience:", error);
    return [];
  }

  return targets;
}

/**
 * Send one event to every opted-in customer.
 *
 * Never throws. Returns per-channel counters so the caller (and the owner, via
 * a toast) can see exactly how far the announcement got.
 */
export async function broadcastToCustomers(
  event: CustomerNotificationEvent,
  options: BroadcastOptions = {},
): Promise<BroadcastResult> {
  const result: BroadcastResult = {
    type: event.type,
    audience: 0,
    emailSent: 0,
    emailFailed: 0,
    telegramSent: 0,
    telegramFailed: 0,
    inAppCreated: 0,
  };

  const maxRecipients = options.maxRecipients ?? DEFAULT_MAX_RECIPIENTS;
  const includeInApp = options.includeInApp !== false;

  const audience = (await loadBroadcastAudience(options)).slice(0, maxRecipients);
  result.audience = audience.length;

  if (audience.length === 0) {
    console.warn(`[broadcast] ${event.type}: no reachable customers`);
    return result;
  }

  if (!isEmailConfigured) {
    console.warn(
      "[broadcast] email is not configured; only Telegram recipients will be reached",
    );
  }

  /** In-app records, accumulated and committed in batches at the end. */
  const inAppRecords: Array<{
    customerId: string;
    type: string;
    title: string;
    message: string;
    link: string | null;
  }> = [];

  for (const target of audience) {
    // Rebuilt per recipient so each message carries its own greeting. The
    // builder is pure string work, so the cost is irrelevant next to the I/O.
    const content = buildNotificationContent(event, {
      displayName: target.displayName || undefined,
    });
    const channels = resolveChannels(target, content.preference);

    if (channels.email.allowed && looksLikeEmail(target.email)) {
      const sent = await sendMail({
        to: target.email as string,
        subject: content.email.subject,
        html: content.email.html,
        text: content.email.text,
      });
      if (sent.sent) {
        result.emailSent++;
      } else {
        result.emailFailed++;
      }
      await sleep(EMAIL_PACING_MS);
    }

    if (channels.telegram.allowed) {
      const chatId = target.telegramChatId as string;
      const canUsePhoto =
        !!content.telegram.photo && content.telegram.html.length <= 1024;

      const sent = canUsePhoto
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

      if (sent) {
        result.telegramSent++;
      } else {
        result.telegramFailed++;
      }
      await sleep(TELEGRAM_PACING_MS);
    }

    if (includeInApp) {
      inAppRecords.push({
        customerId: target.customerId,
        type: content.inApp.type,
        title: content.inApp.title,
        message: content.inApp.message,
        link: content.inApp.link || null,
      });
    }
  }

  if (inAppRecords.length && adminDb) {
    result.inAppCreated = await commitInAppRecords(inAppRecords);
  }

  console.log(
    `[broadcast] ${event.type}: audience=${result.audience} ` +
      `email=${result.emailSent}/${result.emailSent + result.emailFailed} ` +
      `telegram=${result.telegramSent}/${result.telegramSent + result.telegramFailed} ` +
      `inApp=${result.inAppCreated}`,
  );

  return result;
}

/** Commit the bell records in Firestore-sized batches. Returns how many landed. */
async function commitInAppRecords(
  records: Array<{
    customerId: string;
    type: string;
    title: string;
    message: string;
    link: string | null;
  }>,
): Promise<number> {
  if (!adminDb) return 0;

  let written = 0;

  for (let i = 0; i < records.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = records.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = adminDb.batch();

    chunk.forEach((record) => {
      const ref = adminDb!.collection("notifications").doc();
      batch.set(ref, {
        userId: record.customerId,
        type: record.type,
        title: record.title,
        message: record.message,
        link: record.link,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    try {
      await batch.commit();
      written += chunk.length;
    } catch (error) {
      console.error("Failed to commit in-app notification batch:", error);
    }
  }

  return written;
}
