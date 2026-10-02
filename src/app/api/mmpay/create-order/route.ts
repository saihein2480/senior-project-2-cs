import { NextResponse } from "next/server";
import { MMPaySDK } from "mmpay-node-sdk";
import { adminDb, getUidFromAuthHeader } from "../../../../lib/firebase-admin";
import {
  createOrderWithStockReservation,
  releaseStaleReservations,
  releaseStockReservation,
} from "../../../../lib/onlineStockService";
import { buildGatewayItems } from "../../../../lib/orderPricing";
import {
  assertCustomerSawQuote,
  isQuoteError,
  orderLineRecords,
  parseRequestedLines,
  quoteErrorBody,
  quoteOrder,
} from "../../../../lib/server/orderQuote";

/**
 * POST /api/mmpay/create-order
 *   headers: Authorization: Bearer <firebase id token>
 *   body: {
 *     lines: Array<{ productId, variantId?, color?, size?, quantity }>,
 *     couponId?: string | null,
 *     // What the checkout page showed; the order is refused if these differ
 *     // from the server's own figures.
 *     deliveryFee: number, expectedTotalTHB: number, expectedTotalMMK: number,
 *   }
 *
 * The customer is the caller identified by the ID token. Every amount stored on
 * the order and the amount sent to MyanMyanPay is computed here from
 * Firestore (see lib/server/orderQuote.ts); the request carries no prices.
 */
type CreateOrderRequest = {
  lines?: unknown;
  couponId?: unknown;
  deliveryFee?: unknown;
  expectedTotalTHB?: unknown;
  expectedTotalMMK?: unknown;
};

function getMmpay() {
  if (
    !process.env.MMPAY_APP_ID ||
    !process.env.MMPAY_PUBLISHABLE_KEY ||
    !process.env.MMPAY_SECRET_KEY ||
    !process.env.MMPAY_API_BASE_URL
  ) {
    return null;
  }

  const SDK = MMPaySDK as unknown as new (config: {
    appId: string;
    publishableKey: string;
    secretKey: string;
    apiBaseUrl: string;
  }) => {
    pay: (payload: unknown) => Promise<unknown>;
    sandboxPay: (payload: unknown) => Promise<unknown>;
  };

  return new SDK({
    appId: process.env.MMPAY_APP_ID,
    publishableKey: process.env.MMPAY_PUBLISHABLE_KEY,
    secretKey: process.env.MMPAY_SECRET_KEY,
    apiBaseUrl: process.env.MMPAY_API_BASE_URL,
  });
}

function shouldUseSandboxMode() {
  const explicitMode = (process.env.MMPAY_MODE || "").toLowerCase();
  if (explicitMode === "sandbox") return true;
  if (explicitMode === "production") return false;

  const isTestPublishable = (
    process.env.MMPAY_PUBLISHABLE_KEY || ""
  ).startsWith("pk_test_");
  const isTestSecret = (process.env.MMPAY_SECRET_KEY || "").startsWith(
    "sk_test_",
  );
  const baseUrl = (process.env.MMPAY_API_BASE_URL || "").toLowerCase();
  const baseUrlLooksSandbox = baseUrl.includes("sandbox");

  return isTestPublishable || isTestSecret || baseUrlLooksSandbox;
}

function extractPaymentUrl(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const res = response as Record<string, unknown>;
  const data = (res.data as Record<string, unknown> | undefined) || {};
  const nestedResponseData =
    ((res.response as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined) || {};

  const candidates = [
    res.paymentUrl,
    res.checkoutUrl,
    res.url,
    data.paymentUrl,
    data.checkoutUrl,
    data.url,
    nestedResponseData.paymentUrl,
    nestedResponseData.checkoutUrl,
    nestedResponseData.url,
  ];

  const found = candidates.find((x) => typeof x === "string" && x.length > 0);
  return (found as string) || null;
}

function extractQr(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const res = response as Record<string, unknown>;
  const data = (res.data as Record<string, unknown> | undefined) || {};
  const nestedResponseData =
    ((res.response as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined) || {};

  const candidates = [
    res.qr,
    res.qrPayload,
    res.qrString,
    res.qrText,
    data.qr,
    data.qrPayload,
    data.qrString,
    data.qrText,
    nestedResponseData.qr,
    nestedResponseData.qrPayload,
    nestedResponseData.qrString,
    nestedResponseData.qrText,
  ];

  const found = candidates.find((x) => typeof x === "string" && x.length > 0);
  return (found as string) || null;
}

function toFirestoreSafe(value: unknown): Record<string, unknown> {
  try {
    const normalized = JSON.parse(
      JSON.stringify(value, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
    if (normalized && typeof normalized === "object") {
      return normalized as Record<string, unknown>;
    }
    return { value: normalized };
  } catch {
    return { value: String(value) };
  }
}

function getSdkErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const res = value as Record<string, unknown>;
  const responseObj =
    (res.response as Record<string, unknown> | undefined) || {};
  const responseData =
    (responseObj.data as Record<string, unknown> | undefined) || {};

  const candidates = [
    responseData.message,
    responseData.error,
    res.message,
    res.code,
  ];

  const found = candidates.find((x) => typeof x === "string" && x.length > 0);
  return (found as string) || null;
}

export async function POST(req: Request) {
  try {
    const mmpay = getMmpay();
    if (!mmpay) {
      return NextResponse.json(
        { error: "MyanMyanPay is not configured" },
        { status: 500 },
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: "Server database is not configured" },
        { status: 500 },
      );
    }

    const uid = await getUidFromAuthHeader(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = ((await req.json().catch(() => null)) ||
      {}) as CreateOrderRequest;

    // Price the order from Firestore and check it against what the customer
    // was shown, before any stock is reserved or a QR is issued.
    let quote: Awaited<ReturnType<typeof quoteOrder>>;
    try {
      quote = await quoteOrder(adminDb, {
        uid,
        lines: parseRequestedLines(body.lines),
        couponId: typeof body.couponId === "string" ? body.couponId : null,
      });
      assertCustomerSawQuote(
        quote.pricing,
        {
          deliveryFee: body.deliveryFee,
          totalTHB: body.expectedTotalTHB,
          totalMMK: body.expectedTotalMMK,
        },
        { checkMmk: true },
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
    const gatewayItems = buildGatewayItems(
      pricing,
      quote.lines.map((line) => ({
        name: line.productName,
        color: line.color,
        size: line.size,
      })),
    );

    if (pricing.totalMMK <= 0 || gatewayItems.length === 0) {
      return NextResponse.json(
        { error: "This order has nothing to pay." },
        { status: 400 },
      );
    }

    // Free stock held by checkouts nobody is going to pay for, including this
    // customer's own earlier QR that has run out, before reserving again.
    try {
      await releaseStaleReservations(adminDb, { customerUid: uid });
    } catch (error) {
      console.error("Failed to release stale stock reservations:", error);
    }

    const orderId = `ONL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const callbackUrl = process.env.MMPAY_CALLBACK_URL;

    // Reserve the stock and create the order in one transaction. If another
    // buyer (online or at the till) got the last unit first, this fails here,
    // before the customer is shown a QR code or charged anything.
    try {
      await createOrderWithStockReservation(adminDb, orderId, {
        orderId,
        source: "online",
        customer,
        ...(cartItems.length === 1 ? { product: cartItems[0] } : {}),
        cartItems,
        items: gatewayItems,
        // Every figure below is the server's own (lib/server/orderQuote.ts).
        amountMmk: pricing.totalMMK,
        subtotal: pricing.subtotalTHB,
        tax: pricing.taxTHB,
        taxRate: pricing.taxRatePercent,
        discount: pricing.promotionDiscountTHB, // promotions only; coupon below
        deliveryFee: pricing.deliveryFeeTHB,
        appliedPromotions: pricing.appliedPromotions,
        total: pricing.totalTHB,
        exchangeRate: pricing.mmkRate,
        pricedBy: "server",
        status: "pending",
        paymentStatus: "PENDING",
        paymentMethod: "scan", // QR scan payment method
        provider: "MMPAY",
        ...(coupon
          ? {
              couponCode: coupon.code,
              appliedCouponCode: coupon.code,
              couponId: coupon.id,
              couponDiscountTHB: pricing.couponDiscountTHB,
            }
          : {}),
        orderSource: "web_storefront",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Stock validation failed";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    // From here on the order holds stock. Any path that ends without a
    // payable QR or link must hand it back.
    const db = adminDb;
    const releaseReservation = async (reason: string) => {
      try {
        await releaseStockReservation(db, orderId, reason);
      } catch (releaseError) {
        console.error(
          `Failed to release stock reservation for ${orderId}:`,
          releaseError,
        );
      }
    };

    // The amount charged is the server's total; the itemisation adds up to it.
    const paymentPayload = {
      orderId,
      amount: pricing.totalMMK,
      items: gatewayItems,
      callbackUrl,
      customMessage: `Order ${orderId}`,
    };

    let payResponse: unknown;
    try {
      payResponse = shouldUseSandboxMode()
        ? await mmpay.sandboxPay(paymentPayload)
        : await mmpay.pay(paymentPayload);
    } catch (payError) {
      await releaseReservation("payment_init_failed");
      throw payError;
    }

    const safePayResponse = toFirestoreSafe(payResponse);
    const paymentUrl = extractPaymentUrl(payResponse);
    const qr = extractQr(payResponse);
    const sdkError = getSdkErrorMessage(payResponse);

    if (!paymentUrl && !qr) {
      // Nothing the customer can pay with; the checkout page treats this as
      // a failure too.
      await releaseReservation("payment_init_failed");
    }

    if (!paymentUrl && !qr && sdkError) {
      const isUnauthorized =
        sdkError.includes("401") || /unauthorized/i.test(sdkError);
      const isLimitFilled =
        sdkError.toLowerCase().includes("limit") || 
        sdkError.toLowerCase().includes("quota") ||
        sdkError.toLowerCase().includes("exceeded");
      
      let hint = "";
      let userFriendlyMessage = sdkError;
      
      if (isUnauthorized) {
        hint = " Check MMPAY keys and mode. Use sandbox keys with sandbox mode (MMPAY_MODE=sandbox).";
      } else if (isLimitFilled) {
        userFriendlyMessage = "Payment gateway limit reached";
        hint = " Sandbox accounts have transaction limits. Please contact MyanMyanPay support to increase limits or complete merchant verification. For production use, upgrade to a verified merchant account.";
      }

      return NextResponse.json(
        {
          error: `MyanMyanPay error: ${userFriendlyMessage}${hint}`,
          orderId,
          payResponse: safePayResponse,
          details: sdkError, // Include original error for debugging
        },
        { status: 502 },
      );
    }

    await adminDb.collection("onlineOrders").doc(orderId).set(
      {
        payResponse: safePayResponse,
        paymentUrl,
        qr,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return NextResponse.json({
      orderId,
      paymentUrl,
      qr,
      totalTHB: pricing.totalTHB,
      totalMMK: pricing.totalMMK,
    });
  } catch (error) {
    console.error("Error creating MyanMyanPay order:", error);
    return NextResponse.json(
      { error: "Failed to create payment. Please try again." },
      { status: 500 },
    );
  }
}
