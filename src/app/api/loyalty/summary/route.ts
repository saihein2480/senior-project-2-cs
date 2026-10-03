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
      // The service returns raw exception text on unexpected failures; only
      // its own fixed messages are passed through.
      const safeMessages = new Set([
        "Customer not found",
        "Firebase Admin is not configured",
      ]);
      const message =
        result.error && safeMessages.has(result.error)
          ? result.error
          : "Failed to fetch loyalty summary";
      if (message !== result.error) {
        console.error("Loyalty summary failed:", result.error);
      }
      return NextResponse.json(
        { success: false, error: message },
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
      { success: false, error: "Failed to fetch loyalty summary" },
      { status: 500 }
    );
  }
}
