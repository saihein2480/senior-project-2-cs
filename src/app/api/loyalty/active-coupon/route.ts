import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";

type StoredCoupon = {
  id?: string;
  code?: string;
  discountType?: string;
  discountValue?: number;
  expiresAt?: unknown;
  inUse?: boolean;
  status?: string;
};

/**
 * GET /api/loyalty/active-coupon
 *   headers: Authorization: Bearer <firebase id token>
 *
 * Get the signed-in customer's currently "in use" coupon for checkout. The
 * customer comes from the ID token only; a `customerId` query parameter is
 * ignored.
 */
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    const uid = await getUidFromAuthHeader(request.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get customer document
    const customerSnap = await adminDb.collection("customers").doc(uid).get();

    if (!customerSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const customerData = customerSnap.data() || {};
    const coupons: StoredCoupon[] = Array.isArray(customerData.coupons)
      ? customerData.coupons
      : [];

    // Find the "in use" coupon
    const activeCoupon = coupons.find(
      (c) => c?.inUse === true && c?.status === "active",
    );

    if (!activeCoupon) {
      return NextResponse.json({
        success: true,
        coupon: null,
        message: "No active coupon selected for use",
      });
    }

    // Check if coupon is expired
    const now = new Date();
    const rawExpiry = activeCoupon.expiresAt;
    const expiresAt =
      rawExpiry &&
      typeof rawExpiry === "object" &&
      typeof (rawExpiry as { toDate?: unknown }).toDate === "function"
        ? (rawExpiry as { toDate: () => Date }).toDate()
        : new Date(rawExpiry as string | number | Date);

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
