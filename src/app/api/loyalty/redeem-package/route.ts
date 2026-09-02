import { NextRequest, NextResponse } from "next/server";
import { LoyaltyService } from "@/lib/loyaltyService";

/**
 * POST /api/loyalty/redeem-package
 *
 * Turn one of the owner's reward packages into a coupon for this customer.
 * The service enforces that the customer has enough unreserved points.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, packageId } = body ?? {};

    if (!customerId || !packageId) {
      return NextResponse.json(
        { success: false, error: "Customer ID and package ID are required" },
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
