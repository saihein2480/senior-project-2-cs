import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import { LoyaltyService } from "@/lib/loyaltyService";

/**
 * GET /api/loyalty/summary
 *   headers: Authorization: Bearer <firebase id token>
 *
 * The signed-in customer's points, coupons and redeemable packages. The
 * customer comes from the ID token only; a `customerId` query parameter (sent
 * by older clients) is ignored.
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

    const result = await LoyaltyService.getLoyaltySummary(uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to fetch loyalty summary" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("Error fetching loyalty summary:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch loyalty summary",
      },
      { status: 500 }
    );
  }
}
