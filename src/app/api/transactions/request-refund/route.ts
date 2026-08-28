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
    const { transactionId, customerUid, reason, items, qrCodeImage, itemPhotos } = body;

    // Validate required fields
    if (!transactionId || !customerUid || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate that at least one item is being refunded
    const hasItems = items.some((item: any) => item.quantity > 0);
    if (!hasItems) {
      return NextResponse.json(
        { error: "Please select at least one item to refund" },
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

    // Check if this is a scan/wallet payment and QR code is required
    // COD orders that have been delivered and paid also need to be handled
    const isCODPaidOrder = transaction.paymentMethod === "cod" && 
      (transaction.deliveryStatus === "delivered" || transaction.status === "completed");
    
    if ((transaction.paymentMethod === "scan" || transaction.paymentMethod === "wallet") && !qrCodeImage) {
      return NextResponse.json(
        { error: "QR code image is required for Scan/Wallet payment refunds" },
        { status: 400 }
      );
    }

    // Check if transaction is in a refundable state
    const status = (transaction.status || "").toLowerCase();
    const isPaidOrder = transaction.paymentMethod === "cash" || 
                        transaction.paymentMethod === "scan" || 
                        transaction.paymentMethod === "wallet" ||
                        isCODPaidOrder; // Include delivered COD orders
    const hasCancellationRefund = transaction.cancellationRefund !== undefined;
    
    // Block refund if already refunded
    if (status === "refunded") {
      return NextResponse.json(
        { error: "Transaction is already refunded" },
        { status: 400 }
      );
    }
    
    // For cancelled orders, only allow refund if it's a paid order without cancellationRefund
    if (status === "cancelled") {
      if (!isPaidOrder) {
        return NextResponse.json(
          { error: "Cannot request refund for cancelled unpaid orders" },
          { status: 400 }
        );
      }
      if (hasCancellationRefund) {
        return NextResponse.json(
          { error: "Cancellation refund already processed. Cannot request additional refund." },
          { status: 400 }
        );
      }
      // Allow refund request for cancelled paid orders without cancellationRefund
    }

    // Check if already has a pending refund request
    if (transaction.refundRequest?.status === "pending") {
      return NextResponse.json(
        { error: "A refund request is already pending" },
        { status: 400 }
      );
    }

    // Determine refund type based on order status
    let refundType: "cancellation" | "return";
    
    if (status === "cancelled") {
      refundType = "cancellation"; // Not yet delivered, order was cancelled
    } else if (
      transaction.deliveryStatus === "delivered" || 
      status === "delivered" ||
      status === "completed" // Completed orders are typically delivered
    ) {
      refundType = "return"; // Already delivered, customer wants to return items
    } else {
      return NextResponse.json(
        { error: "Can only request refund for delivered orders or cancelled paid orders" },
        { status: 400 }
      );
    }

    // Validate refund items against original transaction items
    const transactionItems = transaction.items || [];
    for (const refundItem of items) {
      if (refundItem.quantity <= 0) continue;

      const originalItem = transactionItems.find(
        (ti: any) => ti.id === refundItem.id || ti.productId === refundItem.productId
      );

      if (!originalItem) {
        return NextResponse.json(
          { error: `Item ${refundItem.id} not found in transaction` },
          { status: 400 }
        );
      }

      // Check if requesting more than purchased
      const alreadyRefunded = (transaction.refundedItems || [])
        .filter((ri: any) => ri.id === refundItem.id)
        .reduce((sum: number, ri: any) => sum + (ri.quantity || 0), 0);

      const available = (originalItem.quantity || 0) - alreadyRefunded;

      if (refundItem.quantity > available) {
        return NextResponse.json(
          {
            error: `Cannot refund ${refundItem.quantity} of ${originalItem.groupName}. Only ${available} available.`,
          },
          { status: 400 }
        );
      }
    }

    // Sanitize items array - only keep serializable fields
    const sanitizedItems = items
      .filter((item: any) => item.quantity > 0)
      .map((item: any) => ({
        id: item.id || "",
        productId: item.productId || "",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        groupName: item.groupName || "",
      }));

    // Sanitize item photos array - ensure all are strings
    const sanitizedPhotos = Array.isArray(itemPhotos) 
      ? itemPhotos.filter((photo: any) => typeof photo === 'string')
      : [];

    // Create refund request
    await transactionsRef.doc(transactionDoc.id).update({
      refundRequest: {
        type: refundType, // "cancellation" or "return"
        status: "pending",
        reason: reason || "Customer requested refund",
        items: sanitizedItems,
        requestedAt: new Date().toISOString(),
        requestedBy: customerUid,
        customerEmail: transaction.customer?.email || "",
        customerName: transaction.customer?.displayName || "",
        qrCodeImage: qrCodeImage || null, // Store QR code image
        itemPhotos: sanitizedPhotos, // Store item photos for return requests
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Refund request submitted successfully. Please wait for owner approval.",
    });
  } catch (error) {
    console.error("Error creating refund request:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create refund request",
      },
      { status: 500 }
    );
  }
}
