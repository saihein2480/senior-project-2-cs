"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";
import { usePurchases } from "../../../hooks/usePurchases";

// Import existing types and components from the original file
// (You would import these from a shared file in a real implementation)

type PurchaseOrderStatus =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "failed"
  | "cancelled"
  | "fully_returned"
  | "partially_returned";

// Simplified component with key optimizations
export default function OptimizedPurchasesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useCustomerAuth();
  
  // Use the optimized hook with pagination
  const {
    transactions,
    orderStatuses,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalLoaded,
  } = usePurchases({
    pageSize: 20, // Load 20 at a time
    autoLoad: true,
  });

  // Local state for UI
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("all");

  // Client-side filtering (only on loaded data)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((row) => {
      const searchText = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !searchText ||
        (row.transactionId || row.id).toLowerCase().includes(searchText) ||
        (row.onlineOrderId || "").toLowerCase().includes(searchText);

      // Add your existing status filtering logic here
      return matchesSearch;
    });
  }, [transactions, searchTerm]);

  // Loading states
  if (authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/auth/login?redirect=/account/purchases");
    return null;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Purchases</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={refresh}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Purchase History
        </h1>
        <p className="text-gray-600">
          View and manage your orders
          {totalLoaded > 0 && (
            <span className="ml-2 text-sm">
              ({totalLoaded} orders loaded{hasMore ? ", scroll for more" : ""})
            </span>
          )}
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by order ID..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              onClick={refresh}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        {loading && totalLoaded === 0 ? (
          // Initial loading
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-lg border p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-48"></div>
              </div>
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          // No results
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📦</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No orders found
            </h3>
            <p className="text-gray-500">
              {searchTerm ? "Try adjusting your search terms" : "You haven't made any purchases yet"}
            </p>
          </div>
        ) : (
          // Results list
          filteredTransactions.map((transaction) => (
            <TransactionCard 
              key={transaction.id} 
              transaction={transaction}
              orderStatuses={orderStatuses}
            />
          ))
        )}

        {/* Load More Button */}
        {hasMore && (
          <div className="text-center py-6">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-lg disabled:bg-gray-400 transition-colors"
            >
              {loading ? "Loading..." : "Load More Orders"}
            </button>
          </div>
        )}

        {/* End indicator */}
        {!hasMore && totalLoaded > 0 && (
          <div className="text-center py-6 text-gray-500 text-sm">
            — End of purchase history —
          </div>
        )}
      </div>
    </div>
  );
}

// Simplified transaction card component
function TransactionCard({ 
  transaction, 
  orderStatuses 
}: { 
  transaction: any; 
  orderStatuses: Record<string, any>;
}) {
  const formatDate = (timestamp?: string) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US").format(amount);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">
            Order #{transaction.transactionId || transaction.id}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(transaction.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-3 md:mt-0">
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
            {transaction.orderStatus || transaction.status || "Pending"}
          </span>
          <span className="font-semibold text-lg">
            {formatPrice(transaction.total || 0)} {transaction.sellingCurrency || "THB"}
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-medium">Payment:</span> {transaction.paymentMethod || "—"}
          {transaction.items && transaction.items.length > 0 && (
            <>
              <span className="mx-2">•</span>
              <span>{transaction.items.length} item{transaction.items.length !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>
        <div className="flex gap-2 mt-3 md:mt-0">
          <Link
            href={`/account/purchases/${transaction.id}`}
            className="px-3 py-1 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white text-sm rounded transition-colors"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}