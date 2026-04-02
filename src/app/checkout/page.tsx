"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useProduct } from "../../hooks/useProducts";
import { useCurrencyRate } from "../../hooks/useSettings";
import { useCustomerAuth } from "../../contexts/CustomerAuthContext";
import { useCart } from "../../contexts/CartContext";
import { useOnlinePromotions } from "../../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../../lib/onlinePromotion";

type ColorVariant = {
  id?: string;
  color?: string;
  image?: string;
};

type CheckoutItem = {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  color?: string;
  size?: string;
  image?: string;
  unitPriceTHB: number;
  quantity: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, profile, loading } = useCustomerAuth();
  const { rate: mmkRate } = useCurrencyRate();
  const { data: onlinePromotions = [] } = useOnlinePromotions();
  const { items: cartItems, subtotalTHB, clearCart } = useCart();

  const productId = params.get("productId") || "";
  const selectedVariantId = params.get("variant") || "";
  const selectedSize = params.get("size") || "";
  const qty = Number(params.get("qty") || 1);

  const { data: product, isLoading } = useProduct(productId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string>("");
  const [paymentUrl, setPaymentUrl] = useState<string>("");
  const [onlineOrderId, setOnlineOrderId] = useState<string>("");
  const [completingTest, setCompletingTest] = useState(false);

  const variant = useMemo(() => {
    const variants = ((product?.colorVariants || []) as ColorVariant[]).map(
      (v, idx) => ({ ...v, id: v.id || String(idx) }),
    );
    return variants.find((v) => String(v.id) === String(selectedVariantId));
  }, [product, selectedVariantId]);

  const directItem = useMemo<CheckoutItem | null>(() => {
    if (!productId || !product) return null;

    return {
      key: `${productId}:${selectedVariantId}:${selectedSize}`,
      productId,
      variantId: selectedVariantId || undefined,
      name: product?.name || "Product",
      color: variant?.color || "",
      size: selectedSize,
      image: variant?.image || product?.groupImage || product?.image || "",
      unitPriceTHB: Number(product?.price || 0),
      quantity: Math.max(1, qty),
    };
  }, [product, productId, selectedVariantId, selectedSize, variant, qty]);

  const checkoutItems = useMemo<CheckoutItem[]>(() => {
    if (cartItems.length > 0) {
      return cartItems.map((item) => ({
        key: item.id,
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        color: item.color,
        size: item.size,
        image: item.image,
        unitPriceTHB: Number(item.unitPriceTHB || 0),
        quantity: Number(item.quantity || 1),
      }));
    }

    return directItem ? [directItem] : [];
  }, [cartItems, directItem]);

  const baseTotalTHB =
    cartItems.length > 0
      ? subtotalTHB
      : checkoutItems.reduce(
          (sum, item) => sum + item.unitPriceTHB * item.quantity,
          0,
        );
  const lineResults = checkoutItems.map((item) =>
    applyBestPromotionToLine({
      unitPriceTHB: item.unitPriceTHB,
      quantity: item.quantity,
      productId: item.productId,
      variantId: item.variantId,
      promotions: onlinePromotions,
    }),
  );

  const discountTHB = lineResults.reduce(
    (sum, row) => sum + row.discountTHB,
    0,
  );
  const totalTHB = Math.max(0, baseTotalTHB - discountTHB);
  const promotionTitle =
    lineResults.find((row) => row.promotion?.name)?.promotion?.name ||
    "Promotion";
  const totalMMK = Math.round(totalTHB * mmkRate);

  const missingProfileFields = useMemo(() => {
    const missing: string[] = [];
    if (!profile?.displayName?.trim()) missing.push("display name");
    if (!profile?.phone?.trim()) missing.push("phone");
    if (!profile?.address?.trim()) missing.push("address");
    return missing;
  }, [profile]);

  const isProfileComplete = missingProfileFields.length === 0;

  const createPayment = async () => {
    if (!checkoutItems.length) {
      setError("No checkout items found");
      return;
    }

    if (!user || !profile) {
      router.push(
        `/auth/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }

    if (!isProfileComplete) {
      setError(
        `Please complete your profile (${missingProfileFields.join(", ")}) before checkout.`,
      );
      router.push(
        `/account/profile?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setQrValue("");
    setPaymentUrl("");
    setOnlineOrderId("");

    try {
      const payloadItems = checkoutItems.map((item) => {
        const line = applyBestPromotionToLine({
          unitPriceTHB: item.unitPriceTHB,
          quantity: item.quantity,
          productId: item.productId,
          variantId: item.variantId,
          promotions: onlinePromotions,
        });
        const discountedUnitTHB =
          item.quantity > 0 ? line.finalSubtotalTHB / item.quantity : 0;
        const unitMmk = Math.max(1, Math.round(discountedUnitTHB * mmkRate));
        return {
          name: item.name,
          amount: unitMmk,
          quantity: item.quantity,
        };
      });

      const response = await fetch("/api/mmpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMmk: totalMMK,
          customer: {
            uid: user.uid,
            email: user.email || profile.email,
            displayName: profile.displayName,
            phone: profile.phone,
            address: profile.address,
          },
          items: payloadItems,
          cartItems: checkoutItems.map((item) => ({
            priceTHB: (() => {
              const line = applyBestPromotionToLine({
                unitPriceTHB: item.unitPriceTHB,
                quantity: item.quantity,
                productId: item.productId,
                variantId: item.variantId,
                promotions: onlinePromotions,
              });
              return item.quantity > 0
                ? line.finalSubtotalTHB / item.quantity
                : item.unitPriceTHB;
            })(),
            productId: item.productId,
            productName: item.name,
            variantId: item.variantId || "",
            color: item.color || "",
            size: item.size || "",
            image: item.image || "",
            quantity: item.quantity,
          })),
          product:
            checkoutItems.length === 1
              ? {
                  productId: checkoutItems[0].productId,
                  productName: checkoutItems[0].name,
                  variantId: checkoutItems[0].variantId || "",
                  color: checkoutItems[0].color || "",
                  size: checkoutItems[0].size || "",
                  image: checkoutItems[0].image || "",
                  priceTHB: (() => {
                    const line = applyBestPromotionToLine({
                      unitPriceTHB: checkoutItems[0].unitPriceTHB,
                      quantity: checkoutItems[0].quantity,
                      productId: checkoutItems[0].productId,
                      variantId: checkoutItems[0].variantId,
                      promotions: onlinePromotions,
                    });
                    return checkoutItems[0].quantity > 0
                      ? line.finalSubtotalTHB / checkoutItems[0].quantity
                      : checkoutItems[0].unitPriceTHB;
                  })(),
                  quantity: checkoutItems[0].quantity,
                }
              : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create payment");
      }

      const orderId = typeof data?.orderId === "string" ? data.orderId : "";
      if (orderId) {
        setOnlineOrderId(orderId);
      }

      const url = typeof data?.paymentUrl === "string" ? data.paymentUrl : "";
      const qr = typeof data?.qr === "string" ? data.qr : "";

      // Prefer showing QR even if URL is available, to avoid auto-complete redirects.
      if (qr.length > 0) {
        setQrValue(qr);
        if (url.length > 0) setPaymentUrl(url);
        return;
      }

      if (url.length > 0) {
        window.location.href = url;
        return;
      }

      throw new Error("Payment URL is missing from MyanMyanPay response");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const completePaymentForTest = async () => {
    if (paymentUrl) {
      window.open(paymentUrl, "_blank", "noopener,noreferrer");
      setError(
        "Complete payment in MyanMyanPay page to change provider status from PENDING to SUCCESS.",
      );
      return;
    }

    if (!onlineOrderId) {
      setError("Missing online order id for test completion");
      return;
    }

    setCompletingTest(true);
    setError(null);
    try {
      const response = await fetch("/api/mmpay/test-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: onlineOrderId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to complete test payment");
      }

      if (!productId) {
        clearCart();
      }
      router.push("/account/purchases");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to complete test payment",
      );
    } finally {
      setCompletingTest(false);
    }
  };

  useEffect(() => {
    if (!onlineOrderId || !qrValue) return;

    let mounted = true;
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/mmpay/order-status?orderId=${encodeURIComponent(onlineOrderId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;

        const data = await response.json();
        const paymentStatus = String(data?.paymentStatus || "").toUpperCase();
        const status = String(data?.status || "").toLowerCase();

        if (paymentStatus === "SUCCESS" || status === "paid") {
          clearInterval(intervalId);
          if (mounted) {
            if (!productId) {
              clearCart();
            }
            router.push("/account/purchases");
          }
        }
      } catch {
        // ignore transient polling failures
      }
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [onlineOrderId, qrValue, router, productId, clearCart]);

  if (!productId && cartItems.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-gray-700">No checkout item selected.</p>
        <Link
          href="/cart"
          className="mt-3 inline-block text-pink-600 hover:text-pink-700"
        >
          Go to Cart
        </Link>
      </div>
    );
  }

  if ((productId && isLoading) || loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-gray-600">
        Loading checkout...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-900">Online Checkout</h1>
      <p className="mt-2 text-sm text-gray-600">
        Secure payment via MyanMyanPay gateway.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          {checkoutItems.map((item) => (
            <div key={item.key} className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  item.image ||
                  "https://via.placeholder.com/120x160?text=Product"
                }
                alt={item.name}
                className="h-24 w-20 rounded-md object-cover"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">
                  {item.name}
                </h2>
                <p className="text-sm text-gray-600">
                  Color: {item.color || "Default"}
                </p>
                <p className="text-sm text-gray-600">
                  Size: {item.size || "N/A"}
                </p>
                <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                <p className="mt-1 text-sm text-gray-900">
                  Unit Price: ฿ {item.unitPriceTHB.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-700">
          {discountTHB > 0 ? (
            <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              {promotionTitle}
            </div>
          ) : null}
          <div className="flex items-center justify-between py-1">
            <span>Subtotal (THB)</span>
            <span className="font-medium">฿ {baseTotalTHB.toFixed(2)}</span>
          </div>
          {discountTHB > 0 ? (
            <div className="flex items-center justify-between py-1 text-emerald-700">
              <span>Promotion Discount (THB)</span>
              <span className="font-medium">-฿ {discountTHB.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between py-1">
            <span>Total (THB)</span>
            <span className="font-semibold">฿ {totalTHB.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span>Total (MMK)</span>
            <span className="font-medium">Ks {totalMMK.toLocaleString()}</span>
          </div>
        </div>

        {qrValue && (
          <div className="mt-6 rounded-md border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900">
              Scan this QR code to complete payment
            </p>
            <div className="mt-3 inline-block rounded bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrValue)}`}
                alt="Payment QR"
                className="h-[220px] w-[220px]"
              />
            </div>
            {paymentUrl && (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm font-medium text-blue-700 underline"
              >
                Open payment page instead
              </a>
            )}
            {onlineOrderId && (
              <button
                type="button"
                onClick={completePaymentForTest}
                disabled={completingTest}
                className="mt-3 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {paymentUrl
                  ? "Open MyanMyanPay Test Page"
                  : completingTest
                    ? "Completing Test Payment..."
                    : "Test Complete Payment (Local)"}
              </button>
            )}
          </div>
        )}

        {!user && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Please login before continuing to payment.
          </p>
        )}

        {user && !isProfileComplete && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Please complete your profile ({missingProfileFields.join(", ")})
            before continuing to payment.{" "}
            <Link
              href={`/account/profile?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              className="font-semibold underline"
            >
              Go to Profile
            </Link>
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={createPayment}
            disabled={submitting || !user || !isProfileComplete}
            className="rounded-md bg-pink-500 px-5 py-2 text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {submitting
              ? "Creating Payment..."
              : !user
                ? "Login to Continue"
                : !isProfileComplete
                  ? "Complete Profile to Continue"
                  : "Pay with MyanMyanPay"}
          </button>

          <button
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 px-5 py-2 text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
