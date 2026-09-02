/**
 * Telegram Cart Service
 * Manage shopping cart for Telegram users
 */

import { adminDb } from "../firebase-admin";
import type { TelegramCart, TelegramCartItem } from "./types";

/**
 * Get cart for Telegram user
 */
export async function getTelegramCart(chatId: string): Promise<TelegramCart | null> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return null;
  }

  try {
    const cartDoc = await adminDb.collection("telegramCarts").doc(chatId).get();

    if (!cartDoc.exists) {
      return {
        items: [],
        chatId,
        updatedAt: new Date(),
      };
    }

    const data = cartDoc.data();
    if (!data) return null;

    return {
      items: data.items || [],
      chatId,
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  } catch (error) {
    console.error("Error getting Telegram cart:", error);
    return null;
  }
}

/**
 * Add item to Telegram cart
 */
export async function addToTelegramCart(
  chatId: string,
  item: TelegramCartItem
): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    const cart = await getTelegramCart(chatId);
    if (!cart) return false;

    // Check if item already exists
    const existingIndex = cart.items.findIndex(
      (i) =>
        i.productId === item.productId &&
        i.variantId === item.variantId &&
        i.color === item.color &&
        i.size === item.size
    );

    if (existingIndex >= 0) {
      // Update quantity
      cart.items[existingIndex].quantity += item.quantity;

      // Cap at max quantity
      if (
        item.maxQuantity &&
        cart.items[existingIndex].quantity > item.maxQuantity
      ) {
        cart.items[existingIndex].quantity = item.maxQuantity;
      }
    } else {
      // Add new item
      cart.items.push(item);
    }

    cart.updatedAt = new Date();

    await adminDb.collection("telegramCarts").doc(chatId).set(cart);

    return true;
  } catch (error) {
    console.error("Error adding to Telegram cart:", error);
    return false;
  }
}

/**
 * Remove item from Telegram cart
 */
export async function removeFromTelegramCart(
  chatId: string,
  productId: string,
  variantId?: string
): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    const cart = await getTelegramCart(chatId);
    if (!cart) return false;

    cart.items = cart.items.filter(
      (item) =>
        !(item.productId === productId && item.variantId === variantId)
    );

    cart.updatedAt = new Date();

    await adminDb.collection("telegramCarts").doc(chatId).set(cart);

    return true;
  } catch (error) {
    console.error("Error removing from Telegram cart:", error);
    return false;
  }
}

/**
 * Update cart item quantity
 */
export async function updateTelegramCartQuantity(
  chatId: string,
  productId: string,
  quantity: number,
  variantId?: string
): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    const cart = await getTelegramCart(chatId);
    if (!cart) return false;

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.productId === productId && item.variantId === variantId
    );

    if (itemIndex < 0) {
      return false;
    }

    if (quantity <= 0) {
      // Remove item
      cart.items.splice(itemIndex, 1);
    } else {
      // Update quantity
      cart.items[itemIndex].quantity = quantity;

      // Cap at max quantity
      if (
        cart.items[itemIndex].maxQuantity &&
        quantity > cart.items[itemIndex].maxQuantity!
      ) {
        cart.items[itemIndex].quantity = cart.items[itemIndex].maxQuantity!;
      }
    }

    cart.updatedAt = new Date();

    await adminDb.collection("telegramCarts").doc(chatId).set(cart);

    return true;
  } catch (error) {
    console.error("Error updating Telegram cart quantity:", error);
    return false;
  }
}

/**
 * Clear Telegram cart
 */
export async function clearTelegramCart(chatId: string): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    await adminDb.collection("telegramCarts").doc(chatId).set({
      items: [],
      chatId,
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error("Error clearing Telegram cart:", error);
    return false;
  }
}

/**
 * Merge Telegram cart with customer cart
 */
export async function mergeTelegramCartWithCustomer(
  chatId: string,
  customerId: string
): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    const telegramCart = await getTelegramCart(chatId);
    if (!telegramCart || telegramCart.items.length === 0) {
      return true; // Nothing to merge
    }

    const customerDoc = await adminDb.collection("customers").doc(customerId).get();

    if (!customerDoc.exists) {
      return false;
    }

    const customerData = customerDoc.data();
    const customerCartItems = customerData?.cartItems || [];

    // Merge items
    const mergedItems = [...customerCartItems];

    telegramCart.items.forEach((telegramItem) => {
      const existingIndex = mergedItems.findIndex(
        (item: any) =>
          item.productId === telegramItem.productId &&
          item.variantId === telegramItem.variantId &&
          item.color === telegramItem.color &&
          item.size === telegramItem.size
      );

      if (existingIndex >= 0) {
        // Update quantity
        mergedItems[existingIndex].quantity += telegramItem.quantity;
      } else {
        // Add new item
        mergedItems.push({
          id: `${telegramItem.productId}_${telegramItem.variantId || "default"}`,
          productId: telegramItem.productId,
          name: telegramItem.name,
          image: telegramItem.image,
          variantId: telegramItem.variantId,
          color: telegramItem.color,
          size: telegramItem.size,
          unitPriceTHB: telegramItem.price,
          quantity: telegramItem.quantity,
          maxQuantity: telegramItem.maxQuantity,
        });
      }
    });

    // Update customer cart
    await adminDb.collection("customers").doc(customerId).update({
      cartItems: mergedItems,
      cartUpdatedAt: new Date(),
      updatedAt: new Date(),
    });

    // Clear Telegram cart
    await clearTelegramCart(chatId);

    console.log(`✅ Merged Telegram cart with customer ${customerId}`);

    return true;
  } catch (error) {
    console.error("Error merging Telegram cart:", error);
    return false;
  }
}
