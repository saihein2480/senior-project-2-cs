"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
};

const CART_STORAGE_KEY = "sth_cart_v1";
const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useCustomerAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [hasLoadedRemoteCart, setHasLoadedRemoteCart] = useState(false);

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
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) {
        setItems([]);
      } else {
        const parsed = JSON.parse(raw) as CartItem[];
        setItems(Array.isArray(parsed) ? parsed : []);
      }
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
        const remoteItems = sanitizeCartItems(customerDoc.data()?.cartItems);

        if (remoteItems.length > 0) {
          setItems(remoteItems);
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
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
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

  const addItem = (item: CartItem) => {
    setItems((prev) => {
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
    setItems((prev) =>
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
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const clearCart = () => setItems([]);

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
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
