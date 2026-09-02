import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * TEST ENDPOINT: Add coupon data to an existing transaction for testing
 * DELETE THIS FILE AFTER TESTING
 * 
 * Usage: GET /api/test/add-coupon-to-order?transactionId=TXN-0000000000100
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get("transactionId");

    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId parameter is required" },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    // Find the transaction
    const transactionsRef = adminDb.collection("transactions");
    const querySnapshot = await transactionsRef
      .where("transactionId", "==", transactionId)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return NextResponse.json(
        { error: `Transaction not found: ${transactionId}` },
        { status: 404 }
      );
    }

    const transactionDoc = querySnapshot.docs[0];
    const transactionData = transactionDoc.data();

    // Add test coupon data
    const couponData = {
      couponCode: "SAVE10",
      appliedCouponCode: "SAVE10",
      couponId: "test-coupon-123",
      couponDiscountTHB: 22.00, // 10% of 220 THB
    };

    // Update the transaction
    await transactionDoc.ref.update(couponData);

    return NextResponse.json({
      success: true,
      message: "Coupon data added to transaction",
      transactionId,
      firestoreId: transactionDoc.id,
      couponData,
      totalBefore: transactionData.total,
      note: "Refresh the purchase history page to see the coupon information",
    });
  } catch (error) {
    console.error("Error adding coupon to transaction:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to add coupon",
      },
      { status: 500 }
    );
  }
}
