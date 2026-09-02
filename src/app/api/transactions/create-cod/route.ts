import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { syncOnlineCustomerToPos } from "@/lib/updateCustomerStats";

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      customer,
      items,
      subtotalTHB,
      discountTHB,
      taxTHB,
      taxRatePercent,
      totalTHB,
      exchangeRate,
      couponCode,
      couponId,
      couponDiscountTHB,
    } = body;

    // Validate required fields
    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate sequential transaction ID
    const counterRef = adminDb.collection("counters").doc("transactionCounter");
    let transactionId: string;

    try {
      transactionId = await adminDb.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let newCount: number;
        if (!counterDoc.exists) {
          newCount = 1;
          transaction.set(counterRef, {
            count: newCount,
            lastUpdated: FieldValue.serverTimestamp(),
          });
        } else {
          newCount = (counterDoc.data()?.count || 0) + 1;
          transaction.update(counterRef, {
            count: newCount,
            lastUpdated: FieldValue.serverTimestamp(),
          });
        }

        return `TXN-${newCount.toString().padStart(13, "0")}`;
      });
    } catch (error) {
      console.error("Error generating transaction ID:", error);
      transactionId = `TXN-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;
    }

    // Use values from checkout page (already calculated with tax)
    const subtotal = subtotalTHB || items.reduce(
      (sum: number, item: any) =>
        sum + (item.discountedPriceTHB || item.unitPriceTHB) * item.quantity,
      0
    );
    const discount = discountTHB || 0;
    const tax = taxTHB || 0; // Use tax from checkout page, or 0 if not provided
    const taxRate = Number(taxRatePercent || 0); // Percentage actually applied
    const couponDiscount = Number(couponDiscountTHB || 0);
    const total =
      totalTHB || Math.max(0, subtotal - discount - couponDiscount) + tax;

    // Generate unique online order ID (different from transaction ID)
    const orderId = `COD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Prefer the rate the customer actually saw at checkout.
    const mmkRate =
      Number(exchangeRate || 0) > 0
        ? Number(exchangeRate)
        : Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
    const amountMmk = mmkRate > 0 ? total * mmkRate : total;

    // Prepare transaction data for Firebase
    const transactionData = {
      transactionId,
      onlineOrderId: orderId, // Link to online order
      source: "online", // Mark as online transaction for filtering
      customer: {
        uid: customer.uid, // Include UID in customer object for purchase history filtering
        email: customer.email,
        displayName: customer.displayName,
        phone: customer.phone,
        address: customer.address,
        customerType: "online",
      },
      items: items.map((item: any) => ({
        id: `${item.productId}_${item.variantId}_${item.size}`,
        productId: item.productId,
        stockId: item.productId, // Use productId as stockId for web orders
        groupName: item.productName,
        selectedColor: item.color,
        selectedSize: item.size,
        colorCode: "", // Will be populated from product data
        image: item.image,
        unitPrice: item.discountedPriceTHB || item.unitPriceTHB,
        originalPrice: item.unitPriceTHB,
        discountedPrice: item.discountedPriceTHB,
        quantity: item.quantity,
      })),
      subtotal,
      tax,
      taxRate,
      discount,
      total,
      amountPaid: total, // For COD, amount paid equals total (will be paid on delivery)
      amountMmk, // Add MMK amount for display
      change: 0,
      paymentMethod: "cod",
      status: "pending", // COD orders start as pending
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
      branchName: "Online Store",
      sellingCurrency: "THB",
      exchangeRate: mmkRate || 1,
      sellingTotal: amountMmk,
      discountBreakdown: {
        wholesaleSavings: 0,
        groupPercentSavings: 0,
        groupFixedTotal: 0,
        variantPercentSavings: 0,
        variantFixedTotal: 0,
        cartDiscount: discount,
        cartDiscountPercent: 0,
      },
      // Coupon information
      ...(couponCode && {
        couponCode,
        appliedCouponCode: couponCode,
        couponId,
        couponDiscountTHB: couponDiscountTHB || 0,
      }),
      // Delivery tracking fields
      deliveryStatus: "pending", // pending, confirmed, shipped, delivered, cancelled
      orderSource: "web_storefront",
      customerUid: customer.uid,
    };

    // Save transaction to Firebase
    const docRef = await adminDb.collection("transactions").add(transactionData);

    // Convert items to cartItems format for onlineOrders
    const cartItems = items.map((item: any) => ({
      productId: item.productId,
      productName: item.productName,
      variantId: item.variantId,
      color: item.color,
      size: item.size,
      image: item.image,
      priceTHB: item.discountedPriceTHB || item.unitPriceTHB,
      quantity: item.quantity,
    }));

    const onlineOrderData = {
      orderId,
      transactionId, // Link to the transaction
      source: "online",
      customer: {
        uid: customer.uid,
        email: customer.email,
        displayName: customer.displayName,
        phone: customer.phone,
        address: customer.address,
      },
      cartItems,
      items: items.map((item: any) => ({
        name: item.productName,
        amount: (item.discountedPriceTHB || item.unitPriceTHB) * item.quantity,
        quantity: item.quantity,
      })),
      // Financial breakdown
      subtotal,
      tax,
      taxRate,
      discount,
      total, // Add THB total amount
      amountMmk,
      exchangeRate: mmkRate,
      status: "pending",
      paymentStatus: "PENDING",
      paymentMethod: "cod",
      provider: "COD",
      paymentProvider: "COD",
      // Coupon information
      ...(couponCode && {
        couponCode,
        appliedCouponCode: couponCode,
        couponId,
        couponDiscountTHB: couponDiscountTHB || 0,
      }),
      deliveryStatus: "pending",
      orderSource: "web_storefront",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection("onlineOrders").doc(orderId).set(onlineOrderData);

    // Sync customer to POS system's customers collection
    if (customer.uid) {
      await syncOnlineCustomerToPos(customer.uid);
    }

    console.log(
      "COD transaction and online order created successfully:",
      transactionId,
      docRef.id
    );

    // Mark coupon as used and deduct points if a coupon was applied
    if (customer.uid && couponId) {
      try {
        const { CouponService } = await import("@/lib/couponService");
        const couponUsed = await CouponService.useCouponAdmin(
          adminDb,
          customer.uid,
          couponId,
          transactionId
        );

        if (couponUsed) {
          console.log("Coupon marked as used and points deducted:", {
            customerId: customer.uid,
            couponId,
            couponCode,
          });
        } else {
          console.warn("Failed to mark coupon as used, but order will proceed");
        }
      } catch (couponError) {
        console.error("Error marking coupon as used:", couponError);
        // Don't fail the order if coupon update fails
      }
    }

    // Award loyalty points for COD order
    if (customer.uid) {
      try {
        const { LoyaltyService } = await import("@/lib/loyaltyService");
        const loyaltyResult = await LoyaltyService.awardPoints({
          customerId: customer.uid,
          transactionId,
          transactionAmount: total,
          source: 'online',
          description: `Online COD order ${orderId}`,
        });

        if (loyaltyResult.success) {
          console.log("Loyalty points awarded for COD order:", {
            points: loyaltyResult.pointsAwarded,
            newTotal: loyaltyResult.newTotalPoints,
            coupons: loyaltyResult.couponsGenerated.length,
          });
        }
      } catch (loyaltyError) {
        // Don't fail the order if loyalty fails
        console.error("Error awarding loyalty points for COD:", loyaltyError);
      }
    }

    return NextResponse.json({
      success: true,
      transactionId,
      firestoreId: docRef.id,
      orderId,
      message: "COD order created successfully",
    });
  } catch (error) {
    console.error("Error creating COD transaction:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create COD order",
      },
      { status: 500 }
    );
  }
}
