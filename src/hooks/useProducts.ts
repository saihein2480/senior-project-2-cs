import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";

type SizeQuantity = {
  size?: string;
  quantity?: number | string;
};

type ColorVariant = {
  id?: string;
  color?: string;
  colorCode?: string;
  image?: string;
  sizeQuantities?: SizeQuantity[];
};

type FirestoreTimestampLike =
  | { toMillis?: () => number }
  | number
  | string
  | null;

type FirestoreStockDoc = {
  groupName?: string;
  name?: string;
  unitPrice?: number;
  price?: number;
  category?: string;
  description?: string;
  image?: string;
  groupImage?: string;
  colorVariants?: ColorVariant[];
  stock?: number;
  createdAt?: FirestoreTimestampLike;
  shop?: string;
  shopId?: string;
  branch?: string;
  [key: string]: unknown;
};

export type Product = {
  id: string;
  name?: string;
  price?: number;
  description?: string;
  category?: string;
  image?: string;
  groupImage?: string;
  colorVariants?: ColorVariant[];
  stock?: number;
  createdAt?: FirestoreTimestampLike;
  isNew?: boolean;
  shop?: string;
  modelInfo?: string | number;
};

const NEW_DAYS = Number(process?.env?.NEXT_PUBLIC_NEW_ITEM_DAYS) || 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getStockFromVariants(colorVariants: ColorVariant[] = []): number {
  return Array.isArray(colorVariants)
    ? colorVariants.reduce(
        (total: number, v: ColorVariant) =>
          total +
          (v.sizeQuantities || []).reduce(
            (t: number, s: SizeQuantity) => t + (Number(s.quantity) || 0),
            0,
          ),
        0,
      )
    : 0;
}

function isNewItem(createdAt: FirestoreTimestampLike): boolean {
  try {
    let createdMs = Date.now();
    if (createdAt) {
      if (
        typeof createdAt === "object" &&
        createdAt !== null &&
        "toMillis" in createdAt &&
        typeof (createdAt as { toMillis?: unknown }).toMillis === "function"
      ) {
        createdMs = (createdAt as { toMillis: () => number }).toMillis();
      } else if (typeof createdAt === "number") {
        createdMs = createdAt;
      } else {
        createdMs = new Date(String(createdAt)).getTime();
      }
    }
    return Date.now() - createdMs <= NEW_DAYS * MS_PER_DAY;
  } catch {
    return false;
  }
}

function mapStockDocToProduct(id: string, data: FirestoreStockDoc): Product {
  const colorVariants = (data.colorVariants as ColorVariant[]) || [];
  const stockFromVariants = getStockFromVariants(colorVariants);

  return {
    id,
    name: data.groupName || data.name,
    price: typeof data.unitPrice === "number" ? data.unitPrice : data.price,
    description: data.category || data.description,
    image: data.colorVariants?.[0]?.image || data.image || data.groupImage,
    groupImage: data.groupImage,
    colorVariants,
    stock: data.stock || stockFromVariants || 0,
    shop:
      data.shop?.toString() ||
      data.shopId?.toString() ||
      data.branch?.toString() ||
      "",
    createdAt: data.createdAt || null,
    isNew: isNewItem(data.createdAt || null),
  };
}

/**
 * Fetch all products from Firestore with caching
 * Cache duration: 3 minutes (product data should be relatively fresh)
 */
export function useProducts() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, "stocks"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) =>
        mapStockDocToProduct(d.id, d.data() as FirestoreStockDoc),
      );
      queryClient.setQueryData(["products"], items);
    });

    return () => unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      if (!db) {
        throw new Error("Firebase not configured");
      }

      const q = query(collection(db, "stocks"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      return snap.docs.map((d) =>
        mapStockDocToProduct(d.id, d.data() as FirestoreStockDoc),
      );
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
}

/**
 * Fetch a single product by ID
 * Cache duration: 5 minutes
 */
export function useProduct(id: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!db || !id) return;

    const docRef = doc(db, "stocks", id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists()) {
        queryClient.setQueryData(["product", id], null);
        return;
      }

      const product = mapStockDocToProduct(
        docSnap.id,
        docSnap.data() as FirestoreStockDoc,
      );
      queryClient.setQueryData(["product", id], product);
    });

    return () => unsubscribe();
  }, [id, queryClient]);

  return useQuery({
    queryKey: ["product", id],
    queryFn: async (): Promise<Product | null> => {
      if (!db || !id) {
        return null;
      }

      const docRef = doc(db, "stocks", id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return mapStockDocToProduct(
        docSnap.id,
        docSnap.data() as FirestoreStockDoc,
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!id, // Only run query if ID is provided
  });
}
