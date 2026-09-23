/**
 * Telegram Cart Service
 * Manage shopping cart for Telegram users
 */

import { adminDb } from "../firebase-admin";
import type { TelegramCart, TelegramCartItem } from "./types";

/**
 * Drop keys whose value is `undefined`.
 *
 * The Admin SDK rejects an undefined value outright — "Cannot use 'undefined' as
 * a Firestore value" — which took down the whole write. That is how adding a
 * garment with no colour name failed: the payload carried `color: undefined`,
 * because `variant.color || undefined` turns an empty colour into undefined.
 */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Cart line in the shape the bot works with (prices in THB).
 *
 * Deliberately close to `TelegramCartItem`, but also convertible to the
 * storefront's `CartItem` so one item can be written to either cart.
 */
export interface UnifiedCartItem {
  productId: string;
  name: string;
  image?: string;
  variantId?: string;
  color?: string;
  size?: string;
  price: number;
  quantity: number;
  maxQuantity?: number;
}

/**
 * Cart line id used by the storefront (`CartContext`).
 *
 * Must match the product page exactly — `${productId}:${variantId}:${size}` — or
 * the same garment added from Telegram and from the website would sit in the cart
 * twice instead of stacking.
 */
export function storefrontCartItemId(
  productId: string,
  variantId?: string,
  size?: string,
): string {
  return `${productId}:${variantId ?? ""}:${size ?? ""}`;
}

/**
 * Add to the signed-in customer's storefront cart (`customers/{uid}.cartItems`).
 *
 * This is what makes a Telegram cart actually reach the website: the previous
 * behaviour only ever wrote `telegramCarts/{chatId}`, and that was merged into the
 * customer document once, at account-link time — so anything added afterwards
 * never appeared on the site.
 *
 * Writes the storefront's own `CartItem` shape. `CartContext.sanitizeCartItems`
 * discards any entry missing `id`, `productId` or `name`, so those three are
 * always set.
 */
export async function addToCustomerCart(
  customerId: string,
  item: UnifiedCartItem,
): Promise<boolean> {
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    return false;
  }

  try {
    const ref = adminDb.collection("customers").doc(customerId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      console.error(`Cannot add to cart: customer ${customerId} not found`);
      return false;
    }

    const existing = Array.isArray(snapshot.data()?.cartItems)
      ? [...(snapshot.data()!.cartItems as Array<Record<string, unknown>>)]
      : [];

    const id = storefrontCartItemId(item.productId, item.variantId, item.size);
    const index = existing.findIndex((line) => String(line.id) === id);

    if (index >= 0) {
      const current = Number(existing[index].quantity) || 0;
      const max = Number(existing[index].maxQuantity ?? item.maxQuantity ?? 0);
      const next = current + item.quantity;
      existing[index] = {
        ...existing[index],
        quantity: max > 0 ? Math.min(next, max) : next,
      };
    } else {
      existing.push(
        compact({
          id,
          productId: item.productId,
          name: item.name,
          image: item.image ?? "",
          variantId: item.variantId,
          color: item.color,
          size: item.size,
          unitPriceTHB: item.price,
          quantity: item.quantity,
          maxQuantity: item.maxQuantity,
        }),
      );
    }

    await ref.update({
      cartItems: existing,
      cartUpdatedAt: new Date(),
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error("Error adding to customer cart:", error);
    return false;
  }
}

/** Read the storefront cart back in the bot's shape. */
export async function getCustomerCart(
  customerId: string,
): Promise<UnifiedCartItem[]> {
  if (!adminDb) return [];

  try {
    const snapshot = await adminDb.collection("customers").doc(customerId).get();
    const raw = snapshot.data()?.cartItems;
    if (!Array.isArray(raw)) return [];

    return (raw as Array<Record<string, unknown>>)
      .filter((line) => line?.productId && line?.name)
      .map((line) => ({
        productId: String(line.productId),
        name: String(line.name),
        image: line.image ? String(line.image) : undefined,
        variantId: line.variantId ? String(line.variantId) : undefined,
        color: line.color ? String(line.color) : undefined,
        size: line.size ? String(line.size) : undefined,
        price: Number(line.unitPriceTHB ?? line.price ?? 0),
        quantity: Number(line.quantity) || 1,
        maxQuantity:
          line.maxQuantity !== undefined ? Number(line.maxQuantity) : undefined,
      }));
  } catch (error) {
    console.error("Error reading customer cart:", error);
    return [];
  }
}

/** Empty the storefront cart. */
export async function clearCustomerCart(customerId: string): Promise<boolean> {
  if (!adminDb) return false;

  try {
    await adminDb.collection("customers").doc(customerId).update({
      cartItems: [],
      cartUpdatedAt: new Date(),
      updatedAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error("Error clearing customer cart:", error);
    return false;
  }
}

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
      // Add new item. Compacted because an optional field left as `undefined`
      // (an unnamed colour, a missing variant id) would make Firestore reject
      // the entire document.
      cart.items.push(compact({ ...item }));
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
      // Match on the storefront's own line id. Matching on loose field equality
      // missed lines the website had written (its ids encode product, variant and
      // size), and the id this used to mint — `productId_variantId` — both
      // disagreed with the website's `productId:variantId:size` format and
      // ignored size, so two sizes of one garment collided into a single line.
      const id = storefrontCartItemId(
        telegramItem.productId,
        telegramItem.variantId,
        telegramItem.size,
      );

      const existingIndex = mergedItems.findIndex(
        (item: Record<string, unknown>) => String(item.id) === id,
      );

      if (existingIndex >= 0) {
        // Update quantity
        mergedItems[existingIndex].quantity += telegramItem.quantity;
      } else {
        // Add new item. Compacted because Firestore rejects undefined values, and
        // an unnamed colour or missing variant id leaves those fields undefined.
        mergedItems.push(
          compact({
            id,
            productId: telegramItem.productId,
            name: telegramItem.name,
            image: telegramItem.image ?? "",
            variantId: telegramItem.variantId,
            color: telegramItem.color,
            size: telegramItem.size,
            unitPriceTHB: telegramItem.price,
            quantity: telegramItem.quantity,
            maxQuantity: telegramItem.maxQuantity,
          }),
        );
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
