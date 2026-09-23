"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
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
   * `localStorage` resolves immediately but the signed-in customer's server cart
   * is fetched asynchronously, so `items` is briefly empty even when it is not.
   * Without this flag a consumer renders its empty state during that gap — which
   * is what made the cart look empty for a moment after arriving from Telegram.
   */
  isLoading: boolean;
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
};

const CART_STORAGE_KEY = "sth_cart_v1";

/**
 * Locally persisted cart plus when it last changed.
 *
 * The timestamp is what lets a signed-in customer's remote cart and this device's
 * cart be reconciled by recency. Without it, whichever side loaded last silently
 * won — and because an empty remote cart was treated as "nothing to load", a cart
 * cleared from Telegram was immediately overwritten by stale local items.
 */
type StoredCart = { items: CartItem[]; updatedAt: number };

function readStoredCart(raw: string | null): StoredCart {
  if (!raw) return { items: [], updatedAt: 0 };

  try {
    const parsed = JSON.parse(raw);

    // Pre-timestamp format was a bare array. Treat it as infinitely old so the
    // remote cart wins, which is the safer direction on upgrade.
    if (Array.isArray(parsed)) {
      return { items: parsed as CartItem[], updatedAt: 0 };
    }

    if (parsed && Array.isArray(parsed.items)) {
      return {
        items: parsed.items as CartItem[],
        updatedAt: Number(parsed.updatedAt) || 0,
      };
    }
  } catch {
    // fall through to an empty cart
  }

  return { items: [], updatedAt: 0 };
}
const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useCustomerAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [hasLoadedRemoteCart, setHasLoadedRemoteCart] = useState(false);

  /**
   * When this device's cart last changed, in epoch ms.
   *
   * A ref rather than state: it is only ever compared during reconciliation, and
   * making it state would retrigger the effects that maintain it.
   */
  const localUpdatedAtRef = useRef(0);

  const sanitizeCartItems = (input: unknown): CartItem[] => {
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
  };

  useEffect(() => {
    try {
      const stored = readStoredCart(localStorage.getItem(CART_STORAGE_KEY));
      setItems(stored.items);
      localUpdatedAtRef.current = stored.updatedAt;
    } catch {
      // ignore invalid persisted cart data
      setItems([]);
    } finally {
      setHasLoadedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage || authLoading) return;

    if (!user || !db || !isFirebaseConfigured) {
      setHasLoadedRemoteCart(true);
      return;
    }

    const firestore = db;
    const uid = user.uid;

    const loadRemoteCart = async () => {
      try {
        const customerDocRef = doc(firestore, "customers", uid);
        const customerDoc = await getDoc(customerDocRef);
        const data = customerDoc.data();

        // A cart the Telegram bot emptied is an explicit empty array, not a
        // missing field — so "has the field" and "has items" are different
        // questions. Conflating them meant a remote clear was never adopted, and
        // the sync effect below then wrote the stale local items straight back.
        const hasRemoteCart = Array.isArray(data?.cartItems);
        if (!hasRemoteCart) {
          // Never had a cart on the server: keep whatever this device holds and
          // let the sync effect upload it.
          return;
        }

        const remoteItems = sanitizeCartItems(data?.cartItems);
        const remoteUpdatedAt =
          data?.cartUpdatedAt?.toMillis?.() ??
          (data?.cartUpdatedAt ? new Date(data.cartUpdatedAt).getTime() : 0);

        // Last write wins. That way a clear or an add from Telegram is adopted
        // here, while a guest cart built on this device just before signing in is
        // not thrown away.
        if (remoteUpdatedAt >= localUpdatedAtRef.current) {
          setItems(remoteItems);
          localUpdatedAtRef.current = remoteUpdatedAt;
        }
      } catch {
        // keep local cart if remote fetch fails
      } finally {
        setHasLoadedRemoteCart(true);
      }
    };

    setHasLoadedRemoteCart(false);
    void loadRemoteCart();
  }, [user, authLoading, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    try {
      const payload: StoredCart = {
        items,
        updatedAt: localUpdatedAtRef.current,
      };
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage write failures
    }
  }, [items, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage || authLoading || !hasLoadedRemoteCart) return;
    if (!user || !db || !isFirebaseConfigured) return;

    const firestore = db;
    const uid = user.uid;

    const syncRemoteCart = async () => {
      try {
        const customerDocRef = doc(firestore, "customers", uid);
        await setDoc(
          customerDocRef,
          {
            cartItems: items,
            cartUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch {
        // ignore remote sync failures to avoid blocking cart UX
      }
    };

    void syncRemoteCart();
  }, [items, user, authLoading, hasLoadedStorage, hasLoadedRemoteCart]);

  /**
   * Apply a local cart change and stamp it as the newest.
   *
   * Every mutation goes through here so the recency comparison on the next load
   * knows this device is ahead of the server.
   */
  const mutate = (next: (prev: CartItem[]) => CartItem[]) => {
    localUpdatedAtRef.current = Date.now();
    setItems(next);
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

  // Still settling while auth is unresolved (we do not yet know whether there is
  // a server cart to wait for), while localStorage is unread, or while a
  // signed-in customer's server cart is in flight.
  const isLoading =
    authLoading || !hasLoadedStorage || (!!user && !hasLoadedRemoteCart);

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
  }, [items, isLoading]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
