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
import {
  mapPromotionDoc as mapPromo,
  type OnlinePromotion,
} from "../lib/onlinePromotionDoc";

// Re-exported so existing `import type { OnlinePromotion } from
// "../hooks/useOnlinePromotions"` call sites keep working.
export type { OnlinePromotion };

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
