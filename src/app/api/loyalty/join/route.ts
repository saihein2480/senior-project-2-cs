import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/loyalty/join
 * Join the membership program
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId } = await req.json();

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
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
