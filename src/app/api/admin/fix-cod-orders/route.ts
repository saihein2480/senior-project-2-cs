import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/firebase-admin";

export async function POST() {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    let codTransactionsFixed = 0;
    let onlineOrdersCreated = 0;
    let errors: string[] = [];

    // Step 1: Find all COD transactions
    const transactionsSnapshot = await adminDb
      .collection("transactions")
      .where("paymentMethod", "==", "cod")
      .get();

    console.log(`Found ${transactionsSnapshot.docs.length} COD transactions`);

    // Step 2: Process each COD transaction
    for (const txDoc of transactionsSnapshot.docs) {
      const txData = txDoc.data();
      const txId = txDoc.id;
      const transactionId = txData.transactionId || txId;

      try {
        // Check if online order already exists
        const onlineOrderRef = adminDb.collection("onlineOrders").doc(transactionId);
        const onlineOrderSnap = await onlineOrderRef.get();

        if (!onlineOrderSnap.exists) {
          // Create online order entry
          const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 46);
          const totalTHB = Number(txData.total || 0);
          const amountMmk = totalTHB * mmkRate;

          // Convert transaction items to cartItems format
          const cartItems = (txData.items || []).map((item: any) => ({
            productId: item.productId || item.stockId,
            productName: item.groupName || "Product",
            variantId: item.variantId,
            color: item.selectedColor,
            size: item.selectedSize,
            image: item.image,
            priceTHB: item.unitPrice || 0,
            quantity: item.quantity || 1,
          }));

          // Create online order data
          const onlineOrderData = {
            orderId: transactionId,
            transactionId,
            source: "online",
            customer: {
              uid: txData.customer?.uid || txData.customerUid,
              email: txData.customer?.email,
              displayName: txData.customer?.displayName,
              phone: txData.customer?.phone,
              address: txData.customer?.address,
            },
            cartItems,
            items: (txData.items || []).map((item: any) => ({
              name: item.groupName || "Product",
              amount: (item.unitPrice || 0) * (item.quantity || 1),
              quantity: item.quantity || 1,
            })),
            amountMmk,
            status: txData.deliveryStatus || txData.status || "pending",
            paymentStatus: txData.status === "completed" ? "SUCCESS" : "PENDING",
            paymentMethod: "cod",
            provider: "COD",
            deliveryStatus: txData.deliveryStatus || "pending",
            orderSource: "web_storefront",
            createdAt: txData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await onlineOrderRef.set(onlineOrderData);
          onlineOrdersCreated++;
          console.log(`Created online order for transaction ${transactionId}`);
        }

        // Step 3: Update transaction to ensure it has all required fields
        const updates: any = {
          updatedAt: new Date().toISOString(),
        };

        // Add orderStatus if missing
        if (!txData.orderStatus) {
          updates.orderStatus = txData.deliveryStatus || txData.status || "pending";
        }

        // Add paymentStatus if missing
        if (!txData.paymentStatus) {
          updates.paymentStatus = txData.status === "completed" ? "SUCCESS" : "PENDING";
        }

        // Ensure deliveryStatus exists
        if (!txData.deliveryStatus) {
          updates.deliveryStatus = "pending";
        }

        // Add amountMmk if missing (calculate from total)
        if (!txData.amountMmk && txData.total) {
          const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 46);
          updates.amountMmk = txData.total * mmkRate;
        }

        // Only update if there are changes
        if (Object.keys(updates).length > 1) { // More than just updatedAt
          await adminDb.collection("transactions").doc(txId).update(updates);
          codTransactionsFixed++;
          console.log(`Updated transaction ${transactionId} with fields:`, updates);
        }

      } catch (error) {
        const message = `Failed to process transaction ${transactionId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(message);
        errors.push(message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${transactionsSnapshot.docs.length} COD transactions`,
      codTransactionsFixed,
      onlineOrdersCreated,
      totalProcessed: transactionsSnapshot.docs.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error("Error fixing COD orders:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fix COD orders",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to fix existing COD orders",
    description: "This will create missing online order entries and sync status fields for all COD transactions",
  });
}
