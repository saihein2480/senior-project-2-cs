import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { transactionId, customerUid, reason, qrCodeImage } = body;

    // Validate required fields
    if (!transactionId || !customerUid) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the transaction
    const transactionsRef = adminDb.collection("transactions");
    const snapshot = await transactionsRef
      .where("transactionId", "==", transactionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const transactionDoc = snapshot.docs[0];
    const transaction = transactionDoc.data();

    // Verify customer ownership
    if (transaction.customer?.uid !== customerUid && transaction.customerUid !== customerUid) {
      return NextResponse.json(
        { error: "Unauthorized: Transaction does not belong to this customer" },
        { status: 403 }
      );
    }

    // Check if transaction is in a cancellable state
    const status = (transaction.status || "").toLowerCase();
    if (status === "cancelled" || status === "refunded") {
      return NextResponse.json(
        { error: "Transaction is already cancelled or refunded" },
        { status: 400 }
      );
    }

    // Check if already has a pending cancellation request
    if (transaction.cancellationRequest?.status === "pending") {
      return NextResponse.json(
        { error: "A cancellation request is already pending" },
        { status: 400 }
      );
    }

    // Check delivery status (can't cancel if already delivered)
    if (transaction.deliveryStatus === "delivered") {
      return NextResponse.json(
        { error: "Cannot cancel delivered orders. Please request a refund instead." },
        { status: 400 }
      );
    }

    // Validate QR code for Scan/Wallet payments
    const paymentMethod = (transaction.paymentMethod || "").toLowerCase();
    if ((paymentMethod === "scan" || paymentMethod === "wallet") && !qrCodeImage) {
      return NextResponse.json(
        { error: "QR code image is required for Scan/Wallet payment cancellations" },
        { status: 400 }
      );
    }

    // Create cancellation request
    const cancellationRequest: any = {
      status: "pending",
      reason: reason || "Customer requested cancellation",
      requestedAt: new Date().toISOString(),
      requestedBy: customerUid,
      customerEmail: transaction.customer?.email || "",
      customerName: transaction.customer?.displayName || "",
    };

    // Add QR code image if provided
    if (qrCodeImage) {
      cancellationRequest.qrCodeImage = qrCodeImage;
    }

    await transactionsRef.doc(transactionDoc.id).update({
      cancellationRequest,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create an owner-facing notification so it shows up in the POS
    // notification bell/page and routes to the cancellation requests page.
    try {
      await adminDb.collection("notifications").add({
        type: "cancellation_request",
        title: "Order Cancellation Request",
        message: `Customer requested to cancel order #${transactionId}`,
        link: "/owner/requests/cancellations",
        metadata: {
          transactionId: transactionDoc.id,
          orderId: transactionId,
        },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (notifError) {
      console.error("Error creating owner notification for cancellation request:", notifError);
      // Don't fail the request if the notification fails to be created
    }

    return NextResponse.json({
      success: true,
      message: "Cancellation request submitted successfully. Please wait for owner approval.",
    });
  } catch (error) {
    console.error("Error creating cancellation request:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create cancellation request",
      },
      { status: 500 }
    );
  }
}
