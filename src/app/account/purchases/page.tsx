"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";

type IconProps = {
  size?: number;
  className?: string;
};

function Search({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function Filter({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <path d="M3 6h18" />
      <path d="M6 12h12" />
      <path d="M10 18h4" />
    </svg>
  );
}

function Calendar({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function ChevronLeft({ className = "", size = 20 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight({ className = "", size = 20 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function MoreVertical({ size = 20, className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      width={size}
      height={size}
    >
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function Eye({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function X({ size = 20, className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      width={size}
      height={size}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

type TxnItem = {
  groupName?: string;
  quantity?: number;
  unitPrice?: number;
  selectedColor?: string;
  selectedSize?: string;
};

type Txn = {
  id: string;
  transactionId?: string;
  onlineOrderId?: string;
  total?: number;
  sellingTotal?: number;
  status?: string;
  timestamp?: string;
  paymentProvider?: string;
  paymentMethod?: string;
  items?: TxnItem[];
};

type PurchaseOrderStatus =
  | "pending"
  | "packaging"
  | "delivering"
  | "delivered"
  | "failed"
  | "cancelled";

type OnlineOrderLookup = {
  orderId?: string;
  status?: string;
  paymentStatus?: string;
  customer?: {
    uid?: string;
  };
};

function normalizePurchaseOrderStatus(
  status?: string,
  paymentStatus?: string,
): PurchaseOrderStatus {
  const combined = `${(status || "").toLowerCase()} ${(paymentStatus || "").toLowerCase()}`;

  if (/(packaging|packed|preparing)/.test(combined)) return "packaging";
  if (/(delivering|shipping|shipped|in_transit)/.test(combined)) {
    return "delivering";
  }
  if (/(delivered|fulfilled|received)/.test(combined)) return "delivered";
  if (/(fail|failed|error|declined|stock_conflict)/.test(combined)) {
    return "failed";
  }
  if (/(cancelled|canceled|void|refunded)/.test(combined)) {
    return "cancelled";
  }

  // Paid/successful payment starts the fulfillment workflow from pending.
  return "pending";
}

function getPurchaseOrderStatusLabel(status: PurchaseOrderStatus) {
  if (status === "pending") return "Pending";
  if (status === "packaging") return "Packaging";
  if (status === "delivering") return "Delivering";
  if (status === "delivered") return "Delivered";
  if (status === "failed") return "Failed";
  return "Cancelled";
}

function resolvePurchaseOrderStatus(
  row: Txn,
  orderStatusByOrderRef: Record<string, PurchaseOrderStatus>,
): PurchaseOrderStatus {
  const byOrderRef = row.onlineOrderId
    ? orderStatusByOrderRef[row.onlineOrderId]
    : undefined;

  if (byOrderRef) return byOrderRef;
  return normalizePurchaseOrderStatus(row.status);
}

function normalizePaymentStatus(
  status?: string,
): "pending" | "paid" | "failed" | "cancelled" | "unknown" {
  const raw = (status || "").toLowerCase();

  if (/(success|succeeded|paid|completed)/.test(raw)) return "paid";
  if (/(pending|processing|created|initiated)/.test(raw)) return "pending";
  if (/(fail|failed|error|declined|stock_conflict)/.test(raw)) {
    return "failed";
  }
  if (/(cancelled|canceled|void|refunded)/.test(raw)) return "cancelled";
  return "unknown";
}

function getPaymentStatusLabel(status?: string) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === "paid") return "Paid";
  if (normalized === "pending") return "Pending";
  if (normalized === "failed") return "Failed";
  if (normalized === "cancelled") return "Cancelled";

  const fallback = status || "-";
  return fallback.charAt(0).toUpperCase() + fallback.slice(1).toLowerCase();
}

function getStatusBadgeClass(status?: string) {
  const normalized = (status || "").toLowerCase();

  if (normalized === "delivered") {
    return "bg-green-100 text-green-700 border-green-200";
  }
  if (normalized === "pending") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  if (normalized === "packaging") {
    return "bg-indigo-100 text-indigo-700 border-indigo-200";
  }
  if (normalized === "delivering") {
    return "bg-sky-100 text-sky-700 border-sky-200";
  }
  if (normalized === "failed") {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (normalized === "cancelled" || normalized === "refunded") {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function getPaymentBadgeClass(status?: string) {
  const normalized = normalizePaymentStatus(status);

  if (normalized === "paid") {
    return "bg-green-100 text-green-700 border-green-200";
  }
  if (normalized === "pending") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  if (normalized === "failed") {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (normalized === "cancelled") {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function getDefaultCustomDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function PurchaseDetailsModal({
  row,
  displayStatus,
  onClose,
}: {
  row: Txn;
  displayStatus: PurchaseOrderStatus;
  onClose: () => void;
}) {
  const items = row.items || [];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-0">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col z-10">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Purchase Details
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {row.transactionId || row.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-1 gap-1 text-sm text-gray-700">
              <div>
                <span className="font-medium text-gray-900">Order Ref: </span>
                {row.onlineOrderId || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900">
                  Order Status:{" "}
                </span>
                {getPurchaseOrderStatusLabel(displayStatus)}
              </div>
              <div>
                <span className="font-medium text-gray-900">
                  Payment Status:{" "}
                </span>
                {row.status || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900">Payment: </span>
                {row.paymentProvider || row.paymentMethod || "-"}
              </div>
              <div>
                <span className="font-medium text-gray-900">Date: </span>
                {row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-900 mb-2">
              Items
            </div>
            {items.length === 0 ? (
              <div className="py-3 text-center text-sm text-gray-500 rounded-md border border-gray-200 bg-gray-50">
                No items found
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 overflow-hidden">
                {items.map((item, idx) => {
                  const details = [item.selectedColor, item.selectedSize]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <div
                      key={`${row.id}-${idx}`}
                      className="px-4 py-3 border-b border-gray-100 last:border-0 text-sm"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <div className="font-medium text-gray-900">
                            {item.groupName || "Item"}
                          </div>
                          {details ? (
                            <div className="text-gray-500 text-xs mt-0.5">
                              {details}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right text-gray-700">
                          <div>x{Number(item.quantity || 1)}</div>
                          <div className="text-xs">
                            ฿ {Number(item.unitPrice || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchaseRow({
  row,
  displayStatus,
  onViewDetails,
}: {
  row: Txn;
  displayStatus: PurchaseOrderStatus;
  onViewDetails: (row: Txn) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);

  const toggleDropdown = () => {
    if (dropdownOpen) {
      setDropdownOpen(false);
      return;
    }

    const button = actionButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 56;
    const gap = 6;

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - gap;
    }
    if (top < 8) top = 8;

    setMenuPosition({ top, left });
    setDropdownOpen(true);
  };

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-medium text-gray-900">
        {row.transactionId || row.id}
      </td>
      <td className="px-4 py-3 text-gray-700">{row.onlineOrderId || "-"}</td>
      <td className="px-4 py-3 text-gray-700">
        {Number(row.total || 0).toFixed(2)}
      </td>
      <td className="px-4 py-3 text-gray-700">
        {Number(row.sellingTotal || 0).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getPaymentBadgeClass(
            row.status,
          )}`}
        >
          {getPaymentStatusLabel(row.status)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadgeClass(
            displayStatus,
          )}`}
        >
          {getPurchaseOrderStatusLabel(displayStatus)}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">
        {row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}
      </td>
      <td className="px-4 py-3 text-right relative">
        <button
          ref={actionButtonRef}
          onClick={toggleDropdown}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
        >
          <MoreVertical size={20} />
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <div
              className="fixed w-44 bg-white border border-gray-200 shadow-lg rounded-md z-50 overflow-hidden"
              style={{
                top: menuPosition?.top ?? 8,
                left: menuPosition?.left ?? 8,
              }}
            >
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                onClick={() => {
                  setDropdownOpen(false);
                  onViewDetails(row);
                }}
              >
                <Eye size={16} /> View Details
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function PurchaseCard({
  row,
  displayStatus,
  onViewDetails,
}: {
  row: Txn;
  displayStatus: PurchaseOrderStatus;
  onViewDetails: (row: Txn) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Transaction ID</p>
          <p className="truncate text-sm font-semibold text-gray-900">
            {row.transactionId || row.id}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadgeClass(
            displayStatus,
          )}`}
        >
          {getPurchaseOrderStatusLabel(displayStatus)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Order Ref</p>
          <p className="text-gray-800">{row.onlineOrderId || "-"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Date</p>
          <p className="text-gray-800">
            {row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Payment Status</p>
          <p>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getPaymentBadgeClass(
                row.status,
              )}`}
            >
              {getPaymentStatusLabel(row.status)}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Order Status</p>
          <p>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadgeClass(
                displayStatus,
              )}`}
            >
              {getPurchaseOrderStatusLabel(displayStatus)}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total (THB)</p>
          <p className="font-medium text-gray-900">
            ฿ {Number(row.total || 0).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total (MMK)</p>
          <p className="font-medium text-gray-900">
            {Number(row.sellingTotal || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <button
        onClick={() => onViewDetails(row)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Eye size={16} /> View Details
      </button>
    </div>
  );
}

export default function PurchaseHistoryPage() {
  const defaultCustomRange = getDefaultCustomDateRange();
  const router = useRouter();
  const { user, loading } = useCustomerAuth();
  const [rows, setRows] = useState<Txn[]>([]);
  const [orderStatusByOrderRef, setOrderStatusByOrderRef] = useState<
    Record<string, PurchaseOrderStatus>
  >({});
  const [pageLoading, setPageLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | PurchaseOrderStatus>(
    "all",
  );
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<
    "all" | "paid" | "pending" | "failed" | "cancelled"
  >("all");
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState(defaultCustomRange.start);
  const [endDate, setEndDate] = useState(defaultCustomRange.end);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRow, setSelectedRow] = useState<Txn | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login?redirect=/account/purchases");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!db || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageLoading(false);
      return;
    }

    // Use full collection listener to avoid composite index requirements in dev.
    const unsubscribe = onSnapshot(
      collection(db, "transactions"),
      (snap) => {
        const items = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Txn, "id">),
          }))
          .filter((row) => {
            const customer = (row as unknown as { customer?: { uid?: string } })
              .customer;
            return customer?.uid === user.uid;
          })
          .sort((a, b) => {
            const aMs = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bMs = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return bMs - aMs;
          });

        setRows(items);
        setPageLoading(false);
      },
      () => {
        setPageLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!db || !user) return;

    const unsubscribe = onSnapshot(collection(db, "onlineOrders"), (snap) => {
      const next: Record<string, PurchaseOrderStatus> = {};

      snap.docs.forEach((docSnap) => {
        const order = docSnap.data() as OnlineOrderLookup;
        if (order.customer?.uid !== user.uid) return;

        const normalizedStatus = normalizePurchaseOrderStatus(
          order.status,
          order.paymentStatus,
        );

        next[docSnap.id] = normalizedStatus;
        if (order.orderId) {
          next[order.orderId] = normalizedStatus;
        }
      });

      setOrderStatusByOrderRef(next);
    });

    return () => unsubscribe();
  }, [user]);

  const totalSpent = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.total || 0), 0),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const searchText = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !searchText ||
        (row.transactionId || row.id).toLowerCase().includes(searchText) ||
        (row.onlineOrderId || "").toLowerCase().includes(searchText);

      const normalizedStatus = resolvePurchaseOrderStatus(
        row,
        orderStatusByOrderRef,
      );
      const matchesStatus =
        filterStatus === "all" || normalizedStatus === filterStatus;

      const normalizedPaymentStatus = normalizePaymentStatus(row.status);
      const matchesPaymentStatus =
        filterPaymentStatus === "all" ||
        normalizedPaymentStatus === filterPaymentStatus;

      let matchesDateRange = true;
      if (dateRange !== "all") {
        const now = new Date();
        let rangeStart = new Date();
        let rangeEnd = now;

        if (dateRange === "custom" && startDate && endDate) {
          rangeStart = new Date(startDate);
          rangeEnd = new Date(endDate);
          rangeEnd.setHours(23, 59, 59, 999);
        } else {
          switch (dateRange) {
            case "today":
              rangeStart = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
              );
              break;
            case "7d":
              rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case "30d":
              rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
            case "90d":
              rangeStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
              break;
          }
        }

        const referenceDate = new Date(row.timestamp || "");
        matchesDateRange =
          !Number.isNaN(referenceDate.getTime()) &&
          referenceDate >= rangeStart &&
          referenceDate <= rangeEnd;
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPaymentStatus &&
        matchesDateRange
      );
    });
  }, [
    rows,
    searchTerm,
    filterStatus,
    filterPaymentStatus,
    dateRange,
    startDate,
    endDate,
    orderStatusByOrderRef,
  ]);

  const sortedFilteredRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const aMs = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bMs = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bMs - aMs;
    });
  }, [filteredRows]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedFilteredRows.length / rowsPerPage),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const currentRows = sortedFilteredRows.slice(
    startIndex,
    startIndex + rowsPerPage,
  );

  if (loading || pageLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-gray-600">
        Loading purchase history...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <h1 className="text-2xl font-semibold text-gray-900 md:text-3xl">
        My Purchase History
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Track your online transactions and order statuses.
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
        Total Orders: <span className="font-semibold">{rows.length}</span> |
        Total Spent:
        <span className="font-semibold">฿ {totalSpent.toFixed(2)}</span>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search transaction or order ref..."
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <Filter
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(
                  e.target.value as
                    | "all"
                    | "pending"
                    | "packaging"
                    | "delivering"
                    | "delivered"
                    | "failed"
                    | "cancelled",
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="all">All Order Status</option>
              <option value="pending">Pending</option>
              <option value="packaging">Packaging</option>
              <option value="delivering">Delivering</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="relative">
            <Filter
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <select
              value={filterPaymentStatus}
              onChange={(e) =>
                setFilterPaymentStatus(
                  e.target.value as
                    | "all"
                    | "paid"
                    | "pending"
                    | "failed"
                    | "cancelled",
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="all">All Payment Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="relative">
            <Calendar
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <select
              value={dateRange}
              onChange={(e) =>
                setDateRange(
                  e.target.value as
                    | "today"
                    | "7d"
                    | "30d"
                    | "90d"
                    | "all"
                    | "custom",
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom Range</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        {dateRange === "custom" && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3 md:hidden">
        {sortedFilteredRows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
            No purchases yet.
          </div>
        ) : (
          currentRows.map((row) => (
            <PurchaseCard
              key={row.id}
              row={row}
              displayStatus={resolvePurchaseOrderStatus(
                row,
                orderStatusByOrderRef,
              )}
              onViewDetails={setSelectedRow}
            />
          ))
        )}
      </div>

      <div className="mt-6 hidden overflow-x-auto overflow-y-visible rounded-lg border border-gray-200 bg-white shadow-sm md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3">Transaction ID</th>
              <th className="px-4 py-3">Order Ref</th>
              <th className="px-4 py-3">Total (THB)</th>
              <th className="px-4 py-3">Total (MMK)</th>
              <th className="px-4 py-3">Payment Status</th>
              <th className="px-4 py-3">Order Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No purchases yet.
                </td>
              </tr>
            ) : (
              currentRows.map((row) => (
                <PurchaseRow
                  key={row.id}
                  row={row}
                  displayStatus={resolvePurchaseOrderStatus(
                    row,
                    orderStatusByOrderRef,
                  )}
                  onViewDetails={setSelectedRow}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white text-gray-900 px-2 py-1 text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span>
            Showing {sortedFilteredRows.length === 0 ? 0 : startIndex + 1}-
            {Math.min(startIndex + rowsPerPage, sortedFilteredRows.length)} of{" "}
            {sortedFilteredRows.length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm text-gray-600">
            Page {safeCurrentPage} of {totalPages}
          </span>
          <nav
            className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
            aria-label="Pagination"
          >
            <button
              title="Go to previous page"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              title="Go to next page"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={safeCurrentPage === totalPages}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </nav>
        </div>
      </div>

      <div className="mt-5">
        <Link
          href="/account/profile"
          className="text-sm font-medium text-pink-600 hover:text-pink-700"
        >
          Back to Profile
        </Link>
      </div>

      {selectedRow && (
        <PurchaseDetailsModal
          row={selectedRow}
          displayStatus={resolvePurchaseOrderStatus(
            selectedRow,
            orderStatusByOrderRef,
          )}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
