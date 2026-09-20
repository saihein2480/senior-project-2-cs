"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";
import { db } from "../../../lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

type NotificationType = "refund_completed" | "refund_approved" | "refund_rejected" | "cancellation_approved" | "cancellation_rejected" | "order_delivered";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  orderId: string;
  orderRef?: string;
  amount?: number;
  currency?: string;
  timestamp: Date;
  read: boolean;
};

// SVG Icon Components
const BellIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const CheckCircleIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const XCircleIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const ClockIcon = ({ size = 12, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const DollarSignIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const PackageIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export default function NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useCustomerAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const branch = searchParams.get("branch");
  const currency = searchParams.get("currency") || "THB";

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login?redirect=/account/notifications");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!db || !user) {
      console.log("No db or user:", { db: !!db, user: !!user });
      setPageLoading(false);
      return;
    }

    console.log("Starting to fetch notifications for user:", user.uid);

    const fetchNotifications = async () => {
      try {
        const allNotifications: Notification[] = [];

        // PART 1: Fetch from separate notifications collection (NEW)
        console.log("Fetching from notifications collection...");
        try {
          // First try without orderBy to see if index is missing
          const notificationsQuery = query(
            collection(db!, "notifications"),
            where("userId", "==", user.uid)
          );

          const notificationsSnapshot = await getDocs(notificationsQuery);
          console.log("Found notifications in notifications collection:", notificationsSnapshot.size);

          notificationsSnapshot.forEach((doc) => {
            const data = doc.data();
            console.log("Notification doc:", doc.id, data);

            const timestamp = data.createdAt?.toDate() || new Date();
            
            allNotifications.push({
              id: doc.id,
              type: data.type || "refund_rejected",
              title: data.title || "Notification",
              message: data.message || "",
              orderId: data.orderId || data.transactionId || "",
              orderRef: data.onlineOrderId,
              timestamp: timestamp,
              read: data.read || false,
            });
          });
        } catch (notifError) {
          console.error("Error fetching from notifications collection:", notifError);
          if (notifError instanceof Error) {
            console.error("Error details:", {
              message: notifError.message,
              stack: notifError.stack
            });
          }
          // Continue to fetch from transactions even if notifications query fails
        }

        // PART 2: Fetch all transactions and filter by customer.uid (EXISTING)
        const txnQuery = query(
          collection(db!, "transactions"),
          orderBy("timestamp", "desc")
        );

        console.log("Executing query...");
        const snapshot = await getDocs(txnQuery);
        console.log("Total transactions found:", snapshot.size);

        snapshot.forEach((doc) => {
          const data = doc.data();
          
          // Filter by customer.uid (same as purchases page)
          const customer = (data as any).customer;
          
          console.log("Transaction:", doc.id, "customer:", customer);
          
          if (!customer || customer.uid !== user.uid) {
            return;
          }

          console.log("✅ Transaction belongs to user:", doc.id);

          const txnId = data.transactionId || doc.id;
          const orderRef = data.onlineOrderId;

          console.log("Processing transaction:", txnId, {
            hasRefunds: !!data.refunds,
            refundsArray: data.refunds,
            hasCancellationRefund: !!data.cancellationRefund,
            cancellationRefund: data.cancellationRefund,
            hasRefundRequest: !!data.refundRequest,
            refundRequest: data.refundRequest,
          });

          // Refund completed notifications
          if (data.refunds && Array.isArray(data.refunds)) {
            data.refunds.forEach((refund: any, idx: number) => {
              console.log("Checking refund:", refund);
              if (refund.status === "completed" && refund.confirmedAt) {
                const refundAmount = refund.amount || refund.totalAmount || 0;
                console.log("Adding refund completed notification:", refundAmount);
                allNotifications.push({
                  id: `${doc.id}-refund-${idx}`,
                  type: "refund_completed",
                  title: "Refund Completed!",
                  message: `Your refund of ${currency === "THB" ? "THB" : "Ks"} ${refundAmount.toFixed(2)} has been processed.`,
                  orderId: txnId,
                  orderRef: orderRef,
                  amount: refundAmount,
                  currency: currency,
                  timestamp: refund.confirmedAt.toDate(),
                  read: false,
                });
              }
            });
          }

          // Cancellation refund completed
          if (data.cancellationRefund?.status === "completed" && data.cancellationRefund.confirmedAt) {
            allNotifications.push({
              id: `${doc.id}-cancel-refund`,
              type: "refund_completed",
              title: "Cancellation Refund Completed!",
              message: `Your cancellation refund of ${currency === "THB" ? "THB" : "Ks"} ${data.cancellationRefund.amount.toFixed(2)} has been processed.`,
              orderId: txnId,
              orderRef: orderRef,
              amount: data.cancellationRefund.amount,
              currency: currency,
              timestamp: data.cancellationRefund.confirmedAt.toDate(),
              read: false,
            });
          }

          // Refund request approved
          if (data.refundRequest?.status === "approved" && data.refundRequest.approvedAt) {
            const approvedDate = new Date(data.refundRequest.approvedAt);
            allNotifications.push({
              id: `${doc.id}-refund-approved`,
              type: "refund_approved",
              title: "Return Request Approved!",
              message: "Your return request has been approved. Please return the items to the store.",
              orderId: txnId,
              orderRef: orderRef,
              timestamp: approvedDate,
              read: false,
            });
          }

          // Refund request rejected
          if (data.refundRequest?.status === "rejected" && data.refundRequest.rejectedAt) {
            const rejectedDate = new Date(data.refundRequest.rejectedAt);
            allNotifications.push({
              id: `${doc.id}-refund-rejected`,
              type: "refund_rejected",
              title: "Return Request Rejected",
              message: `Your return request was rejected. Reason: ${data.refundRequest.rejectionReason || "N/A"}`,
              orderId: txnId,
              orderRef: orderRef,
              timestamp: rejectedDate,
              read: false,
            });
          }

          // Cancellation request approved
          if (data.cancellationRequest?.status === "approved" && data.cancellationRequest.approvedAt) {
            const approvedDate = new Date(data.cancellationRequest.approvedAt);
            allNotifications.push({
              id: `${doc.id}-cancel-approved`,
              type: "cancellation_approved",
              title: "Cancellation Request Approved",
              message: "Your order cancellation has been approved.",
              orderId: txnId,
              orderRef: orderRef,
              timestamp: approvedDate,
              read: false,
            });
          }

          // Cancellation request rejected
          if (data.cancellationRequest?.status === "rejected" && data.cancellationRequest.rejectedAt) {
            const rejectedDate = new Date(data.cancellationRequest.rejectedAt);
            allNotifications.push({
              id: `${doc.id}-cancel-rejected`,
              type: "cancellation_rejected",
              title: "Cancellation Request Rejected",
              message: `Your cancellation request was rejected. Reason: ${data.cancellationRequest.rejectionReason || "N/A"}`,
              orderId: txnId,
              orderRef: orderRef,
              timestamp: rejectedDate,
              read: false,
            });
          }

          // Order delivered
          if (data.orderStatus === "delivered" && data.deliveredAt) {
            allNotifications.push({
              id: `${doc.id}-delivered`,
              type: "order_delivered",
              title: "Order Delivered!",
              message: "Your order has been delivered successfully.",
              orderId: txnId,
              orderRef: orderRef,
              timestamp: data.deliveredAt.toDate(),
              read: false,
            });
          }
        });

        // Sort by timestamp (newest first)
        allNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        console.log("Total notifications created:", allNotifications.length);
        console.log("Notifications:", allNotifications);
        setNotifications(allNotifications);
      } catch (error) {
        console.error("Error fetching notifications:", error);
      } finally {
        setPageLoading(false);
      }
    };

    fetchNotifications();
  }, [user, currency]);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case "refund_completed":
        return <DollarSignIcon className="text-green-600" size={24} />;
      case "refund_approved":
      case "cancellation_approved":
        return <CheckCircleIcon className="text-green-600" size={24} />;
      case "refund_rejected":
      case "cancellation_rejected":
        return <XCircleIcon className="text-red-600" size={24} />;
      case "order_delivered":
        return <PackageIcon className="text-blue-600" size={24} />;
      default:
        return <BellIcon className="text-gray-600" size={24} />;
    }
  };

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case "refund_completed":
      case "refund_approved":
      case "cancellation_approved":
      case "order_delivered":
        return "border-green-200 bg-green-50";
      case "refund_rejected":
      case "cancellation_rejected":
        return "border-red-200 bg-red-50";
      default:
        return "border-gray-200 bg-white";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    router.push(`/account/purchases?branch=${branch}&currency=${currency}`);
  };

  const filteredNotifications =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading || pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading notifications...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-rose-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 p-3 shadow-lg">
              <BellIcon className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
              <p className="text-sm text-gray-600">
                Stay updated with your order status and refunds
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              filter === "all"
                ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-lg"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-rose-50"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              filter === "unread"
                ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-lg"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-rose-50"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="rounded-2xl border border-rose-100 bg-white p-12 text-center shadow-sm">
            <BellIcon className="mx-auto mb-4 text-gray-300" size={64} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications yet</h3>
            <p className="text-sm text-gray-600">
              You'll see updates about your orders and refunds here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`rounded-xl border p-4 shadow-sm transition-all cursor-pointer hover:shadow-md ${getNotificationColor(
                  notification.type
                )}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {notification.title}
                    </h3>
                    <p className="text-sm text-gray-700 mb-2">
                      {notification.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                      {notification.orderRef && (
                        <span className="font-medium">Order: {notification.orderRef}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <ClockIcon size={12} />
                        {notification.timestamp.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  {!notification.read && (
                    <div className="flex-shrink-0">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Card */}
        {notifications.length > 0 && (
          <div className="mt-6 rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-rose-50/30 p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircleIcon className="text-green-600" size={20} />
              Summary
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Total Notifications</p>
                <p className="text-2xl font-bold text-gray-900">{notifications.length}</p>
              </div>
              <div>
                <p className="text-gray-600">Refunds Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {notifications.filter((n) => n.type === "refund_completed").length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
