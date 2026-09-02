import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, couponId } = body;

    if (!customerId || !couponId) {
      return NextResponse.json(
        { success: false, error: "Customer ID and Coupon ID are required" },
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

    // Find the coupon
    const couponIndex = coupons.findIndex((c: any) => c.id === couponId);

    if (couponIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Coupon not found" },
        { status: 404 }
      );
    }

    const coupon = coupons[couponIndex];

    // Check if coupon is already used
    if (coupon.status === "used") {
      return NextResponse.json(
        { success: false, error: "Coupon has already been used" },
        { status: 400 }
      );
    }

    // Check if coupon is expired
    const now = new Date();
    const expiresAt = coupon.expiresAt?.toDate ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt);
    if (expiresAt < now) {
      return NextResponse.json(
        { success: false, error: "Coupon has expired" },
        { status: 400 }
      );
    }

    // Mark coupon as "in use" (we'll use a new status or flag)
    // For now, let's add an "inUse" flag
    coupons[couponIndex] = {
      ...coupon,
      inUse: true,
      markedForUseAt: new Date(),
    };

    // Update customer document
    await updateDoc(customerRef, {
      coupons,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Coupon marked for use. Apply it at checkout!",
      coupon: coupons[couponIndex],
    });
  } catch (error) {
    console.error("Error marking coupon for use:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to mark coupon for use",
      },
      { status: 500 }
    );
  }
}

// Cancel using a coupon
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const couponId = searchParams.get("couponId");

    if (!customerId || !couponId) {
      return NextResponse.json(
        { success: false, error: "Customer ID and Coupon ID are required" },
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

    // Find the coupon
    const couponIndex = coupons.findIndex((c: any) => c.id === couponId);

    if (couponIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Coupon not found" },
        { status: 404 }
      );
    }

    // Remove "inUse" flag
    const coupon = coupons[couponIndex];
    delete coupon.inUse;
    delete coupon.markedForUseAt;
    coupons[couponIndex] = coupon;

    // Update customer document
    await updateDoc(customerRef, {
      coupons,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Coupon unmarked",
    });
  } catch (error) {
    console.error("Error unmarking coupon:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to unmark coupon",
      },
      { status: 500 }
    );
  }
}
