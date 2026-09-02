import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    const settingsDoc = await adminDb
      .collection("business_settings")
      .doc("main")
      .get();

    const DEFAULT_LOYALTY_SETTINGS = {
      enabled: false,
      minimumSpendAmount: 500,
      pointsPerPurchase: 1,
      couponPackages: [],
      pointsForCoupon: 10,
      couponDiscountType: "percentage",
      couponDiscountValue: 10,
      couponValidityDays: 30,
    };

    if (!settingsDoc.exists) {
      return NextResponse.json({
        success: true,
        settings: DEFAULT_LOYALTY_SETTINGS,
      });
    }

    const data = settingsDoc.data();
    const stored = data?.loyaltySettings;

    if (!stored) {
      return NextResponse.json({
        success: true,
        settings: DEFAULT_LOYALTY_SETTINGS,
      });
    }

    // Always expose couponPackages so the client can render reward tiers, even
    // for owners who only ever saved the legacy single-coupon fields.
    return NextResponse.json({
      success: true,
      settings: {
        ...stored,
        couponPackages: Array.isArray(stored.couponPackages)
          ? stored.couponPackages
          : [],
      },
    });
  } catch (error) {
    console.error("Error fetching loyalty settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch settings",
      },
      { status: 500 }
    );
  }
}
