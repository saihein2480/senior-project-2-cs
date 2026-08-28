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

    const ordersSnapshot = await adminDb.collection("onlineOrders").get();

    if (ordersSnapshot.empty) {
      return NextResponse.json({
        message: "No orders found",
        updated: 0,
      });
    }

    let updated = 0;
    let skipped = 0;
    const batch = adminDb.batch();

    ordersSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // Skip if already has paymentMethod
      if (data.paymentMethod) {
        skipped++;
        return;
      }

      // Determine payment method based on provider
      let paymentMethod = "scan"; // Default to scan for MMPAY orders

      // If it's a COD order (check if it has cod-related fields)
      if (
        data.deliveryStatus ||
        data.orderSource === "web_storefront" ||
        (data.status && data.status.toLowerCase().includes("cod"))
      ) {
        // This might be a COD order, but since COD orders are in transactions collection,
        // orders in onlineOrders should be QR scan payments
        paymentMethod = "scan";
      }

      // Update the document
      batch.update(doc.ref, {
        paymentMethod,
        updatedAt: new Date().toISOString(),
      });

      updated++;
    });

    if (updated > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      message: `Successfully updated ${updated} orders, skipped ${skipped} orders that already had payment methods`,
      updated,
      skipped,
      total: ordersSnapshot.docs.length,
    });
  } catch (error) {
    console.error("Error fixing payment methods:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fix payment methods",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message:
      "POST to this endpoint to update existing online orders with payment methods",
  });
}
