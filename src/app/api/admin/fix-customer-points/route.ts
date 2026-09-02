import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Quick fix to set customer points to 0 when coupon was already used
 * Usage: GET /api/admin/fix-customer-points?customerId=xxx&points=0
 */
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get("customerId");
    const points = searchParams.get("points");

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (points === null) {
      return NextResponse.json(
        { error: "Points value is required" },
        { status: 400 }
      );
    }

    const newPoints = parseInt(points, 10);

    if (isNaN(newPoints) || newPoints < 0) {
      return NextResponse.json(
        { error: "Invalid points value. Must be a positive number." },
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
    const oldPoints = customerData?.loyaltyPoints || 0;

    // Update points
    await customerRef.update({
      loyaltyPoints: newPoints,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Points updated from ${oldPoints} to ${newPoints}`,
      customerInfo: {
        customerId,
        displayName: customerData?.displayName,
        email: customerData?.email,
        oldPoints,
        newPoints,
      }
    });

  } catch (error) {
    console.error("Error fixing customer points:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fix points",
      },
      { status: 500 }
    );
  }
}
