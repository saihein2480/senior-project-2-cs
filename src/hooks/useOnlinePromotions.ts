import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export type OnlinePromotion = {
  id: string;
  name: string;
  description?: string;
  scope: "group" | "variant";
  productId: string;
  productName?: string;
  variantId?: string;
  variantName?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountTHB?: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeDate(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (
    typeof input === "object" &&
    input !== null &&
    "toDate" in (input as Record<string, unknown>)
  ) {
    try {
      return (input as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

function mapPromo(id: string, data: Record<string, unknown>): OnlinePromotion {
  return {
    id,
    name: String(data.name || ""),
    description: String(data.description || ""),
    scope: data.scope === "variant" ? "variant" : "group",
    productId: String(data.productId || ""),
    productName: String(data.productName || ""),
    variantId: String(data.variantId || ""),
    variantName: String(data.variantName || ""),
    discountType: data.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: Number(data.discountValue || 0),
    maxDiscountTHB: Number(data.maxDiscountTHB || 0),
    startDate: String(data.startDate || ""),
    endDate: String(data.endDate || ""),
    isActive: Boolean(data.isActive),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  };
}

export function useOnlinePromotions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!db) return;

    const q = query(
      collection(db, "online_promotions"),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) =>
        mapPromo(d.id, d.data() as Record<string, unknown>),
      );
      queryClient.setQueryData(["online-promotions"], rows);
    });

    return () => unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: ["online-promotions"],
    queryFn: async (): Promise<OnlinePromotion[]> => {
      if (!db) return [];

      const q = query(
        collection(db, "online_promotions"),
        orderBy("updatedAt", "desc"),
      );
      const snap = await getDocs(q);

      return snap.docs.map((d) =>
        mapPromo(d.id, d.data() as Record<string, unknown>),
      );
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
