import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * API endpoint to retroactively deduct points for coupons that were used
 * before the pointsCost feature was implemented
 * 
 * Usage: POST /api/admin/fix-used-coupon-points
 * Body: { customerId: "xxx", confirm: true }
 */
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { customerId, confirm } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // Get customer data
    const customerRef = adminDb.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const customerData = customerSnap.data();
    if (!customerData) {
      return NextResponse.json(
        { error: "Customer data is empty" },
        { status: 404 }
      );
    }

    const coupons = [...(customerData.coupons || [])];
    const currentPoints = customerData.loyaltyPoints || 0;

    // Loyalty settings live in business_settings/main (settings/loyalty does not
    // exist, which is why this previously always fell back to a hardcoded 10).
    const settingsSnap = await adminDb
      .collection("business_settings")
      .doc("main")
      .get();
    const defaultPointsCost =
      settingsSnap.data()?.loyaltySettings?.pointsForCoupon;

    // Only process used coupons that have not already been reconciled, so
    // running this twice cannot deduct the same points again.
    const pendingIndexes: number[] = [];
    coupons.forEach((c: any, index: number) => {
      if (c.status === "used" && !c.pointsReconciledAt) {
        pendingIndexes.push(index);
      }
    });

    let totalPointsToDeduct = 0;
    const couponDetails = pendingIndexes.map((index) => {
      const coupon = coupons[index];
      const pointsCost =
        typeof coupon.pointsCost === "number"
          ? coupon.pointsCost
          : typeof defaultPointsCost === "number"
            ? defaultPointsCost
            : 0;
      totalPointsToDeduct += pointsCost;

      return {
        code: coupon.code,
        pointsCost,
        usedAt: coupon.usedAt,
        transaction: coupon.usedInTransaction,
      };
    });

    const alreadyReconciled = coupons.filter(
      (c: any) => c.status === "used" && c.pointsReconciledAt
    ).length;

    const newPoints = Math.max(0, currentPoints - totalPointsToDeduct);

    // If not confirmed, return preview
    if (!confirm) {
      return NextResponse.json({
        success: true,
        preview: true,
        customerInfo: {
          displayName: customerData.displayName,
          email: customerData.email,
          currentPoints,
        },
        calculation: {
          currentPoints,
          totalPointsToDeduct,
          newBalance: newPoints,
          usedCouponsCount: couponDetails.length,
          skippedAlreadyReconciled: alreadyReconciled,
        },
        coupons: couponDetails,
        message: "Add 'confirm: true' to apply changes"
      });
    }

    // Stamp the coupons we are deducting for so a repeat call skips them.
    const reconciledAt = new Date();
    pendingIndexes.forEach((index) => {
      coupons[index] = { ...coupons[index], pointsReconciledAt: reconciledAt };
    });

    // Apply the fix
    await customerRef.update({
      coupons,
      loyaltyPoints: newPoints,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      applied: true,
      customerInfo: {
        displayName: customerData.displayName,
        email: customerData.email,
      },
      changes: {
        oldPoints: currentPoints,
        pointsDeducted: totalPointsToDeduct,
        newPoints,
        couponsProcessed: couponDetails.length,
        skippedAlreadyReconciled: alreadyReconciled,
      },
      coupons: couponDetails,
      message: `Successfully deducted ${totalPointsToDeduct} points for ${couponDetails.length} used coupon(s)`
    });

  } catch (error) {
    console.error("Error fixing used coupon points:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fix points",
      },
      { status: 500 }
    );
  }
}
