import { useState, useEffect, useCallback } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

interface Purchase {
  id: string;
  transactionId?: string;
  onlineOrderId?: string;
  total?: number;
  sellingTotal?: number;
  sellingCurrency?: string;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  timestamp?: string;
  paymentMethod?: string;
  items?: Array<{
    groupName?: string;
    quantity?: number;
    unitPrice?: number;
    selectedColor?: string;
    selectedSize?: string;
  }>;
  // Add other fields as needed
  [key: string]: any;
}

interface PurchasesData {
  transactions: Purchase[];
  orderStatuses: Record<string, any>;
  pagination: {
    hasMore: boolean;
    lastDocId: string | null;
    pageSize: number;
    total: number;
  };
}

interface UsePurchasesOptions {
  pageSize?: number;
  autoLoad?: boolean;
}

export function usePurchases(options: UsePurchasesOptions = {}) {
  const { pageSize = 20, autoLoad = true } = options;
  const { user } = useCustomerAuth();
  
  const [data, setData] = useState<PurchasesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPurchases = useCallback(async (loadMore = false) => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const idToken = await user.getIdToken();
      
      const url = new URL("/api/user/purchases", window.location.origin);
      url.searchParams.set("limit", pageSize.toString());
      
      if (loadMore && data?.pagination.lastDocId) {
        url.searchParams.set("lastDocId", data.pagination.lastDocId);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch purchases");
      }

      const newData = result.data;
      
      if (loadMore && data) {
        // Append new transactions to existing ones
        setData({
          transactions: [...data.transactions, ...newData.transactions],
          orderStatuses: { ...data.orderStatuses, ...newData.orderStatuses },
          pagination: newData.pagination,
        });
      } else {
        // Replace with new data
        setData(newData);
      }
      
      setHasMore(newData.pagination.hasMore);
    } catch (err) {
      console.error("Error fetching purchases:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch purchases");
    } finally {
      setLoading(false);
    }
  }, [user, pageSize, data]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      fetchPurchases(true);
    }
  }, [hasMore, loading, fetchPurchases]);

  const refresh = useCallback(() => {
    setData(null);
    setHasMore(true);
    fetchPurchases(false);
  }, [fetchPurchases]);

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad && user && !data) {
      fetchPurchases(false);
    }
  }, [autoLoad, user, data, fetchPurchases]);

  return {
    transactions: data?.transactions || [],
    orderStatuses: data?.orderStatuses || {},
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalLoaded: data?.transactions.length || 0,
  };
}