import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { LoyaltyService } from "@/lib/loyaltyService";

export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    // Get customer ID from query params (passed from client)
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Customer ID required" },
        { status: 400 }
      );
    }

    const result = await LoyaltyService.getLoyaltySummary(customerId);

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
