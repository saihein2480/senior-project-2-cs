/**
 * Telegram Customer Service
 * Customer data operations for Telegram integration
 */

import { adminDb } from "../firebase-admin";
import type { CustomerTelegramData } from "./types";

/**
 * Get customer by Telegram chat ID
 */
export async function getCustomerByTelegramId(
  telegramChatId: string
): Promise<(CustomerTelegramData & { id: string; email: string; displayName?: string; phone?: string; address?: string }) | null> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return null;
  }

  try {
    const customersRef = adminDb.collection("customers");
    const querySnapshot = await customersRef
      .where("telegramChatId", "==", telegramChatId)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();

    return {
      id: doc.id,
      email: data.email || "",
      displayName: data.displayName,
      phone: data.phone,
      address: data.address,
      telegramChatId: data.telegramChatId,
      telegramUsername: data.telegramUsername,
      telegramFirstName: data.telegramFirstName,
      telegramLastName: data.telegramLastName,
      telegramLinkedAt: data.telegramLinkedAt?.toDate(),
      notificationPreferences: data.notificationPreferences || {
        telegram: true,
        orderUpdates: true,
        promotions: true,
        deliveryAlerts: true,
      },
    };
  } catch (error) {
    console.error("Error getting customer by Telegram ID:", error);
    return null;
  }
}

/**
 * The uid of the customer this Telegram chat is linked to, or null.
 *
 * This is the only identity an inbound bot message carries, so anything that
 * reveals or acts on customer data (order lookups, cancellations) must be scoped
 * to it. `telegramChatId` is always written as a string (see
 * `linkTelegramToCustomer`), so the chat id is matched as one; linking also
 * guarantees a chat id is held by at most one customer.
 */
export async function getLinkedCustomerUid(
  chatId: string | number,
): Promise<string | null> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return null;
  }

  const key = String(chatId ?? "").trim();
  if (!key) return null;

  try {
    const snap = await adminDb
      .collection("customers")
      .where("telegramChatId", "==", key)
      .limit(1)
      .get();

    return snap.empty ? null : snap.docs[0].id;
  } catch (error) {
    console.error("Error resolving linked customer for Telegram chat:", error);
    return null;
  }
}

/**
 * Get customer by ID
 */
export async function getCustomerById(
  customerId: string
): Promise<(CustomerTelegramData & { email: string; displayName?: string; phone?: string; address?: string }) | null> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return null;
  }

  try {
    const doc = await adminDb.collection("customers").doc(customerId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) return null;

    return {
      email: data.email || "",
      displayName: data.displayName,
      phone: data.phone,
      address: data.address,
      telegramChatId: data.telegramChatId,
      telegramUsername: data.telegramUsername,
      telegramFirstName: data.telegramFirstName,
      telegramLastName: data.telegramLastName,
      telegramLinkedAt: data.telegramLinkedAt?.toDate(),
      notificationPreferences: data.notificationPreferences,
    };
  } catch (error) {
    console.error("Error getting customer by ID:", error);
    return null;
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  customerId: string,
  preferences: Partial<CustomerTelegramData["notificationPreferences"]>
): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    await adminDb
      .collection("customers")
      .doc(customerId)
      .update({
        notificationPreferences: preferences,
        updatedAt: new Date(),
      });

    return true;
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return false;
  }
}

/**
 * Check if customer has Telegram enabled for notifications
 */
export async function isTelegramNotificationsEnabled(
  customerId: string
): Promise<boolean> {
  const customer = await getCustomerById(customerId);

  if (!customer || !customer.telegramChatId) {
    return false;
  }

  return customer.notificationPreferences?.telegram ?? true;
}

/**
 * Get all customers with Telegram linked
 */
export async function getAllTelegramCustomers(): Promise<
  Array<{
    id: string;
    email: string;
    telegramChatId: string;
    displayName?: string;
  }>
> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return [];
  }

  try {
    const customersRef = adminDb.collection("customers");
    const querySnapshot = await customersRef
      .where("telegramChatId", "!=", null)
      .get();

    const customers: Array<{
      id: string;
      email: string;
      telegramChatId: string;
      displayName?: string;
    }> = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.telegramChatId) {
        customers.push({
          id: doc.id,
          email: data.email,
          telegramChatId: data.telegramChatId,
          displayName: data.displayName,
        });
      }
    });

    return customers;
  } catch (error) {
    console.error("Error getting Telegram customers:", error);
    return [];
  }
}
