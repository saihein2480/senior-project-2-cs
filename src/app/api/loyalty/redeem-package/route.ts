import { NextRequest, NextResponse } from "next/server";
import { getUidFromAuthHeader } from "@/lib/firebase-admin";
import { LoyaltyService } from "@/lib/loyaltyService";

/**
 * POST /api/loyalty/redeem-package
 *   headers: Authorization: Bearer <firebase id token>
 *   body: { packageId }
 *
 * Turn one of the owner's reward packages into a coupon for the customer
 * identified by the ID token (a `customerId` in the body is ignored).
 * The service enforces that the customer has enough unreserved points.
 */
export async function POST(request: NextRequest) {
  try {
    const customerId = await getUidFromAuthHeader(
      request.headers.get("authorization"),
    );
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const packageId =
      typeof body?.packageId === "string" ? body.packageId.trim() : "";

    if (!packageId) {
      return NextResponse.json(
        { success: false, error: "Package ID is required" },
        { status: 400 },
      );
    }

    const result = await LoyaltyService.redeemPackage({
      customerId,
      packageId,
    });

    if (!result.success) {
      // Affordability and lookup failures are the caller's problem, not a fault.
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      coupon: result.coupon,
      message: `Reward redeemed. Coupon ${result.coupon?.code} is ready to use.`,
    });
  } catch (error) {
    console.error("Error in POST /api/loyalty/redeem-package:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to redeem reward",
      },
      { status: 500 },
    );
  }
}
