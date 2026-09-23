"use client";

/**
 * Shopping cart state.
 *
 * For a signed-in customer, Firestore is the single source of truth:
 * `customers/{uid}.cartItems` is watched with `onSnapshot`, so the cart is the
 * same in every browser, on every device, and updates live when it changes
 * elsewhere — including from the Telegram bot, which writes the same field.
 * Mutations write straight to Firestore; nothing is cached in `localStorage`,
 * because a per-browser copy is exactly what made carts diverge and let a stale
 * device overwrite a cart that had been emptied somewhere else.
 *
 * `localStorage` survives only for **guests**, who have no document to write to.
 * That cart is folded into the customer's cart the first time they sign in.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../lib/firebase";
import { useCustomerAuth } from "./CustomerAuthContext";

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  image: string;
  variantId?: string;
  color?: string;
  size?: string;
  unitPriceTHB: number;
  quantity: number;
  maxQuantity?: number;
};

type CartContextType = {
  items: CartItem[];
  itemCount: number;
  subtotalTHB: number;
  /**
   * True until the cart is known to be complete.
   *
   * For a signed-in customer the cart arrives from Firestore after mount, so
   * `items` is briefly empty even when it is not. Consumers must check this
   * before rendering an empty state, or the cart flashes "empty" on load.
   */
  isLoading: boolean;
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
};

/** Guest-only cart storage. Signed-in carts live in Firestore. */
const CART_STORAGE_KEY = "sth_cart_v1";

const CartContext = createContext<CartContextType | null>(null);

/** Drop anything malformed; the cart is written by several clients. */
function sanitizeCartItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) return [];
  const sanitized: CartItem[] = [];

  input.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item as Partial<CartItem>;
    if (!record.id || !record.productId || !record.name) return;

    const quantity = Math.max(1, Math.floor(Number(record.quantity) || 1));
    const maxQuantity =
      typeof record.maxQuantity === "number"
        ? Math.max(1, Math.floor(record.maxQuantity))
        : undefined;

    sanitized.push({
      id: String(record.id),
      productId: String(record.productId),
      name: String(record.name),
      image: String(record.image || ""),
      variantId: record.variantId ? String(record.variantId) : undefined,
      color: record.color ? String(record.color) : undefined,
      size: record.size ? String(record.size) : undefined,
      unitPriceTHB: Number(record.unitPriceTHB) || 0,
      quantity,
      maxQuantity,
    });
  });

  return sanitized;
}

/**
 * Read the guest cart.
 *
 * Tolerates the two historical shapes: a bare array, and the `{ items,
 * updatedAt }` wrapper used while carts were reconciled by recency.
 */
function readGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return sanitizeCartItems(parsed);
    if (parsed && Array.isArray(parsed.items)) {
      return sanitizeCartItems(parsed.items);
    }
  } catch {
    // corrupt payload: start empty
  }
  return [];
}

function writeGuestCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage write failures
  }
}

function clearGuestCart() {
  try {
    localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // ignore storage write failures
  }
}

/** Fold a guest cart into the customer's, stacking matching lines. */
function mergeCarts(base: CartItem[], incoming: CartItem[]): CartItem[] {
  const merged = [...base];

  incoming.forEach((item) => {
    const index = merged.findIndex((existing) => existing.id === item.id);

    if (index === -1) {
      merged.push(item);
      return;
    }

    const existing = merged[index];
    const total = existing.quantity + item.quantity;
    const cap = existing.maxQuantity ?? item.maxQuantity;
    merged[index] = {
      ...existing,
      quantity: typeof cap === "number" ? Math.min(total, cap) : total,
    };
  });

  return merged;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useCustomerAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Mirror of `items` for mutations.
   *
   * Handlers are recreated every render and would otherwise close over a stale
   * array; reading the ref means a rapid sequence of taps composes correctly.
   */
  const itemsRef = useRef<CartItem[]>([]);

  const setCart = (next: CartItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  /** uid whose guest-cart handoff has already happened. */
  const mergedForUidRef = useRef<string | null>(null);

  const remote = !!(user && db && isFirebaseConfigured);

  /** Persist to whichever store backs this session. */
  const persist = (next: CartItem[]) => {
    if (user && db && isFirebaseConfigured) {
      void setDoc(
        doc(db, "customers", user.uid),
        {
          cartItems: next,
          cartUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch((error) => {
        // Surfaced rather than swallowed: a failed write means the optimistic
        // state below is now ahead of the server, and the next snapshot will
        // visibly roll it back.
        console.error("Failed to save cart:", error);
      });
      return;
    }

    writeGuestCart(next);
  };

  // Guest session: hydrate from localStorage. Skipped entirely once signed in,
  // where the Firestore subscription below is authoritative.
  useEffect(() => {
    if (authLoading) return;
    if (remote) return;

    setCart(readGuestCart());
    setIsLoading(false);
  }, [authLoading, remote]);

  // Signed-in session: live subscription. This is what makes the cart update
  // across browsers and react to Telegram writes without a refresh.
  useEffect(() => {
    if (authLoading || !user || !db || !isFirebaseConfigured) return;

    const uid = user.uid;
    const firestore = db;

    // Captured before the first snapshot replaces local state.
    const guestCart =
      mergedForUidRef.current === uid ? [] : readGuestCart();

    setIsLoading(true);

    const unsubscribe = onSnapshot(
      doc(firestore, "customers", uid),
      (snapshot) => {
        const serverItems = sanitizeCartItems(snapshot.data()?.cartItems);

        // One-time handoff: anything added before signing in joins the account
        // cart, then the browser copy is discarded so it can never resurrect.
        if (mergedForUidRef.current !== uid) {
          mergedForUidRef.current = uid;
          clearGuestCart();

          if (guestCart.length > 0) {
            const merged = mergeCarts(serverItems, guestCart);
            setCart(merged);
            setIsLoading(false);
            persist(merged);
            return;
          }
        }

        setCart(serverItems);
        setIsLoading(false);
      },
      (error) => {
        console.error("Cart subscription failed:", error);
        setIsLoading(false);
      },
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  /**
   * Apply a change optimistically, then persist it.
   *
   * The local update keeps the UI instant; for a signed-in customer the snapshot
   * that follows confirms it (Firestore replays pending writes from its own cache,
   * so there is no flicker).
   */
  const mutate = (next: (prev: CartItem[]) => CartItem[]) => {
    const updated = next(itemsRef.current);
    setCart(updated);
    persist(updated);
  };

  const addItem = (item: CartItem) => {
    mutate((prev) => {
      const existingIndex = prev.findIndex((x) => x.id === item.id);
      if (existingIndex === -1) {
        const safeQty = Math.max(1, item.quantity || 1);
        return [...prev, { ...item, quantity: safeQty }];
      }

      const existing = prev[existingIndex];
      const nextQty = existing.quantity + Math.max(1, item.quantity || 1);
      const capped =
        typeof existing.maxQuantity === "number"
          ? Math.min(nextQty, existing.maxQuantity)
          : nextQty;

      const copy = [...prev];
      copy[existingIndex] = { ...existing, quantity: capped };
      return copy;
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    mutate((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const safeQty = Math.max(0, Math.floor(quantity));
          if (safeQty === 0) return null;

          const capped =
            typeof item.maxQuantity === "number"
              ? Math.min(safeQty, item.maxQuantity)
              : safeQty;
          return { ...item, quantity: capped };
        })
        .filter((x): x is CartItem => x !== null),
    );
  };

  const removeItem = (id: string) => {
    mutate((prev) => prev.filter((x) => x.id !== id));
  };

  const clearCart = () => mutate(() => []);

  const value = useMemo<CartContextType>(() => {
    const itemCount = items.reduce((total, item) => total + item.quantity, 0);
    const subtotalTHB = items.reduce(
      (total, item) => total + item.unitPriceTHB * item.quantity,
      0,
    );

    return {
      items,
      itemCount,
      subtotalTHB,
      isLoading,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isLoading]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
