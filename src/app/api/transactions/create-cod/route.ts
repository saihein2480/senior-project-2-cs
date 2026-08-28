import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { customer, items, subtotalTHB, discountTHB, taxTHB, totalTHB } = body;

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
    const tax = taxTHB || (subtotal - discount) * 0.07; // 7% tax
    const total = totalTHB || (subtotal - discount + tax);

    // Generate unique online order ID (different from transaction ID)
    const orderId = `COD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    
    // Get exchange rate for MMK conversion
    const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
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
      total, // Add THB total amount
      amountMmk,
      status: "pending",
      paymentStatus: "PENDING",
      paymentMethod: "cod",
      provider: "COD",
      deliveryStatus: "pending",
      orderSource: "web_storefront",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection("onlineOrders").doc(orderId).set(onlineOrderData);

    console.log(
      "COD transaction and online order created successfully:",
      transactionId,
      docRef.id
    );

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
