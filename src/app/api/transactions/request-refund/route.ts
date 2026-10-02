import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { exceedsDocBudget } from "@/lib/documentBudget";

/**
 * POST /api/transactions/request-refund
 *   headers: Authorization: Bearer <firebase id token>
 *   body: {
 *     transactionId,
 *     items: Array<{ id, productId?, groupName?, quantity }>,
 *     reason?, qrCodeImage?, itemPhotos?
 *   }
 *
 * The requesting customer is taken from the ID token only; a `customerUid` in
 * the body (sent by older clients) is ignored. Item prices and names are read
 * from the stored transaction, never from the request: a client-supplied
 * `unitPrice` used to be stored as-is on the refund request the owner reviews.
 */

/** The fields of a stored (or requested) line this route reads. */
type TransactionItem = {
  id?: unknown;
  productId?: unknown;
  groupName?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
};

/**
 * Match a requested refund line to the line it refers to on the transaction.
 *
 * Same keys the route has always used — the line `id`, then `productId` — but
 * an exact `id` match wins over a product match, and a key only matches when it
 * is actually present. Previously an item with no `productId` matched the
 * first line that also had none (`undefined === undefined`).
 *
 * The storefront sends the line's `groupName` as `id`, which is also how the
 * POS pairs requested items with transaction lines, so the name is used to pick
 * between several lines of one product and as a last resort.
 */
function findOriginalItem(
  transactionItems: TransactionItem[],
  refundItem: TransactionItem,
): TransactionItem | undefined {
  const asKey = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";

  const id = asKey(refundItem?.id);
  const productId = asKey(refundItem?.productId);
  const names = [asKey(refundItem?.groupName), id].filter(Boolean);
  const sameName = (ti: TransactionItem) =>
    !!ti?.groupName && names.includes(String(ti.groupName));

  if (id) {
    const byId = transactionItems.find((ti) => asKey(ti?.id) === id);
    if (byId) return byId;
  }

  if (productId) {
    const byProduct = transactionItems.filter(
      (ti) => asKey(ti?.productId) === productId,
    );
    if (byProduct.length > 0) return byProduct.find(sameName) ?? byProduct[0];
  }

  return names.length > 0 ? transactionItems.find(sameName) : undefined;
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const customerUid = await getUidFromAuthHeader(
      request.headers.get("authorization"),
    );
    if (!customerUid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { transactionId, reason, items, qrCodeImage, itemPhotos } = body ?? {};

    // Validate required fields
    if (
      !transactionId ||
      (typeof transactionId !== "string" && typeof transactionId !== "number") ||
      !items ||
      !Array.isArray(items)
    ) {
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

    // Never overwrite a request the owner has not decided on yet.
    if (transaction.refundRequest?.status === "pending") {
      return NextResponse.json(
        { error: "A refund request is already pending" },
        { status: 409 }
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

    // Validate refund items against original transaction items, remembering
    // which stored line each one refers to so its price comes from there.
    const transactionItems: TransactionItem[] = Array.isArray(transaction.items)
      ? transaction.items
      : [];
    const sanitizedItems: Array<{
      id: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      groupName: string;
    }> = [];

    for (const refundItem of items) {
      if (!(refundItem?.quantity > 0)) continue;

      const originalItem = findOriginalItem(transactionItems, refundItem);

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

      const available = (Number(originalItem.quantity) || 0) - alreadyRefunded;

      if (refundItem.quantity > available) {
        return NextResponse.json(
          {
            error: `Cannot refund ${refundItem.quantity} of ${originalItem.groupName}. Only ${available} available.`,
          },
          { status: 400 }
        );
      }

      // Only serializable fields. `id` keeps the client's value because the POS
      // pairs requested items with transaction lines by `id` or `groupName`;
      // price and name are the stored ones.
      sanitizedItems.push({
        id:
          typeof refundItem.id === "string" && refundItem.id
            ? refundItem.id
            : String(originalItem.id ?? ""),
        productId: String(originalItem.productId ?? refundItem.productId ?? ""),
        quantity: Number(refundItem.quantity) || 0,
        unitPrice: Number(originalItem.unitPrice) || 0,
        groupName: String(originalItem.groupName ?? ""),
      });
    }

    // Firestore caps a document at 1MiB, and this request embeds the QR image
    // Sanitize item photos array - ensure all are strings
    const sanitizedPhotos = Array.isArray(itemPhotos) 
      ? itemPhotos.filter((photo: any) => typeof photo === 'string')
      : [];

    const refundRequest = {
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
    };

    // This request embeds a QR image plus up to five item photos as base64 on
    // the transaction document, which Firestore caps at 1MiB. Counting the
    // already-stored fields matters because an order can also carry a
    // cancellation request with its own image. Without this the write fails as
    // "Property refundRequest contains an invalid nested entity".
    if (exceedsDocBudget(transaction, "refundRequest", refundRequest)) {
      return NextResponse.json(
        {
          error:
            "The uploaded photos are too large to attach to this order. Please upload fewer or smaller photos.",
        },
        { status: 413 }
      );
    }

    // Create refund request. The pending check is repeated inside a transaction
    // so two submissions racing each other cannot both write.
    const db = adminDb;
    const docRef = transactionsRef.doc(transactionDoc.id);
    const written = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(docRef);
      if (fresh.data()?.refundRequest?.status === "pending") return false;
      tx.update(docRef, {
        refundRequest,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!written) {
      return NextResponse.json(
        { error: "A refund request is already pending" },
        { status: 409 }
      );
    }

    // Create an owner-facing notification so it shows up in the POS
    // notification bell/page and routes to the return requests page.
    try {
      await adminDb.collection("notifications").add({
        type: "refund_request",
        title: "Return Request",
        message: `Customer requested a return for order #${transactionId}`,
        link: "/owner/requests/refunds",
        metadata: {
          transactionId: transactionDoc.id,
          orderId: transactionId,
        },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (notifError) {
      console.error("Error creating owner notification for refund request:", notifError);
      // Don't fail the request if the notification fails to be created
    }

    // Acknowledge the request to the customer so they are not left wondering
    // whether it went through. Best-effort; the request is already saved.
    try {
      const { notifyCustomer } = await import("@/lib/notifications/dispatch");
      await notifyCustomer({
        customerId: customerUid,
        event: {
          type: "refund_requested",
          order: {
            orderRef: String(transactionId),
            totalAmount: Number(transaction.total || 0),
            paymentMethod: transaction.paymentMethod || "",
            paymentStatus: transaction.paymentStatus || "",
          },
          // No figure yet: the amount is settled when the owner inspects the
          // returned items and approves the refund.
          reason: typeof reason === "string" ? reason : undefined,
        },
      });
    } catch (notifyError) {
      console.error("Error acknowledging return request to customer:", notifyError);
    }

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
