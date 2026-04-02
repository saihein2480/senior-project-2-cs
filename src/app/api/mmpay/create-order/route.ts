import { NextResponse } from "next/server";
import { MMPaySDK } from "mmpay-node-sdk";
import { adminDb } from "../../../../lib/firebase-admin";
import { ensureStockAvailableForOrderInput } from "../../../../lib/onlineStockService";

type CreateOrderRequest = {
  amountMmk: number;
  items: Array<{ name: string; amount: number; quantity: number }>;
  cartItems?: Array<{
    productId: string;
    productName: string;
    variantId?: string;
    color?: string;
    size?: string;
    image?: string;
    priceTHB: number;
    quantity: number;
  }>;
  customer: {
    uid: string;
    email: string;
    displayName?: string;
    phone?: string;
    address?: string;
  };
  product: {
    productId: string;
    productName: string;
    variantId?: string;
    color?: string;
    size?: string;
    image?: string;
    priceTHB: number;
    quantity: number;
  };
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

    const body = (await req.json()) as CreateOrderRequest;
    if (!body?.customer?.uid || !body?.items?.length || !body?.amountMmk) {
      return NextResponse.json(
        { error: "Invalid order payload" },
        { status: 400 },
      );
    }

    try {
      await ensureStockAvailableForOrderInput(
        adminDb,
        body as unknown as Record<string, unknown>,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Stock validation failed";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const orderId = `ONL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const callbackUrl = process.env.MMPAY_CALLBACK_URL;

    await adminDb
      .collection("onlineOrders")
      .doc(orderId)
      .set({
        orderId,
        source: "online",
        customer: body.customer,
        ...(body.product ? { product: body.product } : {}),
        cartItems: body.cartItems || [],
        items: body.items,
        amountMmk: body.amountMmk,
        status: "pending",
        paymentStatus: "PENDING",
        provider: "MMPAY",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    const paymentPayload = {
      orderId,
      amount: body.amountMmk,
      items: body.items,
      callbackUrl,
      customMessage: `Order ${orderId}`,
    };

    const payResponse = shouldUseSandboxMode()
      ? await mmpay.sandboxPay(paymentPayload)
      : await mmpay.pay(paymentPayload);

    const safePayResponse = toFirestoreSafe(payResponse);
    const paymentUrl = extractPaymentUrl(payResponse);
    const qr = extractQr(payResponse);
    const sdkError = getSdkErrorMessage(payResponse);

    if (!paymentUrl && !qr && sdkError) {
      const isUnauthorized =
        sdkError.includes("401") || /unauthorized/i.test(sdkError);
      const hint = isUnauthorized
        ? " Check MMPAY keys and mode. Use sandbox keys with sandbox mode (MMPAY_MODE=sandbox)."
        : "";

      return NextResponse.json(
        {
          error: `MyanMyanPay error: ${sdkError}${hint}`,
          orderId,
          payResponse: safePayResponse,
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
      payResponse: safePayResponse,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
