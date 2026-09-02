import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

/**
 * GET /api/loyalty/active-coupon
 * Get the customer's currently "in use" coupon for checkout
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (!db) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get customer document
    const customerRef = doc(db, "customers", customerId);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const customerData = customerSnap.data();
    const coupons = customerData.coupons || [];

    // Find the "in use" coupon
    const activeCoupon = coupons.find((c: any) => c.inUse === true && c.status === "active");

    if (!activeCoupon) {
      return NextResponse.json({
        success: true,
        coupon: null,
        message: "No active coupon selected for use",
      });
    }

    // Check if coupon is expired
    const now = new Date();
    const expiresAt = activeCoupon.expiresAt?.toDate
      ? activeCoupon.expiresAt.toDate()
      : new Date(activeCoupon.expiresAt);

    if (expiresAt < now) {
      return NextResponse.json({
        success: false,
        error: "Selected coupon has expired",
      });
    }

    return NextResponse.json({
      success: true,
      coupon: {
        id: activeCoupon.id,
        code: activeCoupon.code,
        discountType: activeCoupon.discountType,
        discountValue: activeCoupon.discountValue,
        expiresAt: activeCoupon.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error fetching active coupon:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch active coupon",
      },
      { status: 500 }
    );
  }
}
