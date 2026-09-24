"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";
import {
  MAX_PHOTO_DATA_URL_BYTES,
  MAX_QR_DATA_URL_BYTES,
  fileToCompressedDataUrl,
} from "../../../lib/imageCompression";
// Shared with the Telegram bot so both describe an order's state identically.
import {
  getPaymentStatusLabel,
  getPurchaseOrderStatusLabel,
  normalizePaymentStatus,
  normalizePurchaseOrderStatus,
  type PurchaseOrderStatus,
} from "../../../lib/orderLabels";

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

function XCircle({ size = 20, className = "" }: IconProps) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function RotateCcw({ size = 20, className = "" }: IconProps) {
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
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function DollarSign({ size = 16, className = "" }: IconProps) {
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
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
  sellingCurrency?: string;
  exchangeRate?: number;
  amountMmk?: number;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  timestamp?: string;
  paymentProvider?: string;
  paymentMethod?: string;
  items?: TxnItem[];
  deliveryStatus?: string;
  // Financial breakdown
  subtotal?: number;
  tax?: number;
  taxRate?: number; // Percentage applied at purchase time (e.g. 7 for 7%)
  discount?: number;
  // Coupon fields
  couponCode?: string;
  appliedCouponCode?: string;
  couponId?: string;
  couponDiscountTHB?: number;
  cancellationRequest?: {
    status: string;
    reason?: string;
    requestedAt?: string;
    approvedAt?: string;
    rejectedAt?: string;
    rejectionReason?: string;
  };
  refundRequest?: {
    status: string;
    type?: string; // "return" or "refund"
    reason?: string;
    items?: Array<{ id: string; quantity: number; groupName?: string }>;
    requestedAt?: string;
    approvedAt?: string;
    rejectedAt?: string;
    rejectionReason?: string;
    returnReceived?: boolean; // Added
    inspectionCompleted?: boolean; // Added
    itemInspectionResults?: Array<{ itemIndex: number; status: string }>; // Added
  };
  refunds?: Array<{
    refundId: string;
    status: string;
    amount: number; // Added
    totalAmount: number;
    items?: Array<{
      itemIndex: number;
      quantity: number;
    }>;
    reason?: string;
    notes?: string; // Added
    createdAt?: { toDate: () => Date };
    confirmedAt?: { toDate: () => Date }; // Added
    refundMethod?: string;
    refundedAt?: { toDate: () => Date };
    refundedBy?: string;
    processedBy?: string; // Added
    refundNotes?: string;
    refundProofUrl?: string;
  }>;
  cancellationRefund?: {
    amount: number;
    status: string;
    method?: string;
    confirmedAt?: { toDate: () => Date };
    processedBy?: string; // Added
    notes?: string;
  };
  cancelledAt?: { toDate: () => Date };
  /** Written by the POS cancellation paths alongside `cancelledAt`. */
  cancelReason?: string;
  customerUid?: string;
};

type OnlineOrderLookup = {
  orderId?: string;
  status?: string;
  paymentStatus?: string;
  customer?: {
    uid?: string;
  };
};

function resolvePurchaseOrderStatus(
  row: Txn,
  orderStatusByOrderRef: Record<string, PurchaseOrderStatus>,
): PurchaseOrderStatus {
  // A cancelled order outranks every other signal. This has to be checked
  // before `orderStatus` because the POS paid-cancellation path used to leave
  // `orderStatus` on its previous value, and because confirming the refund
  // overwrites `status` with "refunded" — so `cancelledAt` / `cancelReason` /
  // `cancellationRefund` are the only durable evidence that the order was
  // cancelled. Only the cancellation paths ever write these fields.
  if (
    row.cancelledAt ||
    row.cancelReason ||
    row.cancellationRefund ||
    (row.status || "").toLowerCase() === "cancelled"
  ) {
    return "cancelled";
  }

  // Next, check if the transaction has an explicit orderStatus field
  if ((row as any).orderStatus) {
    const orderStatus = (row as any).orderStatus.toLowerCase();
    if (orderStatus === "pending") return "pending";
    if (orderStatus === "packaging") return "packaging";
    if (orderStatus === "delivering") return "delivering";
    if (orderStatus === "delivered") return "delivered";
    if (orderStatus === "failed") return "failed";
    if (orderStatus === "fully_returned") return "fully_returned";
    if (orderStatus === "partially_returned") return "partially_returned";
    if (orderStatus === "cancelled") return "cancelled";
  }

  // Second, check orderStatusByOrderRef (from onlineOrders collection)
  const byOrderRef = row.onlineOrderId
    ? orderStatusByOrderRef[row.onlineOrderId]
    : undefined;

  if (byOrderRef) return byOrderRef;
  
  // Finally, fall back to normalizing from payment status
  return normalizePurchaseOrderStatus(row.status);
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
  if (normalized === "cancelled") {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }
  if (normalized === "fully_returned") {
    return "bg-purple-100 text-purple-700 border-purple-200";
  }
  if (normalized === "partially_returned") {
    return "bg-violet-100 text-violet-700 border-violet-200";
  }
  if (normalized === "refunded") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function getPaymentBadgeClass(status?: string) {
  const normalized = normalizePaymentStatus(status);

  if (normalized === "paid") {
    return "bg-green-100 text-green-700 border-green-200";
  }
  if (normalized === "pending_refund") {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }
  if (normalized === "refund_rejected") {
    return "bg-red-100 text-red-700 border-red-200";
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
  if (normalized === "refunded") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }
  if (normalized === "partially_refunded") {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

/** Trim floating point noise so labels read "7%" instead of "7.000000001%". */
function formatRatePercent(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  return String(rounded);
}

/**
 * Rebuild the money breakdown for a transaction.
 *
 * Every figure is taken from what was stored at purchase time so the receipt
 * always matches what the customer actually paid. `discount` holds promotion
 * savings only; coupon savings live in `couponDiscountTHB`.
 */
function getOrderSummary(row: Txn) {
  const itemsSubtotal = (row.items || []).reduce(
    (sum, item) =>
      sum + Number(item.unitPrice || 0) * Number(item.quantity || 1),
    0,
  );

  const storedSubtotal = Number(row.subtotal || 0);
  const subtotal = storedSubtotal > 0 ? storedSubtotal : itemsSubtotal;

  const promotionDiscount = Math.max(0, Number(row.discount || 0));
  const couponDiscount = Math.max(0, Number(row.couponDiscountTHB || 0));
  const taxableBase = Math.max(0, subtotal - promotionDiscount - couponDiscount);

  const tax = Math.max(0, Number(row.tax || 0));

  // Prefer the rate stored with the order. Older records predate that field,
  // so fall back to deriving it from the amounts we do have.
  const storedRate = Number(row.taxRate || 0);
  const taxPercent =
    storedRate > 0
      ? storedRate
      : taxableBase > 0 && tax > 0
        ? (tax / taxableBase) * 100
        : 0;

  const total = Number(row.total || 0) || taxableBase + tax;

  return {
    subtotal,
    promotionDiscount,
    couponDiscount,
    taxableBase,
    tax,
    taxPercent,
    total,
  };
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

/**
 * The normal fulfilment path, in order. Exception states (cancelled, failed,
 * returned) are not steps on this path — they are reported separately below.
 */
const FULFILMENT_STEPS: Array<{
  status: PurchaseOrderStatus;
  label: string;
  /** Icon path drawn inside a 24x24 viewBox. */
  path: string;
}> = [
  {
    status: "pending",
    label: "Placed",
    path: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z",
  },
  {
    status: "packaging",
    label: "Packing",
    path: "M20 7 12 3 4 7m16 0v10l-8 4m8-14-8 4m0 0L4 7m8 4v10M4 7v10l8 4",
  },
  {
    status: "delivering",
    label: "On the way",
    path: "M3 16V6h11v10M14 9h4l3 3v4h-7M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  },
  {
    status: "delivered",
    label: "Delivered",
    path: "M5 13l4 4L19 7",
  },
];

/** Statuses that end the order rather than advance it. */
const EXCEPTION_NOTES: Partial<
  Record<PurchaseOrderStatus, { tone: string; title: string; detail: string }>
> = {
  cancelled: {
    tone: "border-gray-200 bg-gray-50 text-gray-700",
    title: "Order cancelled",
    detail: "This order was cancelled and will not be delivered.",
  },
  failed: {
    tone: "border-red-200 bg-red-50 text-red-700",
    title: "Order failed",
    detail: "Something went wrong with this order. Please contact the store.",
  },
  fully_returned: {
    tone: "border-purple-200 bg-purple-50 text-purple-700",
    title: "Fully returned",
    detail: "All items from this order were returned.",
  },
  partially_returned: {
    tone: "border-violet-200 bg-violet-50 text-violet-700",
    title: "Partially returned",
    detail: "Some items from this order were returned.",
  },
};

/**
 * Visual progress of an order through fulfilment.
 *
 * Reads far quicker than a status word, and makes it obvious what happens next.
 * Returned orders still show the completed path, because they were delivered
 * before being sent back; cancelled and failed orders never travelled it, so
 * they get the note on its own.
 */
function OrderStatusTracker({ status }: { status: PurchaseOrderStatus }) {
  const exception = EXCEPTION_NOTES[status];
  const wasDelivered =
    status === "fully_returned" || status === "partially_returned";
  const showPath = !exception || wasDelivered;

  // Returned orders completed the whole path; otherwise position on it.
  const activeIndex = wasDelivered
    ? FULFILMENT_STEPS.length - 1
    : FULFILMENT_STEPS.findIndex((step) => step.status === status);

  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-rose-500 to-pink-500" />
        <span className="text-sm font-bold text-gray-900">Order Status</span>
        <span
          className={`ml-auto inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusBadgeClass(
            status,
          )}`}
        >
          {getPurchaseOrderStatusLabel(status)}
        </span>
      </div>

      {showPath && (
        <ol className="mt-4 flex items-start" aria-label="Order progress">
          {FULFILMENT_STEPS.map((step, index) => {
            const isDone = index <= activeIndex;
            const isCurrent = index === activeIndex && !wasDelivered;
            const isLast = index === FULFILMENT_STEPS.length - 1;

            return (
              <li
                key={step.status}
                className="flex flex-1 flex-col items-center text-center"
              >
                <div className="flex w-full items-center">
                  {/* Leading connector, hidden on the first step so the row
                      stays visually centred. */}
                  <span
                    className={`h-0.5 flex-1 ${
                      index === 0
                        ? "bg-transparent"
                        : isDone
                          ? "bg-rose-400"
                          : "bg-gray-200"
                    }`}
                  />
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isDone
                        ? "border-transparent bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-300"
                    } ${isCurrent ? "ring-4 ring-rose-100" : ""}`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={step.path}
                      />
                    </svg>
                  </span>
                  <span
                    className={`h-0.5 flex-1 ${
                      isLast
                        ? "bg-transparent"
                        : index < activeIndex
                          ? "bg-rose-400"
                          : "bg-gray-200"
                    }`}
                  />
                </div>
                <span
                  className={`mt-2 text-[10px] leading-tight sm:text-[11px] ${
                    isDone ? "font-semibold text-gray-900" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {exception && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2.5 text-left ${exception.tone}`}
        >
          <p className="text-xs font-bold">{exception.title}</p>
          <p className="mt-0.5 text-[11px] opacity-90">{exception.detail}</p>
        </div>
      )}
    </div>
  );
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
  const cancelRequest = row.cancellationRequest;
  const refundRequest = row.refundRequest;
  const summary = getOrderSummary(row);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-0">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-rose-100 w-full max-w-lg max-h-[85vh] flex flex-col z-10 overflow-hidden">
        <div className="bg-white border-b border-rose-100 px-6 py-5 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                <svg
                  className="h-5 w-5 text-rose-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"
                  />
                </svg>
              </span>
              <h2 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                Purchase Details
              </h2>
            </div>
            <p className="mt-2 truncate text-[11px] font-medium text-gray-400">
              {row.transactionId || row.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-full text-gray-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4 bg-gradient-to-b from-rose-50/40 via-white to-white">
          {/* Cancellation Request Status */}
          {cancelRequest && (
            <div className={`rounded-2xl border p-4 shadow-sm ${
              cancelRequest.status === "pending"
                ? "border-amber-200 bg-amber-50"
                : cancelRequest.status === "approved"
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {cancelRequest.status === "pending"
                      ? "⏳ Cancellation Request Pending"
                      : cancelRequest.status === "approved"
                      ? "✅ Cancellation Approved"
                      : "❌ Cancellation Rejected"}
                  </p>
                  {cancelRequest.reason && (
                    <p className="text-xs mt-1 text-gray-700">
                      Your reason: {cancelRequest.reason}
                    </p>
                  )}
                  {cancelRequest.rejectionReason && (
                    <p className="text-xs mt-1 text-red-700">
                      Rejection reason: {cancelRequest.rejectionReason}
                    </p>
                  )}
                  <p className="text-xs mt-1 text-gray-600">
                    Requested: {cancelRequest.requestedAt ? new Date(cancelRequest.requestedAt).toLocaleString() : "-"}
                  </p>
                  {(cancelRequest.approvedAt || cancelRequest.rejectedAt) && (
                    <p className="text-xs text-gray-600">
                      {cancelRequest.status === "approved" ? "Approved" : "Rejected"}: {
                        (cancelRequest.approvedAt || cancelRequest.rejectedAt)
                          ? new Date(cancelRequest.approvedAt || cancelRequest.rejectedAt || "").toLocaleString()
                          : "-"
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Refund/Return Request Status */}
          {refundRequest && (
            <div className={`rounded-2xl border p-4 shadow-sm ${
              refundRequest.status === "pending"
                ? "border-rose-200 bg-rose-50"
                : refundRequest.status === "approved"
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  {/* Status Title */}
                  <p className="font-medium text-sm">
                    {refundRequest.status === "pending"
                      ? (refundRequest.type === "return" ? "⏳ Return Request Pending" : "⏳ Refund Request Pending")
                      : refundRequest.status === "approved"
                      ? (refundRequest.type === "return" ? "✅ Return Approved" : "✅ Refund Approved")
                      : (refundRequest.type === "return" ? "❌ Return Rejected" : "❌ Refund Rejected")}
                  </p>
                  
                  {/* Return Journey Progress (only for return type) */}
                  {refundRequest.type === "return" && refundRequest.status === "approved" && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-700 mb-2">Return Journey:</p>
                      <div className="space-y-1.5">
                        {/* Step 1: Approved */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white font-medium">✓</span>
                          <span className="text-gray-700">Request Approved</span>
                        </div>
                        
                        {/* Step 2: Return Items */}
                        <div className="flex items-center gap-2 text-xs">
                          {refundRequest.returnReceived ? (
                            <>
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white font-medium">✓</span>
                              <span className="text-gray-700">Items Returned to Store</span>
                            </>
                          ) : (
                            <>
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white font-medium">→</span>
                              <span className="text-rose-700 font-medium">Please Return Items to Store</span>
                            </>
                          )}
                        </div>
                        
                        {/* Step 3: Inspection */}
                        {refundRequest.returnReceived && (
                          <div className="flex items-center gap-2 text-xs">
                            {refundRequest.inspectionCompleted ? (
                              <>
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white font-medium">✓</span>
                                <span className="text-gray-700">Items Inspected</span>
                              </>
                            ) : (
                              <>
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white font-medium">⏳</span>
                                <span className="text-amber-700 font-medium">Inspection in Progress</span>
                              </>
                            )}
                          </div>
                        )}
                        
                        {/* Step 4: Refund Processing */}
                        {refundRequest.inspectionCompleted && (
                          <div className="flex items-center gap-2 text-xs">
                            {row.refunds && row.refunds.length > 0 ? (
                              <>
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white font-medium">✓</span>
                                <span className="text-gray-700">Refund Processed</span>
                              </>
                            ) : (
                              <>
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white font-medium">⏳</span>
                                <span className="text-amber-700 font-medium">Processing Refund Payment</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Inspection Results Display */}
                      {refundRequest.inspectionCompleted && refundRequest.itemInspectionResults && (
                        <div className="mt-3 p-2.5 bg-white/60 rounded-xl border border-green-200">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Inspection Results:</p>
                          <div className="space-y-1">
                            {refundRequest.itemInspectionResults.map((result: any, idx: number) => {
                              const item = row.items?.[result.itemIndex];
                              return (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                  {result.status === "accepted" ? (
                                    <span className="text-green-600">✓ Accepted:</span>
                                  ) : (
                                    <span className="text-red-600">⚠ Damaged:</span>
                                  )}
                                  <span className="text-gray-700">{item?.groupName || "Item"}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Action Prompt */}
                      {!refundRequest.returnReceived && (
                        <div className="mt-3 p-2.5 bg-rose-100 rounded-xl border border-rose-200">
                          <p className="text-xs text-rose-900 font-medium">
                            📍 Please visit our store to return the items for inspection and refund processing.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Cancellation Type Info */}
                  {refundRequest.type === "cancellation" && refundRequest.status === "approved" && (
                    <div className="mt-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                      <p className="text-xs text-amber-800">
                        💰 Your cancellation refund is being processed. Check refund details below.
                      </p>
                    </div>
                  )}
                  
                  {refundRequest.reason && (
                    <p className="text-xs mt-1 text-gray-700">
                      Your reason: {refundRequest.reason}
                    </p>
                  )}
                  {refundRequest.items && refundRequest.items.length > 0 && (
                    <p className="text-xs mt-1 text-gray-700">
                      Items: {refundRequest.items.map((item: any) => 
                        `${item.groupName || item.id} (${item.quantity})`
                      ).join(", ")}
                    </p>
                  )}
                  {refundRequest.rejectionReason && (
                    <p className="text-xs mt-1 text-red-700">
                      Rejection reason: {refundRequest.rejectionReason}
                    </p>
                  )}
                  <p className="text-xs mt-1 text-gray-600">
                    Requested: {refundRequest.requestedAt ? new Date(refundRequest.requestedAt).toLocaleString() : "-"}
                  </p>
                  {(refundRequest.approvedAt || refundRequest.rejectedAt) && (
                    <p className="text-xs text-gray-600">
                      {refundRequest.status === "approved" ? "Approved" : "Rejected"}: {
                        (refundRequest.approvedAt || refundRequest.rejectedAt)
                          ? new Date(refundRequest.approvedAt || refundRequest.rejectedAt || "").toLocaleString()
                          : "-"
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Show refund details from transaction.refunds array */}
          {row.refunds && row.refunds.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Refund Details</h3>
              {row.refunds.map((refund: any, index: number) => {
                const isPaidOrder = row.paymentMethod === "cash" || row.paymentMethod === "scan";
                const isRefundPending = refund.status === "pending";
                const isRefundCompleted = refund.status === "completed";
                
                return (
                  <div 
                    key={index}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      isRefundPending 
                        ? "border-amber-200 bg-amber-50"
                        : isRefundCompleted
                        ? "border-green-200 bg-green-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm mb-1">
                          {isRefundPending && isPaidOrder && "💰 Refund Approved - Payment Pending"}
                          {isRefundPending && !isPaidOrder && "⏳ Refund Processing"}
                          {isRefundCompleted && "✅ Refund Completed"}
                          {!isRefundPending && !isRefundCompleted && "❌ Refund Failed"}
                        </p>
                        
                        <p className="text-xs text-gray-700">
                          Refund ID: {refund.refundId}
                        </p>
                        
                        <p className="text-xs text-gray-700 mt-1">
                          Amount: {row.sellingTotal ? 
                            `${row.sellingCurrency === "MMK" ? "Ks" : row.sellingCurrency || "THB"} ${(refund.totalAmount * (row.exchangeRate || 1)).toLocaleString()}` :
                            `THB ${refund.totalAmount.toFixed(2)}`
                          }
                        </p>
                        
                        {refund.items && refund.items.length > 0 && (
                          <div className="mt-2 text-xs text-gray-700">
                            <p className="font-medium">Refunded Items:</p>
                            <ul className="list-disc list-inside ml-2 mt-1">
                              {refund.items.map((item: any, idx: number) => {
                                const originalItem = row.items?.[item.itemIndex];
                                return (
                                  <li key={idx}>
                                    {originalItem?.groupName || `Item ${item.itemIndex + 1}`} × {item.quantity}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                        
                        {refund.reason && (
                          <p className="text-xs mt-2 text-gray-600">
                            Reason: {refund.reason}
                          </p>
                        )}
                        
                        <p className="text-xs mt-1 text-gray-600">
                          Processed: {refund.createdAt ? new Date(refund.createdAt.toDate()).toLocaleString() : "-"}
                        </p>
                        
                        {/* Payment status for paid orders */}
                        {isPaidOrder && isRefundCompleted && refund.refundedAt && (
                          <div className="mt-2 pt-2 border-t border-green-200">
                            <p className="text-xs font-medium text-green-800">Payment Completed</p>
                            <p className="text-xs text-green-700 mt-1">
                              Method: {
                                refund.refundMethod === "cash" ? "💵 Cash" :
                                refund.refundMethod === "original_payment" ? `💳 ${row.paymentMethod?.toUpperCase()}` :
                                refund.refundMethod === "bank_transfer" ? "🏦 Bank Transfer" :
                                "Payment Method"
                              }
                            </p>
                            <p className="text-xs text-green-700">
                              Confirmed: {new Date(refund.refundedAt.toDate()).toLocaleString()}
                            </p>
                            {refund.refundNotes && (
                              <p className="text-xs text-green-700 mt-1">
                                Note: {refund.refundNotes}
                              </p>
                            )}
                          </div>
                        )}
                        
                        {/* Pending payment notice for paid orders */}
                        {isPaidOrder && isRefundPending && (
                          <div className="mt-2 pt-2 border-t border-amber-200">
                            <p className="text-xs font-medium text-amber-800">⚠️ Payment Pending</p>
                            <p className="text-xs text-amber-700 mt-1">
                              The store will process your refund payment soon.
                            </p>
                            {row.paymentMethod === "cash" && (
                              <p className="text-xs text-amber-700 mt-1">
                                💵 Please visit the store with your receipt to collect your refund.
                              </p>
                            )}
                            {row.paymentMethod === "scan" && (
                              <p className="text-xs text-amber-700 mt-1">
                                💳 Refund will be processed back to your original payment method within 3-5 business days.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show cancellation refund status for cancelled paid orders */}
          {row.status === "cancelled" && row.cancellationRefund && (
            <div className={`rounded-2xl border p-4 shadow-sm ${
              row.cancellationRefund.status === "pending"
                ? "border-amber-200 bg-amber-50"
                : row.cancellationRefund.status === "completed"
                ? "border-green-200 bg-green-50"
                : "border-gray-200 bg-gray-50"
            }`}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm mb-1">
                    {row.cancellationRefund.status === "pending" && "💰 Cancellation Refund - Payment Pending"}
                    {row.cancellationRefund.status === "completed" && "✅ Cancellation Refund Completed"}
                  </p>
                  
                  <p className="text-xs text-gray-700 mt-1">
                    Refund Amount: {row.sellingTotal ? 
                      `${row.sellingCurrency === "MMK" ? "Ks" : row.sellingCurrency || "THB"} ${(row.cancellationRefund.amount * (row.exchangeRate || 1)).toLocaleString()}` :
                      `THB ${row.cancellationRefund.amount.toFixed(2)}`
                    }
                  </p>
                  
                  <p className="text-xs text-gray-600 mt-1">
                    Cancelled: {row.cancelledAt ? new Date(row.cancelledAt.toDate()).toLocaleString() : "-"}
                  </p>
                  
                  {row.cancellationRefund.status === "completed" && row.cancellationRefund.confirmedAt && (
                    <div className="mt-2 pt-2 border-t border-green-200">
                      <p className="text-xs font-medium text-green-800">Payment Completed</p>
                      <p className="text-xs text-green-700 mt-1">
                        Method: {
                          row.cancellationRefund.method === "cash" ? "💵 Cash" :
                          row.cancellationRefund.method === "original_payment" ? `💳 ${row.paymentMethod?.toUpperCase()}` :
                          row.cancellationRefund.method === "bank_transfer" ? "🏦 Bank Transfer" :
                          "Payment Method"
                        }
                      </p>
                      <p className="text-xs text-green-700">
                        Confirmed: {new Date(row.cancellationRefund.confirmedAt.toDate()).toLocaleString()}
                      </p>
                      {row.cancellationRefund.notes && (
                        <p className="text-xs text-green-700 mt-1">
                          Note: {row.cancellationRefund.notes}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {row.cancellationRefund.status === "pending" && (
                    <div className="mt-2 pt-2 border-t border-amber-200">
                      <p className="text-xs font-medium text-amber-800">⚠️ Payment Pending</p>
                      <p className="text-xs text-amber-700 mt-1">
                        The store will process your refund payment soon.
                      </p>
                      {row.paymentMethod === "cash" && (
                        <p className="text-xs text-amber-700 mt-1">
                          💵 Please visit the store with your receipt to collect your refund.
                        </p>
                      )}
                      {row.paymentMethod === "scan" && (
                        <p className="text-xs text-amber-700 mt-1">
                          💳 Refund will be processed back to your original payment method within 3-5 business days.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fulfilment progress. Replaces the old plain-text Order Status row
              below, which is why that row is no longer in the grid. */}
          <OrderStatusTracker status={displayStatus} />

          <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Order Ref
                </span>
                <span className="text-right font-medium text-gray-800">
                  {row.onlineOrderId || "-"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Payment Status
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getPaymentBadgeClass(
                    row.status,
                  )}`}
                >
                  {getPaymentStatusLabel(row.status, row.paymentStatus)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Payment Method
                </span>
                <span className="text-right font-medium text-gray-800">
                {row.paymentMethod === "cash" ? "💵 Cash" : 
                 row.paymentMethod === "scan" ? "📱 QR Scan" :
                 row.paymentMethod === "wallet" ? "📱 QR Scan" :
                 row.paymentMethod === "cod" ? "🚚 Cash on Delivery" :
                 row.paymentProvider || row.paymentMethod || "-"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Date
                </span>
                <span className="text-right font-medium text-gray-800">
                  {row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}
                </span>
              </div>
              {/* Applied Coupon Information */}
              {(row.couponCode || row.appliedCouponCode) && (
                <div className="pt-3 border-t border-rose-100">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Applied Coupon
                  </span>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="inline-block px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-bold">
                      {row.couponCode || row.appliedCouponCode}
                    </span>
                    {(row.couponDiscountTHB || row.discount) && (
                      <span className="text-sm font-semibold text-purple-700">
                        Discount: -฿{Number(row.couponDiscountTHB || row.discount || 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-rose-500 to-pink-500" />
              <span className="text-sm font-bold text-gray-900">Items</span>
              {items.length > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                  {items.length}
                </span>
              )}
            </div>
            {items.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-500 rounded-2xl border border-rose-100 bg-rose-50/40">
                No items found
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-100 bg-white shadow-sm overflow-hidden">
                {items.map((item, idx) => {
                  const details = [item.selectedColor, item.selectedSize]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <div
                      key={`${row.id}-${idx}`}
                      className="px-4 py-3 border-b border-rose-50 last:border-0 text-sm transition-colors hover:bg-rose-50/40"
                    >
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900">
                            {item.groupName || "Item"}
                          </div>
                          {details ? (
                            <div className="mt-1 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                              {details}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-medium text-gray-400">
                            x{Number(item.quantity || 1)}
                          </div>
                          <div className="text-sm font-bold text-rose-600">
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

          {/* Invoice Summary */}
          <div className="rounded-2xl border border-rose-100 bg-white shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-rose-50 to-pink-50 px-4 py-2.5 border-b border-rose-100">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-rose-600">
                Order Summary
              </h3>
            </div>
            <div className="px-4 py-3.5 space-y-2.5 text-sm">
              {/* Subtotal */}
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">
                  ฿ {summary.subtotal.toFixed(2)}
                </span>
              </div>

              {/* Promotion Discount */}
              {summary.promotionDiscount > 0 && (
                <div className="flex justify-between items-center text-emerald-700">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Promotion Discount
                  </span>
                  <span className="font-medium">
                    -฿ {summary.promotionDiscount.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Coupon Discount */}
              {summary.couponDiscount > 0 && (
                <div className="flex justify-between items-center text-purple-700">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    Coupon Discount
                    <span className="inline-block ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-bold">
                      {row.couponCode || row.appliedCouponCode}
                    </span>
                  </span>
                  <span className="font-medium">
                    -฿ {summary.couponDiscount.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Tax - always shown so the breakdown adds up, even at 0% */}
              <div className="flex justify-between items-center">
                <span className="text-gray-600">
                  Tax ({formatRatePercent(summary.taxPercent)}%)
                </span>
                <span className="font-medium text-gray-900">
                  ฿ {summary.tax.toFixed(2)}
                </span>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center pt-2.5 border-t border-dashed border-rose-200">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                  ฿ {summary.total.toFixed(2)}
                </span>
              </div>

              {/* MMK Total if available */}
              {(row.amountMmk || row.sellingTotal) && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Total (MMK)</span>
                  <span className="font-semibold text-gray-900">
                    Ks {Number(row.amountMmk || row.sellingTotal || 0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-rose-100 bg-white">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelRequestModal({
  row,
  onClose,
  onSubmit,
}: {
  row: Txn;
  onClose: () => void;
  onSubmit: (reason: string, qrCodeImage?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [qrCodeImage, setQrCodeImage] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Check if this is a paid order (Cash or Scan)
  const isPaidOrder = row.paymentMethod === "cash" || row.paymentMethod === "scan";
  const isScanPayment = row.paymentMethod === "scan";
  const isCOD = row.paymentMethod === "cod";
  
  // Calculate refund amount - always use the original THB amount (row.total), not the converted selling amount
  const refundAmount = row.total || 0;
  const refundCurrency = "THB"; // Refunds are always in original currency (THB)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5MB");
      return;
    }

    setUploading(true);

    try {
      // Downscale before encoding. A raw phone photo as base64 exceeds
      // Firestore's ~1MiB field cap and the write fails with
      // "Property cancellationRequest contains an invalid nested entity".
      const compressed = await fileToCompressedDataUrl(file, {
        maxBytes: MAX_QR_DATA_URL_BYTES,
      });
      setQrCodeImage(compressed);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert(
        error instanceof Error ? error.message : "Failed to upload image",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    // Require QR code for Scan payments
    if (isScanPayment && !qrCodeImage) {
      alert("Please upload your payment QR code or account screenshot");
      return;
    }

    setSubmitting(true);
    await onSubmit(reason, qrCodeImage);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-rose-100 w-full max-w-lg max-h-[90vh] flex flex-col z-10 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-white border-b border-rose-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                  <XCircle className="h-5 w-5 text-rose-500" />
                </span>
                <h2 className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                  {isPaidOrder ? "Cancellation & Refund Request" : "Cancel Order"}
                </h2>
              </div>
              <p className="mt-2 truncate text-[11px] font-medium text-gray-400">
                Order #{row.transactionId || row.id}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-2 rounded-full text-gray-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 bg-gradient-to-b from-rose-50/40 via-white to-white">
          {/* QR Code Upload for Scan Payments */}
          {isScanPayment && (
            <div className="rounded-2xl border border-rose-100 bg-white p-5 space-y-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                  <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </span>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-sm mb-1">
                    Payment Account Required
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Upload your payment QR code or account screenshot for refund processing
                  </p>
                </div>
              </div>

              <div>
                {!qrCodeImage ? (
                  <div className="border-2 border-dashed border-rose-200 rounded-2xl p-6 text-center bg-rose-50/40 hover:bg-rose-50 hover:border-rose-300 transition-all cursor-pointer group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="cancel-qr-upload"
                      disabled={uploading}
                    />
                    <label
                      htmlFor="cancel-qr-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <div className="p-3 bg-rose-100 rounded-full mb-3 group-hover:bg-rose-200 transition-colors">
                        <svg
                          className="w-8 h-8 text-rose-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <span className="text-sm text-rose-600 font-semibold mb-1">
                        {uploading ? "Uploading..." : "Click to upload screenshot"}
                      </span>
                      <span className="text-xs text-gray-400">
                        PNG or JPG • Max 5MB
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="relative border border-rose-100 rounded-2xl p-3 bg-white">
                    <img
                      src={qrCodeImage}
                      alt="Payment QR Code"
                      className="w-full h-48 object-contain rounded-xl"
                    />
                    <button
                      onClick={() => setQrCodeImage("")}
                      className="absolute -top-2 -right-2 p-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-full shadow-lg transition-all"
                      type="button"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Refund Summary for Paid Orders */}
          {isPaidOrder && (
            <div className="rounded-2xl border border-rose-100 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 bg-gradient-to-r from-rose-50 to-pink-50 px-4 py-2.5 border-b border-rose-100">
                <DollarSign size={14} className="text-rose-500" />
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-rose-600">
                  Refund Summary
                </h3>
              </div>
              <div className="space-y-2.5 px-4 py-3.5">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Payment Method
                  </span>
                  <span className="text-sm font-medium text-gray-800 capitalize">
                    {row.paymentMethod === "cash" ? "💵 Cash" : "📱 Scan"}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3 pt-2.5 border-t border-dashed border-rose-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Refund Amount
                  </span>
                  <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                    {refundCurrency} {refundAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Important Information */}
          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div className="flex-1">
                <h3 className="font-bold text-sm mb-2 text-gray-900">
                  What happens next?
                </h3>
                <ul className="space-y-1.5 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                    <span>Owner will review your cancellation request</span>
                  </li>
                  {isPaidOrder && (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                        <span>Full refund will be processed upon approval</span>
                      </li>
                      {row.paymentMethod === "cash" && (
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                          <span>Visit store to collect cash refund</span>
                        </li>
                      )}
                      {(row.paymentMethod === "scan") && (
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                          <span>Refund processed to your account within 3-5 days</span>
                        </li>
                      )}
                    </>
                  )}
                  {isCOD && (
                    <li className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                      <span>No refund needed (payment not collected)</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                    <span>You&apos;ll receive notification once processed</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Cancellation Reason */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Reason for Cancellation{" "}
              <span className="font-normal normal-case tracking-normal">
                (Optional)
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Help us improve: Why are you cancelling this order?"
              rows={3}
              className="w-full px-4 py-3 border border-rose-200 bg-rose-50/40 text-gray-900 placeholder:text-gray-400 rounded-2xl text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-rose-100 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 px-4 rounded-full border-2 border-rose-200 bg-white text-sm font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Go Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (isScanPayment && !qrCodeImage)}
            className="flex-1 py-3 px-4 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white text-sm font-semibold shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              isPaidOrder ? "Submit Request" : "Cancel Order"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function RefundRequestModal({
  row,
  onClose,
  onSubmit,
}: {
  row: Txn;
  onClose: () => void;
  onSubmit: (reason: string, items: Array<{ id: string; quantity: number }>, qrCodeImage?: string, itemPhotos?: string[]) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});
  const [qrCodeImage, setQrCodeImage] = useState<string>("");
  const [itemPhotos, setItemPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingItemPhoto, setUploadingItemPhoto] = useState(false);

  const items = row.items || [];
  const isScanPayment = row.paymentMethod === "scan";
  const isReturnRequest = row.status?.toLowerCase() !== "cancelled";
  
  // Debug log
  console.log("RefundRequestModal - Payment Method:", row.paymentMethod, "Is Scan?", isScanPayment, "Is Return?", isReturnRequest);
  
  // Calculate refund amount based on selected items
  const totalItemQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const selectedItemQuantity = Object.values(refundQuantities).reduce((sum, qty) => sum + qty, 0);
  const isFullReturn = selectedItemQuantity === totalItemQuantity && selectedItemQuantity > 0;
  
  // Calculate refund amount
  const calculatedRefundAmount = isFullReturn
    ? row.total || 0  // Full return: includes tax
    : items.reduce((sum, item, idx) => {  // Partial return: excludes tax
        const itemKey = `item-${idx}`;
        const selectedQty = refundQuantities[itemKey] || 0;
        return sum + (item.unitPrice || 0) * selectedQty;
      }, 0);

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setRefundQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, quantity),
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5MB");
      return;
    }

    setUploading(true);

    try {
      // Downscale before encoding. A raw phone photo as base64 exceeds
      // Firestore's ~1MiB field cap and the write fails with
      // "Property cancellationRequest contains an invalid nested entity".
      const compressed = await fileToCompressedDataUrl(file, {
        maxBytes: MAX_QR_DATA_URL_BYTES,
      });
      setQrCodeImage(compressed);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert(
        error instanceof Error ? error.message : "Failed to upload image",
      );
    } finally {
      setUploading(false);
    }
  };
  
  const handleItemPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate number of photos (max 5)
    if (itemPhotos.length + files.length > 5) {
      alert("You can upload maximum 5 photos");
      return;
    }

    setUploadingItemPhoto(true);

    try {
      const newPhotos: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith("image/")) {
          continue;
        }

        // Validate file size (max 5MB per image)
        if (file.size > 5 * 1024 * 1024) {
          alert(`Image ${file.name} is too large (max 5MB)`);
          continue;
        }

        // Tighter budget than the QR image: up to 5 of these share a single
        // Firestore document, which is capped at 1MiB in total.
        newPhotos.push(
          await fileToCompressedDataUrl(file, {
            maxBytes: MAX_PHOTO_DATA_URL_BYTES,
            maxDimension: 1024,
          }),
        );
      }
      
      setItemPhotos(prev => [...prev, ...newPhotos]);
      setUploadingItemPhoto(false);
    } catch (error) {
      console.error("Error uploading photos:", error);
      alert("Failed to upload photos");
      setUploadingItemPhoto(false);
    }
  };
  
  const removeItemPhoto = (index: number) => {
    setItemPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const refundItems = items
      .map((item, idx) => ({
        id: item.groupName || `item-${idx}`,
        productId: (item as any).productId,
        quantity: refundQuantities[`item-${idx}`] || 0,
        unitPrice: item.unitPrice || 0,
        groupName: item.groupName,
      }))
      .filter((item) => item.quantity > 0);

    if (refundItems.length === 0) {
      alert("Please select at least one item to refund");
      return;
    }

    // Require reason
    if (!reason || reason.trim() === "") {
      alert("Please provide a reason for your refund/return request");
      return;
    }

    // Require QR code for all return requests
    if (isReturnRequest && !qrCodeImage) {
      alert("Please upload your payment account or QR code screenshot");
      return;
    }
    
    // Require item photos for return requests
    if (isReturnRequest && itemPhotos.length === 0) {
      alert("Please upload at least one photo of the items you want to return");
      return;
    }

    setSubmitting(true);
    await onSubmit(reason, refundItems, qrCodeImage, itemPhotos);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col z-10">
        {/* Header */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-white">
              {row?.status?.toLowerCase() === "cancelled" 
                ? "Request Refund" 
                : "Request Return"}
            </h2>
            <p className="text-xs text-rose-100">
              {row.transactionId || row.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded transition-colors text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 py-3 overflow-y-auto flex-1 space-y-2.5 bg-gray-50">
          {/* QR Code Upload for All Return Requests (Including COD Delivered Orders) */}
          {isReturnRequest && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1 bg-rose-500 rounded">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-rose-900 text-xs">
                    Payment Account Required *
                  </p>
                  <p className="text-xs text-rose-700 leading-tight">
                    Upload payment QR code or bank account screenshot for refund transfer
                  </p>
                </div>
              </div>

              <div>
                {!qrCodeImage ? (
                  <div className="border-2 border-dashed border-rose-300 rounded p-3 text-center bg-white">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="qr-upload"
                      disabled={uploading}
                    />
                    <label
                      htmlFor="qr-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <svg
                        className="w-8 h-8 text-rose-400 mb-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs text-rose-600 font-semibold">
                        {uploading ? "Uploading..." : "Click to upload"}
                      </span>
                      <span className="text-xs text-rose-500">
                        PNG, JPG (5MB max)
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="relative border border-rose-200 rounded p-1.5 bg-white">
                    <img
                      src={qrCodeImage}
                      alt="Payment QR"
                      className="w-full max-h-32 object-contain rounded"
                    />
                    <button
                      onClick={() => setQrCodeImage("")}
                      className="absolute top-0.5 right-0.5 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Item Photos Upload for Return Requests */}
          {isReturnRequest && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1 bg-rose-500 rounded">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-rose-900 text-xs">
                    Item Photos Required *
                  </p>
                  <p className="text-xs text-rose-700 leading-tight">
                    Upload 1-5 photos for verification
                  </p>
                </div>
              </div>

              <div>
                {/* Upload button */}
                {itemPhotos.length < 5 && (
                  <div className="border-2 border-dashed border-rose-300 rounded p-3 text-center bg-white mb-2">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleItemPhotoUpload}
                      className="hidden"
                      id="item-photos-upload"
                      disabled={uploadingItemPhoto}
                    />
                    <label
                      htmlFor="item-photos-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <svg
                        className="w-8 h-8 text-rose-400 mb-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs text-rose-600 font-semibold">
                        {uploadingItemPhoto ? "Uploading..." : "Click to upload"}
                      </span>
                      <span className="text-xs text-rose-500">
                        PNG, JPG (5MB max · Max 5)
                      </span>
                    </label>
                  </div>
                )}
                
                {/* Photos preview grid */}
                {itemPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {itemPhotos.map((photo, index) => (
                      <div key={index} className="relative border border-rose-200 rounded p-1 bg-white">
                        <img
                          src={photo}
                          alt={`Item ${index + 1}`}
                          className="w-full h-20 object-cover rounded"
                        />
                        <button
                          onClick={() => removeItemPhoto(index)}
                          className="absolute -top-1 -right-1 p-0.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                          type="button"
                        >
                          <X size={12} />
                        </button>
                        <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 bg-black/60 text-white text-xs rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {itemPhotos.length > 0 && (
                  <p className="text-xs text-rose-700 mt-1.5">
                    {itemPhotos.length}/{5} photo{itemPhotos.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cancelled Order Notice */}
          {(row.status || "").toLowerCase() === "cancelled" && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900">
              <p className="font-bold flex items-center gap-1.5">
                <span>⚠️</span> Cancelled Order Refund
              </p>
              <p className="text-xs mt-0.5 text-orange-800 leading-tight">
                Order paid but not received - eligible for full refund
              </p>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <p className="font-bold mb-1">Important:</p>
            <ul className="ml-3 list-disc space-y-0.5 text-xs leading-tight">
              <li>Select items and quantities to {isReturnRequest ? 'return' : 'refund'}</li>
              {isReturnRequest && (
                <>
                  <li>Upload payment account or QR code for refund</li>
                  <li>Upload clear photos of items to return</li>
                </>
              )}
              {!isReturnRequest && isScanPayment && <li>Upload payment QR code for refund</li>}
              <li>Request will be reviewed by owner</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-2.5">
            <label className="block text-xs font-bold text-gray-900 mb-2">
              Select Items to {isReturnRequest ? 'Return' : 'Refund'}
            </label>
            <div className="space-y-1.5">
              {items.map((item, idx) => {
                const itemKey = `item-${idx}`;
                const maxQty = item.quantity || 0;
                const currentQty = refundQuantities[itemKey] || 0;

                return (
                  <div
                    key={itemKey}
                    className="border border-gray-200 rounded p-2 bg-gray-50"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-xs truncate">
                          {item.groupName || "Item"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {[item.selectedColor, item.selectedSize]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          ฿{Number(item.unitPrice || 0).toFixed(2)} × {maxQty}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() =>
                            handleQuantityChange(itemKey, currentQty - 1)
                          }
                          disabled={currentQty <= 0}
                          className="w-6 h-6 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 disabled:opacity-40 text-sm font-semibold"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-bold text-sm">
                          {currentQty}
                        </span>
                        <button
                          onClick={() =>
                            handleQuantityChange(itemKey, currentQty + 1)
                          }
                          disabled={currentQty >= maxQty}
                          className="w-6 h-6 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 disabled:opacity-40 text-sm font-semibold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Refund Amount Summary */}
          {selectedItemQuantity > 0 && (
            <div className={`rounded-lg border p-2.5 ${
              isFullReturn 
                ? "border-green-200 bg-green-50" 
                : "border-blue-200 bg-blue-50"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1 rounded ${isFullReturn ? "bg-green-500" : "bg-blue-500"}`}>
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-xs ${isFullReturn ? "text-green-900" : "text-blue-900"}`}>
                    {isFullReturn ? "Full Return - Total Refund" : "Partial Return - Item Refund"}
                  </p>
                  <p className={`text-xs leading-tight ${isFullReturn ? "text-green-700" : "text-blue-700"}`}>
                    {isFullReturn 
                      ? "All items selected - includes tax" 
                      : "Selected items only - excludes tax"}
                  </p>
                </div>
              </div>
              
              <div className="bg-white/60 rounded-lg p-2 border border-current/20">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">Refund Amount (THB)</span>
                  <span className="text-base font-bold text-gray-900">
                    ฿{calculatedRefundAmount.toFixed(2)}
                  </span>
                </div>
                {row.sellingTotal && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs font-medium text-gray-700">Refund Amount (MMK)</span>
                    <span className="text-sm font-bold text-gray-900">
                      Ks {(calculatedRefundAmount * (row.exchangeRate || 43)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-2.5">
            <label className="block text-xs font-bold text-gray-900 mb-1.5">
              Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us why you want a refund... *"
              rows={2}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>
        </div>

        <div className="px-3 py-2 bg-white border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2 border border-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded font-semibold transition-colors disabled:opacity-50 text-xs"
          >
            {submitting ? "Submitting..." : (row?.status?.toLowerCase() === "cancelled" ? "Request Refund" : "Request Return")}
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
  onRequestCancel,
  onRequestRefund,
  onViewRefundDetails,
}: {
  row: Txn;
  displayStatus: PurchaseOrderStatus;
  onViewDetails: (row: Txn) => void;
  onRequestCancel: (row: Txn) => void;
  onRequestRefund: (row: Txn) => void;
  onViewRefundDetails: (row: Txn) => void;
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
    const menuWidth = 200;
    const menuHeight = 150;
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

  // Check if order can be cancelled (pending/packaging, not cancelled, no pending request)
  const canCancel =
    (displayStatus === "pending" || displayStatus === "packaging") &&
    row.status !== "cancelled" &&
    row.cancellationRequest?.status !== "pending";

  // Check if order can be refunded
  // 1. Delivered orders (not refunded, no pending request) - includes COD orders that have been delivered and paid
  // 2. Cancelled paid orders (cash/scan/wallet) without cancellationRefund (no pending request)
  const isPaidOrder = row.paymentMethod === "cash" || row.paymentMethod === "scan";
  const isCODDelivered = row.paymentMethod === "cod" && displayStatus === "delivered";
  const hasCancellationRefund = row.cancellationRefund !== undefined;
  const canRefund =
    // Regular delivered orders (cash/scan/wallet/cod all can request return after delivery)
    (displayStatus === "delivered" && row.status !== "refunded" && row.refundRequest?.status !== "pending") ||
    // Cancelled paid orders without cancellation refund
    (displayStatus === "cancelled" && isPaidOrder && !hasCancellationRefund && row.refundRequest?.status !== "pending");

  // Show request status
  const hasPendingCancellation = row.cancellationRequest?.status === "pending";
  const hasPendingRefund = row.refundRequest?.status === "pending";
  const hasApprovedCancellation = row.cancellationRequest?.status === "approved";
  const hasRejectedCancellation = row.cancellationRequest?.status === "rejected";
  const hasApprovedRefund = row.refundRequest?.status === "approved";
  const hasRejectedRefund = row.refundRequest?.status === "rejected";

  // Check if order has completed refunds
  const hasCompletedRefunds = row.refunds && row.refunds.some(r => r.status === "completed");
  const hasCompletedCancellationRefund = row.cancellationRefund?.status === "completed";
  const hasAnyCompletedRefund = hasCompletedRefunds || hasCompletedCancellationRefund;

  return (
    <tr className="border-t border-rose-50 hover:bg-rose-50/40 transition-colors">
      <td className="px-4 py-3 font-semibold text-gray-900">
        {row.onlineOrderId || row.transactionId || row.id}
        {hasPendingCancellation && (
          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Cancellation Pending
          </span>
        )}
        {hasApprovedCancellation && (
          <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            ✓ Cancellation Approved
          </span>
        )}
        {hasRejectedCancellation && (
          <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            ✗ Cancellation Rejected
          </span>
        )}
        {hasPendingRefund && (
          <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            {displayStatus === "delivered" ? "Return Pending" : "Refund Pending"}
          </span>
        )}
        {hasApprovedRefund && (
          <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            ✓ {displayStatus === "delivered" ? "Return Approved" : "Refund Approved"}
          </span>
        )}
        {hasRejectedRefund && (
          <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            ✗ {displayStatus === "delivered" ? "Return Rejected" : "Refund Rejected"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-700">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">฿ {Number(row.total || 0).toFixed(2)}</span>
          {(row.amountMmk || row.sellingTotal) && (
            <span className="text-xs text-gray-500">
              Ks {Number(row.amountMmk || row.sellingTotal || 0).toLocaleString()}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-700">
        {row.paymentMethod === "cash" ? "💵 Cash" :
         row.paymentMethod === "scan" ? "📱 QR Scan" :
         row.paymentMethod === "wallet" ? "👛 Wallet" :
         row.paymentMethod === "cod" ? "🚚 COD" :
         row.paymentProvider || row.paymentMethod || "-"}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getPaymentBadgeClass(
            normalizePaymentStatus(row.status, row.paymentStatus),
          )}`}
        >
          {getPaymentStatusLabel(row.status, row.paymentStatus)}
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
      <td className="px-4 py-3 text-gray-700">
        {row.transactionId || row.id || "-"}
      </td>
      <td className="px-4 py-3 text-right relative">
        <button
          ref={actionButtonRef}
          onClick={toggleDropdown}
          className="p-1.5 rounded-full text-gray-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
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
              className="fixed w-52 bg-white border border-rose-100 shadow-xl rounded-2xl z-50 overflow-hidden"
              style={{
                top: menuPosition?.top ?? 8,
                left: menuPosition?.left ?? 8,
              }}
            >
              <button
                className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-rose-50 flex items-center gap-2 text-gray-700 transition-colors"
                onClick={() => {
                  setDropdownOpen(false);
                  onViewDetails(row);
                }}
              >
                <Eye size={16} className="text-rose-500" /> View Details
              </button>
              {hasAnyCompletedRefund && (
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 flex items-center gap-2 text-emerald-600 transition-colors border-t border-gray-100"
                  onClick={() => {
                    setDropdownOpen(false);
                    onViewRefundDetails(row);
                  }}
                >
                  <DollarSign size={16} /> View Refund
                </button>
              )}
              {canCancel && (
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 flex items-center gap-2 text-red-600 transition-colors border-t border-gray-100"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRequestCancel(row);
                  }}
                >
                  <XCircle size={16} /> Request Cancellation
                </button>
              )}
              {canRefund && (
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2 text-blue-600 transition-colors border-t border-gray-100"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRequestRefund(row);
                  }}
                  title={displayStatus === "cancelled" ? "Request refund for cancelled paid order" : "Request return for delivered order"}
                >
                  <RotateCcw size={16} /> 
                  {displayStatus === "cancelled" ? "Request Refund" : "Request Return"}
                </button>
              )}
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
  onRequestCancel,
  onRequestRefund,
  onViewRefundDetails,
}: {
  row: Txn;
  displayStatus: PurchaseOrderStatus;
  onViewDetails: (row: Txn) => void;
  onRequestCancel: (row: Txn) => void;
  onRequestRefund: (row: Txn) => void;
  onViewRefundDetails: (row: Txn) => void;
}) {
  // Check if order can be cancelled (pending/packaging, not cancelled, no pending request)
  const canCancel =
    (displayStatus === "pending" || displayStatus === "packaging") &&
    row.status !== "cancelled" &&
    row.cancellationRequest?.status !== "pending";

  // Check if order can be refunded
  // 1. Delivered orders (not refunded, no pending request) - includes COD orders that have been delivered and paid
  // 2. Cancelled paid orders (cash/scan/wallet) without cancellationRefund (no pending request)
  const isPaidOrder = row.paymentMethod === "cash" || row.paymentMethod === "scan";
  const isCODDelivered = row.paymentMethod === "cod" && displayStatus === "delivered";
  const hasCancellationRefund = row.cancellationRefund !== undefined;
  const canRefund =
    // Regular delivered orders (cash/scan/wallet/cod all can request return after delivery)
    (displayStatus === "delivered" && row.status !== "refunded" && row.refundRequest?.status !== "pending") ||
    // Cancelled paid orders without cancellation refund
    (displayStatus === "cancelled" && isPaidOrder && !hasCancellationRefund && row.refundRequest?.status !== "pending");

  // Show request status
  const hasPendingCancellation = row.cancellationRequest?.status === "pending";
  const hasPendingRefund = row.refundRequest?.status === "pending";
  const hasApprovedCancellation = row.cancellationRequest?.status === "approved";
  const hasRejectedCancellation = row.cancellationRequest?.status === "rejected";
  const hasApprovedRefund = row.refundRequest?.status === "approved";
  const hasRejectedRefund = row.refundRequest?.status === "rejected";

  // Check if order has completed refunds
  const hasCompletedRefunds = row.refunds && row.refunds.some(r => r.status === "completed");
  const hasCompletedCancellationRefund = row.cancellationRefund?.status === "completed";
  const hasAnyCompletedRefund = hasCompletedRefunds || hasCompletedCancellationRefund;

  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Order ID
          </p>
          <p className="truncate text-sm font-semibold text-gray-900">
            {row.transactionId || row.id}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {hasPendingCancellation && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Cancellation Pending
              </span>
            )}
            {hasApprovedCancellation && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                ✓ Cancellation Approved
              </span>
            )}
            {hasRejectedCancellation && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                ✗ Cancellation Rejected
              </span>
            )}
            {hasPendingRefund && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                {displayStatus === "delivered" ? "Return Pending" : "Refund Pending"}
              </span>
            )}
            {hasApprovedRefund && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                ✓ {displayStatus === "delivered" ? "Return Approved" : "Refund Approved"}
              </span>
            )}
            {hasRejectedRefund && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                ✗ {displayStatus === "delivered" ? "Return Rejected" : "Refund Rejected"}
              </span>
            )}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadgeClass(
            displayStatus,
          )}`}
        >
          {getPurchaseOrderStatusLabel(displayStatus)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-rose-50/40 p-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Order Ref
          </p>
          <p className="text-gray-800">{row.onlineOrderId || "-"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Date
          </p>
          <p className="text-gray-800">
            {row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Amount (THB)
          </p>
          <p className="font-bold text-rose-600">
            ฿ {Number(row.total || 0).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Amount (MMK)
          </p>
          <p className="font-semibold text-gray-900">
            Ks {Number(row.amountMmk || row.sellingTotal || 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Payment Method
          </p>
          <p className="text-gray-800">
            {row.paymentMethod === "cash" ? "💵 Cash" :
             row.paymentMethod === "scan" ? "📱 QR Scan" :
             row.paymentMethod === "wallet" ? "📱 QR Scan" :
             row.paymentMethod === "cod" ? "🚚 COD" :
             row.paymentProvider || row.paymentMethod || "-"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Payment Status
          </p>
          <p>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getPaymentBadgeClass(
                normalizePaymentStatus(row.status, row.paymentStatus),
              )}`}
            >
              {getPaymentStatusLabel(row.status, row.paymentStatus)}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Order Status
          </p>
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
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onViewDetails(row)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-md"
        >
          <Eye size={16} /> View Details
        </button>
        {hasAnyCompletedRefund && (
          <button
            onClick={() => onViewRefundDetails(row)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-600 transition-all hover:border-emerald-300 hover:bg-emerald-50"
          >
            <DollarSign size={16} /> Refund
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onRequestCancel(row)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-red-600 transition-all hover:border-red-300 hover:bg-red-50"
          >
            <XCircle size={16} /> Cancel
          </button>
        )}
        {canRefund && (
          <button
            onClick={() => onRequestRefund(row)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2.5 text-xs font-semibold text-blue-600 transition-all hover:border-blue-300 hover:bg-blue-50"
            title={displayStatus === "cancelled" ? "Request refund for cancelled paid order" : "Request return for delivered order"}
          >
            <RotateCcw size={16} /> {displayStatus === "cancelled" ? "Refund" : "Return"}
          </button>
        )}
      </div>
    </div>
  );
}

function RefundDetailsModal({
  row,
  onClose,
}: {
  row: Txn;
  onClose: () => void;
}) {
  if (!row) return null;

  const isReturnType = row.orderStatus === "fully_returned" || row.orderStatus === "partially_returned";
  const completedRefunds = row.refunds?.filter(r => r.status === "completed") || [];
  const cancellationRefund = row.cancellationRefund;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-white to-rose-50/30 shadow-2xl">
        {/* Header with gradient */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
                <DollarSign size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">
                {isReturnType ? "Return & Refund" : "Refund Details"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            >
              <XCircle size={22} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-180px)] px-6 py-5 space-y-4">
          {/* Order Information - Compact Card */}
          <div className="rounded-xl border border-rose-100 bg-white/80 backdrop-blur-sm p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-rose-900 mb-3 flex items-center gap-2">
              <span className="text-rose-500">📋</span> Order Information
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div>
                <p className="text-gray-500 mb-0.5">Order ID</p>
                <p className="font-semibold text-gray-900 truncate">{row.transactionId || row.id}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Order Reference</p>
                <p className="font-semibold text-gray-900">{row.onlineOrderId || "-"}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Order Total</p>
                <p className="font-semibold text-gray-900">
                  THB {Number(row.total || 0).toFixed(2)}
                  {row.sellingTotal && (
                    <span className="block text-[10px] text-gray-600">Ks {Number(row.sellingTotal).toLocaleString()}</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Payment Method</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {row.paymentMethod === "scan" || row.paymentMethod === "wallet" ? "QR Scan" : row.paymentMethod === "cash" ? "Cash" : row.paymentMethod || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Return Refunds - Pink Theme */}
          {isReturnType && completedRefunds.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 p-1.5">
                  <DollarSign size={16} className="text-white" />
                </div>
                <h3 className="font-semibold text-rose-900">
                  {row.orderStatus === "fully_returned" ? "Full Return Refund" : "Partial Return Refund"}
                </h3>
              </div>
              
              {completedRefunds.map((refund, idx) => {
                const refundAmount = refund.amount || refund.totalAmount || 0;
                return (
                <div key={idx} className={`${idx > 0 ? 'mt-3 pt-3 border-t border-rose-200' : ''}`}>
                  {/* Refund Amount - Highlighted */}
                  <div className="bg-white/60 rounded-lg p-3 mb-3 border border-rose-200/50">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-medium text-rose-700">Refund Amount (THB)</span>
                      <span className="text-lg font-bold text-rose-600">THB {refundAmount.toFixed(2)}</span>
                    </div>
                    {row.sellingTotal && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-rose-700">Refund Amount (MMK)</span>
                        <span className="text-base font-bold text-rose-600">
                          Ks {(refundAmount * (row.exchangeRate || 1)).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Additional Info */}
                  <div className="space-y-1.5 text-xs">
                    {refund.confirmedAt && (
                      <div className="flex justify-between items-center">
                        <span className="text-rose-700/80">Refund Date</span>
                        <span className="font-medium text-rose-900">
                          {new Date(refund.confirmedAt.toDate()).toLocaleDateString('en-US', { 
                            month: 'short', day: 'numeric', year: 'numeric', 
                            hour: '2-digit', minute: '2-digit' 
                          })}
                        </span>
                      </div>
                    )}
                    {refund.processedBy && (
                      <div className="flex justify-between items-center">
                        <span className="text-rose-700/80">Processed By</span>
                        <span className="font-medium text-rose-900">{refund.processedBy}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {refund.notes && (
                    <div className="mt-2.5 p-2.5 bg-rose-100/50 rounded-lg border border-rose-200">
                      <p className="text-xs font-medium text-rose-800 mb-1">Notes:</p>
                      <p className="text-xs text-rose-900">{refund.notes}</p>
                    </div>
                  )}

                  {/* Payment Method Notice */}
                  <div className="mt-3 p-2.5 bg-white/60 rounded-lg border border-rose-200/50">
                    {row.paymentMethod === "cash" && (
                      <p className="text-xs text-rose-800 flex items-start gap-2">
                        <span className="text-base">💵</span>
                        <span>Cash refund. Please visit the store with your receipt to collect your refund.</span>
                      </p>
                    )}
                    {(row.paymentMethod === "scan" || row.paymentMethod === "wallet") && (
                      <p className="text-xs text-rose-800 flex items-start gap-2">
                        <span className="text-base">📱</span>
                        <span>Refund has been processed back to your QR payment method within 3-5 business days.</span>
                      </p>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}

          {/* Cancellation Refund - Rose Theme */}
          {cancellationRefund && cancellationRefund.status === "completed" && (
            <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 p-1.5">
                  <DollarSign size={16} className="text-white" />
                </div>
                <h3 className="font-semibold text-rose-900">Cancellation Refund</h3>
              </div>
              
              {/* Refund Amount - Highlighted */}
              <div className="bg-white/60 rounded-lg p-3 mb-3 border border-rose-200/50">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium text-rose-700">Refund Amount (THB)</span>
                  <span className="text-lg font-bold text-rose-600">THB {cancellationRefund.amount.toFixed(2)}</span>
                </div>
                {row.sellingTotal && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-rose-700">Refund Amount (MMK)</span>
                    <span className="text-base font-bold text-rose-600">
                      Ks {(cancellationRefund.amount * (row.exchangeRate || 1)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Additional Info */}
              <div className="space-y-1.5 text-xs">
                {cancellationRefund.confirmedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-rose-700/80">Refund Date</span>
                    <span className="font-medium text-rose-900">
                      {new Date(cancellationRefund.confirmedAt.toDate()).toLocaleDateString('en-US', { 
                        month: 'short', day: 'numeric', year: 'numeric', 
                        hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                )}
                {cancellationRefund.processedBy && (
                  <div className="flex justify-between items-center">
                    <span className="text-rose-700/80">Processed By</span>
                    <span className="font-medium text-rose-900">{cancellationRefund.processedBy}</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {cancellationRefund.notes && (
                <div className="mt-2.5 p-2.5 bg-rose-100/50 rounded-lg border border-rose-200">
                  <p className="text-xs font-medium text-rose-800 mb-1">Notes:</p>
                  <p className="text-xs text-rose-900">{cancellationRefund.notes}</p>
                </div>
              )}

              {/* Payment Method Notice */}
              <div className="mt-3 p-2.5 bg-white/60 rounded-lg border border-rose-200/50">
                {row.paymentMethod === "cash" && (
                  <p className="text-xs text-rose-800 flex items-start gap-2">
                    <span className="text-base">💵</span>
                    <span>Cash refund. Please visit the store with your receipt to collect your refund.</span>
                  </p>
                )}
                {(row.paymentMethod === "scan" || row.paymentMethod === "wallet") && (
                  <p className="text-xs text-rose-800 flex items-start gap-2">
                    <span className="text-base">📱</span>
                    <span>Refund has been processed back to your QR payment method within 3-5 business days.</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Status Information - Compact */}
          <div className="rounded-xl border border-rose-100 bg-white/80 backdrop-blur-sm p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-rose-900 mb-3 flex items-center gap-2">
              <span className="text-rose-500">📊</span> Status Information
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500 mb-1">Payment Status</p>
                <span className="inline-block px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 font-semibold capitalize text-[11px]">
                  {row.status === "refunded" ? "Fully Refunded" : 
                   row.status === "partially_refunded" ? "Partially Refunded" :
                   row.status?.replace(/_/g, " ") || "N/A"}
                </span>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Order Status</p>
                <span className="inline-block px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 font-semibold capitalize text-[11px]">
                  {row.orderStatus === "fully_returned" ? "Fully Returned" : 
                   row.orderStatus === "partially_returned" ? "Partially Returned" :
                   row.orderStatus?.replace(/_/g, " ") || "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-rose-100 bg-white/90 backdrop-blur-sm px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-rose-600 hover:to-pink-600 transition-all duration-200 shadow-lg shadow-rose-500/30"
          >
            Close
          </button>
        </div>
      </div>
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
    "all" | "paid" | "pending" | "failed" | "cancelled" | "refunded" | "partially_refunded" | "pending_refund" | "refund_rejected"
  >("all");
  const [dateRange, setDateRange] = useState<
    "today" | "7d" | "30d" | "90d" | "all" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState(defaultCustomRange.start);
  const [endDate, setEndDate] = useState(defaultCustomRange.end);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRow, setSelectedRow] = useState<Txn | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showRefundDetailsModal, setShowRefundDetailsModal] = useState(false);
  const [cancelRow, setCancelRow] = useState<Txn | null>(null);
  const [refundRow, setRefundRow] = useState<Txn | null>(null);
  const [refundDetailsRow, setRefundDetailsRow] = useState<Txn | null>(null);

  /** Order reference this page was deep-linked to, via `?order=<ref>`. */
  const [deepLinkOrder, setDeepLinkOrder] = useState("");

  // Deep link support for `?order=<ref>`, used by the Telegram bot's per-order
  // "view details" buttons. The date filter is widened at the same time: the
  // default 30-day window would hide an older order and make the link look
  // broken. Read from `window.location` rather than `useSearchParams` so the
  // page needs no Suspense boundary.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("order");
    if (!ref) return;
    // Reading the URL is exactly the external-system sync this rule tolerates,
    // and it cannot move into a lazy initialiser without touching `window`
    // during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeepLinkOrder(ref);
    setSearchTerm(ref);
    setDateRange("all");
  }, []);

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

    // Query only transactions for this user (much faster than fetching all)
    console.log("Fetching transactions for user:", user.uid);
    
    const txnQuery = query(
      collection(db, "transactions"),
      where("customer.uid", "==", user.uid),
      orderBy("timestamp", "desc")
    );
    
    const unsubscribe = onSnapshot(
      txnQuery,
      (snap) => {
        console.log("Transactions query returned:", snap.size, "documents");
        const items = snap.docs.map((d) => {
          const data = d.data() as Omit<Txn, "id">;
          console.log("Transaction:", d.id, {
            transactionId: data.transactionId,
            onlineOrderId: data.onlineOrderId,
            paymentMethod: data.paymentMethod,
            total: data.total,
            status: data.status,
            paymentStatus: data.paymentStatus,
            orderStatus: data.orderStatus,
          });
          return {
            id: d.id,
            ...data,
          };
        });
        console.log("Mapped transactions:", items.length);
        console.log("First transaction:", items[0]);
        setRows(items);
        setPageLoading(false);
      },
      (error) => {
        console.error("Error fetching transactions:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        // If index is missing, show user-friendly message
        if (error.code === "failed-precondition") {
          console.error("Firestore index required. Create it here:", error.message);
        }
        
        setPageLoading(false);
      },
    );
    
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!db || !user) return;

    // Query only online orders for this user (much faster than fetching all)
    const ordersQuery = query(
      collection(db, "onlineOrders"),
      where("customer.uid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snap) => {
      const next: Record<string, PurchaseOrderStatus> = {};

      snap.docs.forEach((docSnap) => {
        const order = docSnap.data() as OnlineOrderLookup;

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
    console.log("=== FILTERING ROWS ===");
    console.log("Total rows:", rows.length);
    console.log("Filter payment status:", filterPaymentStatus);
    console.log("Filter order status:", filterStatus);
    
    const filtered = rows.filter((row, index) => {
      if (index < 5) { // Log first 5 for debugging
        console.log(`Row ${index}:`, {
          id: row.transactionId || row.id,
          paymentMethod: row.paymentMethod,
          status: row.status,
          paymentStatus: row.paymentStatus,
          orderStatus: row.orderStatus,
        });
      }
      
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

      const normalizedPaymentStatus = normalizePaymentStatus(row.status, row.paymentStatus);
      const matchesPaymentStatus =
        filterPaymentStatus === "all" ||
        normalizedPaymentStatus === filterPaymentStatus;
      
      if (index < 5) {
        console.log(`  -> normalized payment: ${normalizedPaymentStatus}, matches: ${matchesPaymentStatus}`);
        console.log(`  -> normalized order: ${normalizedStatus}, matches: ${matchesStatus}`);
      }

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
    
    console.log("Filtered rows:", filtered.length);
    return filtered;
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

  const handleRequestCancel = (row: Txn) => {
    setCancelRow(row);
    setShowCancelModal(true);
  };

  const handleRequestRefund = (row: Txn) => {
    setRefundRow(row);
    setShowRefundModal(true);
  };

  const handleViewRefundDetails = (row: Txn) => {
    setRefundDetailsRow(row);
    setShowRefundDetailsModal(true);
  };

  const handleSubmitCancellation = async (reason: string, qrCodeImage?: string) => {
    if (!cancelRow || !user) return;

    try {
      const response = await fetch("/api/transactions/request-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: cancelRow.transactionId || cancelRow.id,
          customerUid: user.uid,
          reason,
          qrCodeImage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to submit cancellation request");
        return;
      }

      alert(data.message || "Cancellation request submitted successfully");
      setShowCancelModal(false);
      setCancelRow(null);
    } catch (error) {
      console.error("Error submitting cancellation:", error);
      alert("Failed to submit cancellation request");
    }
  };

  const handleSubmitRefund = async (
    reason: string,
    items: Array<{ id: string; quantity: number }>,
    qrCodeImage?: string,
    itemPhotos?: string[]
  ) => {
    if (!refundRow || !user) return;

    // Determine if this is a return request (delivered) or refund request (cancelled)
    const isReturnRequest = refundRow.orderStatus === "delivered";
    const requestType = isReturnRequest ? "return" : "refund";

    // Calculate refund amount based on return type
    const allItems = refundRow.items || [];
    const totalItemQuantity = allItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const selectedItemQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    
    // Check if all items are being returned (full return)
    const isFullReturn = selectedItemQuantity === totalItemQuantity;
    
    let refundAmount: number;
    
    if (isFullReturn) {
      // Full return: refund the total paid amount (includes tax)
      refundAmount = refundRow.total || 0;
    } else {
      // Partial return: calculate sum of selected items (excludes tax)
      refundAmount = items.reduce((sum, selectedItem) => {
        const originalItem = allItems.find((item, idx) => 
          selectedItem.id === (item.groupName || `item-${idx}`)
        );
        if (originalItem) {
          return sum + (originalItem.unitPrice || 0) * selectedItem.quantity;
        }
        return sum;
      }, 0);
    }

    try {
      const response = await fetch("/api/transactions/request-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: refundRow.transactionId || refundRow.id,
          customerUid: user.uid,
          reason,
          items,
          qrCodeImage, // Include QR code image
          itemPhotos, // Include item photos
          refundAmount, // Include calculated refund amount
          isFullReturn, // Indicate if this is a full or partial return
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || `Failed to submit ${requestType} request`);
        return;
      }

      alert(data.message || `${isReturnRequest ? 'Return' : 'Refund'} request submitted successfully. Please wait for owner approval.`);
      setShowRefundModal(false);
      setRefundRow(null);
    } catch (error) {
      console.error(`Error submitting ${requestType}:`, error);
      alert(`Failed to submit ${requestType} request`);
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-20">
          <div className="flex flex-col items-center gap-3">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-rose-200 border-t-rose-500" />
            <p className="text-sm font-medium text-gray-500">
              Loading purchase history...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500 md:text-3xl">
              My Purchase History
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Track your online transactions and order statuses.
            </p>
          </div>
          <Link
            href="/account/profile"
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50"
          >
            <ChevronLeft size={14} />
            Back to Profile
          </Link>
        </div>

        {/* Summary */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
              <svg
                className="h-5 w-5 text-rose-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4H6Zm-2 4h16M16 10a4 4 0 0 1-8 0"
                />
              </svg>
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Total Orders
              </p>
              <p className="text-lg font-bold text-gray-900">{rows.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
              <DollarSign size={18} className="text-rose-500" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Total Spent
              </p>
              <p className="text-lg font-bold text-gray-900">
                ฿ {totalSpent.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* A deep link can point at an order that has no purchase record yet:
            this table is built from completed transactions, and an order only
            gets one once payment is confirmed. Say so, rather than showing an
            empty table and leaving the customer to guess. */}
        {deepLinkOrder &&
          !pageLoading &&
          !rows.some(
            (row) =>
              (row.onlineOrderId || "").toLowerCase() ===
              deepLinkOrder.toLowerCase(),
          ) && (
            <div
              role="status"
              className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-amber-900">
                Order {deepLinkOrder} is not in your purchase history yet
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Orders appear here once payment is confirmed. If you have not
                finished paying for this one, it is still waiting.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDeepLinkOrder("");
                  setSearchTerm("");
                }}
                className="mt-3 inline-flex items-center rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
              >
                Show all purchases
              </button>
            </div>
          )}

        <div className="mt-6 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search transaction or order ref..."
              className="w-full rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 placeholder:text-gray-400 pl-9 pr-4 py-2.5 text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          <div className="relative">
            <Filter
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400"
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
                    | "cancelled"
                    | "fully_returned"
                    | "partially_returned",
                )
              }
              className="w-full rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 pl-9 pr-8 py-2.5 text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 appearance-none"
            >
              <option value="all">All Order Status</option>
              <option value="pending">Pending</option>
              <option value="packaging">Packaging</option>
              <option value="delivering">Delivering</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="fully_returned">Fully Returned</option>
              <option value="partially_returned">Partially Returned</option>
            </select>
          </div>

          <div className="relative">
            <Filter
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400"
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
                    | "cancelled"
                    | "refunded"
                    | "partially_refunded",
                )
              }
              className="w-full rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 pl-9 pr-8 py-2.5 text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 appearance-none"
            >
              <option value="all">All Payment Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
              <option value="partially_refunded">Partially Refunded</option>
            </select>
          </div>

          <div className="relative">
            <Calendar
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400"
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
              className="w-full rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 pl-9 pr-8 py-2.5 text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 appearance-none"
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
              className="w-full rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 px-4 py-2.5 text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 px-4 py-2.5 text-sm transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3 md:hidden">
        {sortedFilteredRows.length === 0 ? (
          <div className="rounded-2xl border border-rose-100 bg-white px-4 py-10 text-center shadow-sm">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
              <svg
                className="h-6 w-6 text-rose-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4H6Zm-2 4h16M16 10a4 4 0 0 1-8 0"
                />
              </svg>
            </span>
            <p className="text-sm font-semibold text-gray-900">
              No purchases yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Your orders will appear here once you check out.
            </p>
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
              onRequestCancel={handleRequestCancel}
              onRequestRefund={handleRequestRefund}
              onViewRefundDetails={handleViewRefundDetails}
            />
          ))
        )}
      </div>

      <div className="mt-6 hidden overflow-x-auto overflow-y-visible rounded-2xl border border-rose-100 bg-white shadow-sm md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-rose-50 to-pink-50 text-left">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
              <th className="px-4 py-3.5">Order ID</th>
              <th className="px-4 py-3.5">Amount (THB / MMK)</th>
              <th className="px-4 py-3.5">Payment Method</th>
              <th className="px-4 py-3.5">Payment Status</th>
              <th className="px-4 py-3.5">Order Status</th>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">Transaction ID</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
                    <svg
                      className="h-6 w-6 text-rose-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4H6Zm-2 4h16M16 10a4 4 0 0 1-8 0"
                      />
                    </svg>
                  </span>
                  <p className="text-sm font-semibold text-gray-900">
                    No purchases yet
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Your orders will appear here once you check out.
                  </p>
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
                  onRequestCancel={handleRequestCancel}
                  onRequestRefund={handleRequestRefund}
                  onViewRefundDetails={handleViewRefundDetails}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="font-medium">Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value))}
            className="rounded-full border border-rose-200 bg-rose-50/40 text-gray-900 px-3 py-1.5 text-xs font-semibold focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
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
          <span className="text-xs font-medium text-gray-500">
            Page <span className="text-rose-600">{safeCurrentPage}</span> of{" "}
            {totalPages}
          </span>
          <nav className="inline-flex items-center gap-2" aria-label="Pagination">
            <button
              title="Go to previous page"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              title="Go to next page"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={safeCurrentPage === totalPages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </div>
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

      {showCancelModal && cancelRow && (
        <CancelRequestModal
          row={cancelRow}
          onClose={() => {
            setShowCancelModal(false);
            setCancelRow(null);
          }}
          onSubmit={handleSubmitCancellation}
        />
      )}

      {showRefundModal && refundRow && (
        <RefundRequestModal
          row={refundRow}
          onClose={() => {
            setShowRefundModal(false);
            setRefundRow(null);
          }}
          onSubmit={handleSubmitRefund}
        />
      )}

      {showRefundDetailsModal && refundDetailsRow && (
        <RefundDetailsModal
          row={refundDetailsRow}
          onClose={() => {
            setShowRefundDetailsModal(false);
            setRefundDetailsRow(null);
          }}
        />
      )}
    </div>
  );
}


