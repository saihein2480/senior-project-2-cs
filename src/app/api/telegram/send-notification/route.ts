/**
 * Send Telegram Notification API (for admin use)
 * Allows sending notifications to customers
 */

import { NextRequest, NextResponse } from "next/server";
import {
  sendOrderConfirmationNotification,
  sendPaymentConfirmationNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  sendOrderCancelledNotification,
  sendRefundProcessedNotification,
  sendPromotionNotification,
  sendBulkNotification,
} from "@/lib/telegram/notifications";

export async function POST(req: NextRequest) {
  try {
    const { type, customerId, data } = await req.json();

    if (!type) {
      return NextResponse.json(
        { error: "Notification type is required" },
        { status: 400 }
      );
    }

    let success = false;

    switch (type) {
      case "order_confirmation":
        success = await sendOrderConfirmationNotification(customerId, data.order);
        break;

      case "payment_confirmation":
        success = await sendPaymentConfirmationNotification(customerId, data.order);
        break;

      case "order_shipped":
        success = await sendOrderShippedNotification(customerId, data.order);
        break;

      case "order_delivered":
        success = await sendOrderDeliveredNotification(customerId, data.order);
        break;

      case "order_cancelled":
        success = await sendOrderCancelledNotification(
          customerId,
          data.order,
          data.reason
        );
        break;

      case "refund_processed":
        success = await sendRefundProcessedNotification(
          customerId,
          data.order,
          data.refundAmount
        );
        break;

      case "promotion":
        success = await sendPromotionNotification(customerId, data.promotion);
        break;

      case "bulk":
        const result = await sendBulkNotification(
          data.message,
          data.onlyPromotionEnabled
        );
        return NextResponse.json({
          success: true,
          sent: result.sent,
          failed: result.failed,
        });

      default:
        return NextResponse.json(
          { error: "Invalid notification type" },
          { status: 400 }
        );
    }

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Notification sent successfully",
      });
    } else {
      return NextResponse.json(
        { error: "Failed to send notification" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Send notification error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send notification",
      },
      { status: 500 }
    );
  }
}
