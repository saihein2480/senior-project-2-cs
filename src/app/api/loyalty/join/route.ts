import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/loyalty/join
 *   headers: Authorization: Bearer <firebase id token>
 *   body: {} (a `customerId` from older clients is ignored)
 *
 * Join the membership program as the customer identified by the ID token.
 */
export async function POST(req: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    const customerId = await getUidFromAuthHeader(req.headers.get("authorization"));
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if loyalty program is enabled
    const settingsDoc = await adminDb
      .collection("business_settings")
      .doc("main")
      .get();

    const loyaltySettings = settingsDoc.data()?.loyaltySettings;

    if (!loyaltySettings || !loyaltySettings.enabled) {
      return NextResponse.json(
        { success: false, error: "Loyalty program is not enabled" },
        { status: 400 }
      );
    }

    // Get customer document
    const customerRef = adminDb.collection("customers").doc(customerId);
    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const customerData = customerDoc.data();

    // Check if already a member
    if (customerData?.isMember) {
      return NextResponse.json(
        { success: false, error: "You are already a member" },
        { status: 400 }
      );
    }

    // Generate Member ID (first 12 characters of uid in uppercase)
    const memberId = customerId.substring(0, 12).toUpperCase();

    // Update customer to join membership
    await customerRef.update({
      isMember: true,
      memberId,
      memberSince: FieldValue.serverTimestamp(),
      loyaltyPoints: 0,
      totalPointsEarned: 0,
      pointsHistory: [],
      coupons: [],
      activeCouponsCount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Successfully joined the membership program!",
      data: {
        memberId,
        loyaltyPoints: 0,
        totalPointsEarned: 0,
      },
    });
  } catch (error) {
    console.error("Join membership error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to join membership",
      },
      { status: 500 }
    );
  }
}
