import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { syncOnlineCustomerToPos } from "@/lib/updateCustomerStats";
import { createCodOrderWithStock } from "@/lib/onlineStockService";
import {
  assertCustomerSawQuote,
  isQuoteError,
  orderLineRecords,
  parseRequestedLines,
  quoteErrorBody,
  quoteOrder,
} from "@/lib/server/orderQuote";

/**
 * POST /api/transactions/create-cod
 *   headers: Authorization: Bearer <firebase id token>
 *   body: {
 *     lines: Array<{ productId, variantId?, color?, size?, quantity }>,
 *     couponId?: string | null,
 *     // What the checkout page showed; the order is refused if these differ
 *     // from the server's own figures.
 *     deliveryFeeTHB: number, expectedTotalTHB: number,
 *   }
 *
 * The customer is the caller identified by the ID token. Prices, promotions,
 * the coupon's value, tax, rate, delivery fee, and the customer's name, phone
 * and address all come from Firestore (see lib/server/orderQuote.ts). Before
 * this, every one of them was taken from the request body.
 */
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const uid = await getUidFromAuthHeader(request.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = ((await request.json().catch(() => null)) || {}) as Record<
      string,
      unknown
    >;

    // Price first, so an invalid or out-of-date order does not burn a receipt
    // number from the counter below.
    let quote: Awaited<ReturnType<typeof quoteOrder>>;
    try {
      quote = await quoteOrder(adminDb, {
        uid,
        lines: parseRequestedLines(body.lines),
        couponId: typeof body.couponId === "string" ? body.couponId : null,
      });
      assertCustomerSawQuote(
        quote.pricing,
        { deliveryFee: body.deliveryFeeTHB, totalTHB: body.expectedTotalTHB },
        // COD is settled in cash on delivery; the MMK figure is display only.
        { checkMmk: false },
      );
    } catch (error) {
      if (isQuoteError(error)) {
        return NextResponse.json(quoteErrorBody(error), {
          status: error.status,
        });
      }
      throw error;
    }

    const { customer, pricing, coupon } = quote;
    const cartItems = orderLineRecords(quote);

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

    // Generate unique online order ID (different from transaction ID)
    const orderId = `COD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const couponFields = coupon
      ? {
          couponCode: coupon.code,
          appliedCouponCode: coupon.code,
          couponId: coupon.id,
          couponDiscountTHB: pricing.couponDiscountTHB,
        }
      : {};

    // Prepare transaction data for Firebase
    const transactionData = {
      transactionId,
      onlineOrderId: orderId, // Link to online order
      source: "online", // Mark as online transaction for filtering
      customer: { ...customer, customerType: "online" },
      items: cartItems.map((line) => ({
        id: `${line.productId}_${line.variantId}_${line.size}`,
        productId: line.productId,
        stockId: line.productId, // Use productId as stockId for web orders
        groupName: line.productName,
        selectedColor: line.color,
        selectedSize: line.size,
        colorCode: "", // Will be populated from product data
        image: line.image,
        quantity: line.quantity,
        unitPrice: line.priceTHB,
        originalPrice: line.originalPriceTHB,
        discountedPrice: line.priceTHB,
        lineDiscount: line.lineDiscountTHB,
        promotionId: line.promotionId,
        promotionName: line.promotionName,
        promotionDiscountType: line.promotionDiscountType,
        promotionDiscountValue: line.promotionDiscountValue,
      })),
      subtotal: pricing.subtotalTHB,
      tax: pricing.taxTHB,
      taxRate: pricing.taxRatePercent,
      discount: pricing.promotionDiscountTHB,
      deliveryFee: pricing.deliveryFeeTHB, // already included in `total`
      total: pricing.totalTHB,
      appliedPromotions: pricing.appliedPromotions,
      amountPaid: pricing.totalTHB, // For COD, amount paid equals total (will be paid on delivery)
      amountMmk: pricing.totalMMK,
      change: 0,
      paymentMethod: "cod",
      status: "pending", // COD orders start as pending
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
      branchName: "Online Store",
      sellingCurrency: "THB",
      exchangeRate: pricing.mmkRate,
      sellingTotal: pricing.totalMMK,
      pricedBy: "server",
      discountBreakdown: {
        wholesaleSavings: 0,
        groupPercentSavings: 0,
        groupFixedTotal: 0,
        variantPercentSavings: 0,
        variantFixedTotal: 0,
        cartDiscount: pricing.promotionDiscountTHB,
        cartDiscountPercent: 0,
      },
      ...couponFields,
      // Delivery tracking fields
      deliveryStatus: "pending", // pending, confirmed, shipped, delivered, cancelled
      orderSource: "web_storefront",
      customerUid: uid,
    };

    const onlineOrderData = {
      orderId,
      transactionId, // Link to the transaction
      source: "online",
      customer,
      cartItems,
      items: cartItems.map((line) => ({
        name: line.productName,
        amount: line.priceTHB * line.quantity,
        quantity: line.quantity,
      })),
      // Financial breakdown
      subtotal: pricing.subtotalTHB,
      tax: pricing.taxTHB,
      taxRate: pricing.taxRatePercent,
      discount: pricing.promotionDiscountTHB,
      deliveryFee: pricing.deliveryFeeTHB,
      appliedPromotions: pricing.appliedPromotions,
      total: pricing.totalTHB, // THB total amount, including the delivery fee
      amountMmk: pricing.totalMMK,
      exchangeRate: pricing.mmkRate,
      pricedBy: "server",
      status: "pending",
      paymentStatus: "PENDING",
      paymentMethod: "cod",
      provider: "COD",
      paymentProvider: "COD",
      ...couponFields,
      deliveryStatus: "pending",
      orderSource: "web_storefront",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Take the stock and write the transaction and the online order in one
    // transaction. If another buyer got the last unit first, nothing is
    // written and the customer is told now.
    let transactionDocId: string;
    try {
      ({ transactionDocId } = await createCodOrderWithStock(adminDb, {
        orderId,
        orderData: onlineOrderData,
        transactionData,
      }));
    } catch (stockError) {
      const message =
        stockError instanceof Error
          ? stockError.message
          : "Some items are no longer in stock";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    // Sync customer to POS system's customers collection
    await syncOnlineCustomerToPos(uid);

    // Create an owner-facing notification so it shows up in the POS
    // notification bell/page and routes to the online orders page.
    try {
      await adminDb.collection("notifications").add({
        type: "online_order",
        title: "New Online Order",
        message: `Order #${orderId} (COD) has been placed by ${customer.displayName || customer.email || "a customer"}`,
        link: "/owner/sales/online-orders",
        metadata: {
          orderId,
        },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (notifError) {
      console.error("Error creating owner notification for new COD order:", notifError);
      // Don't fail order creation if the notification fails to be created
    }

    // Confirm the order to the customer by email, Telegram and the in-app bell.
    // Best-effort: the order exists either way, so nothing here may throw.
    try {
      const { notifyCustomer } = await import("@/lib/notifications/dispatch");
      await notifyCustomer({
        customerId: uid,
        // From the customer's own record, never from the request.
        fallbackEmail: customer.email,
        fallbackDisplayName: customer.displayName,
        event: {
          type: "order_placed",
          order: {
            orderRef: orderId,
            totalAmount: pricing.totalTHB,
            paymentMethod: "cod",
            paymentStatus: "pending",
            items: cartItems.map((line) => ({
              name: line.productName,
              quantity: line.quantity,
            })),
          },
        },
      });
    } catch (notifyError) {
      console.error("Error sending COD order confirmation to customer:", notifyError);
    }

    console.log(
      "COD transaction and online order created successfully:",
      transactionId,
      transactionDocId
    );

    // Mark coupon as used and deduct points if a coupon was applied
    if (coupon) {
      try {
        const { CouponService } = await import("@/lib/couponService");
        // eslint-disable-next-line react-hooks/rules-of-hooks -- not a React hook; the `use` prefix only looks like one
        const couponUsed = await CouponService.useCouponAdmin(
          adminDb,
          uid,
          coupon.id,
          transactionId
        );

        if (!couponUsed) {
          console.warn("Failed to mark coupon as used, but order will proceed");
        }
      } catch (couponError) {
        console.error("Error marking coupon as used:", couponError);
        // Don't fail the order if coupon update fails
      }
    }

    // Award loyalty points for COD order
    try {
      const { LoyaltyService } = await import("@/lib/loyaltyService");
      const loyaltyResult = await LoyaltyService.awardPoints({
        customerId: uid,
        transactionId,
        // Points are for what was bought, not for delivery.
        transactionAmount: Math.max(0, pricing.totalTHB - pricing.deliveryFeeTHB),
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

    return NextResponse.json({
      success: true,
      transactionId,
      firestoreId: transactionDocId,
      orderId,
      totalTHB: pricing.totalTHB,
      message: "COD order created successfully",
    });
  } catch (error) {
    console.error("Error creating COD transaction:", error);
    return NextResponse.json(
      { error: "Failed to create COD order. Please try again." },
      { status: 500 }
    );
  }
}
