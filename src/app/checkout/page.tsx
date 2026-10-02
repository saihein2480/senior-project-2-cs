"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useProduct } from "../../hooks/useProducts";
import {
  useCurrencyRate,
  useDeliveryFee,
  useTaxRate,
} from "../../hooks/useSettings";
import { useCustomerAuth } from "../../contexts/CustomerAuthContext";
import { useCart } from "../../contexts/CartContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useOnlinePromotions } from "../../hooks/useOnlinePromotions";
import { useCatalogPrices } from "../../hooks/useCatalogPrices";
import { priceOrder } from "../../lib/orderPricing";
import { CouponService, type Coupon } from "../../lib/couponService";
import { isDeliverableAddress } from "../../lib/deliveryArea";

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

/** How long a generated MyanMyanPay QR stays scannable, in seconds. */
const QR_VALIDITY_SECONDS = 180;

/**
 * The sandbox "complete payment" shortcut. Shown in `next dev`, or when a demo
 * deployment opts in with NEXT_PUBLIC_MMPAY_TEST_MODE=true; never to real
 * customers otherwise. The route enforces the same rule on the server.
 */
const SHOW_TEST_PAYMENT =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_MMPAY_TEST_MODE === "true";

/** Render a remaining-seconds count as m:ss. */
function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, profile, loading, isEmailVerified } = useCustomerAuth();
  const { t } = useLanguage();
  const { rate: mmkRate } = useCurrencyRate();
  const { taxRatePercent, hasTaxRate } = useTaxRate();
  // Same settings response as the tax rate, so it is loaded whenever
  // `hasTaxRate` is true and the pay button is enabled.
  const { deliveryFeeTHB } = useDeliveryFee();
  const { data: onlinePromotions = [] } = useOnlinePromotions();
  const {
    items: cartItems,
    clearCart,
    // Aliased: `isLoading` below already refers to the product query.
    isLoading: cartLoading,
  } = useCart();

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
  // Countdown for the scan window. MyanMyanPay does not return an expiry with
  // the QR payload, so this deadline is enforced on the client only: it stops
  // our status polling and prompts for a fresh QR. The provider may still
  // accept a late scan, which the callback would settle as normal.
  const [qrDeadline, setQrDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [completingTest, setCompletingTest] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"scan" | "cod">("scan");
  const [activeCoupon, setActiveCoupon] = useState<any>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [couponActionId, setCouponActionId] = useState<string | null>(null);

  const variant = useMemo(() => {
    const variants = ((product?.colorVariants || []) as ColorVariant[]).map(
      (v, idx) => ({ ...v, id: v.id || String(idx) }),
    );
    
    // If no variant selected but we have a size, try to find variant with that size
    if (!selectedVariantId && selectedSize && variants.length > 0) {
      const matchingVariant = variants.find((v) =>
        ((v as any).sizeQuantities || []).some(
          (sq: any) => sq.size?.toLowerCase() === selectedSize.toLowerCase(),
        ),
      );
      if (matchingVariant) return matchingVariant;
      // Default to first variant if size not found
      return variants[0];
    }
    
    return variants.find((v) => String(v.id) === String(selectedVariantId));
  }, [product, selectedVariantId, selectedSize]);

  const directItem = useMemo<CheckoutItem | null>(() => {
    if (!productId || !product) return null;

    // Use the resolved variant (which handles "Default" selection)
    const effectiveVariantId = variant?.id || selectedVariantId || "0";
    const effectiveColor = variant?.color || "Default";

    return {
      key: `${productId}:${effectiveVariantId}:${selectedSize}`,
      productId,
      variantId: effectiveVariantId,
      name: product?.name || "Product",
      color: effectiveColor,
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

  // Price cart lines at today's catalogue price. The price a cart line stored
  // when it was added may be out of date, and older carts stored a price that
  // already had the promotion taken off, which checkout then discounted again.
  // (A direct "Buy now" item already reads the live product.)
  const { prices: livePrices, isLoading: pricesLoading } = useCatalogPrices(
    cartItems.length > 0 ? checkoutItems.map((item) => item.productId) : [],
  );

  const pricedItems = checkoutItems.map((item) => {
    if (cartItems.length === 0) {
      return { ...item, available: item.unitPriceTHB > 0 };
    }
    const live = livePrices[item.productId];
    return {
      ...item,
      unitPriceTHB: typeof live === "number" ? live : item.unitPriceTHB,
      available: live !== null,
    };
  });
  const unavailableItems = pricedItems.filter((item) => !item.available);

  /**
   * The whole order, priced by the same function the order routes run on the
   * server (lib/orderPricing.ts). The routes recompute it from Firestore and
   * refuse the order if their total differs from the one shown here.
   */
  const pricing = priceOrder({
    lines: pricedItems.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceTHB: item.unitPriceTHB,
    })),
    promotions: onlinePromotions,
    coupon: activeCoupon
      ? {
          id: String(activeCoupon.id),
          code: String(activeCoupon.code || ""),
          discountType: String(activeCoupon.discountType || ""),
          discountValue: Number(activeCoupon.discountValue) || 0,
        }
      : null,
    taxRatePercent,
    deliveryFeeTHB,
    mmkRate,
  });

  const baseTotalTHB = pricing.subtotalTHB;
  const discountTHB = pricing.promotionDiscountTHB;
  const couponDiscountTHB = pricing.couponDiscountTHB;
  const taxTHB = pricing.taxTHB;
  const totalTHB = pricing.totalTHB;
  const totalMMK = pricing.totalMMK;
  const promotionTitle =
    pricing.lines.find((line) => line.promotion?.name)?.promotion?.name ||
    "Promotion";

  /** What the order routes need: which items, never their prices. */
  const orderLines = pricedItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId || "",
    color: item.color || "",
    size: item.size || "",
    quantity: item.quantity,
  }));

  /** `fetch` with the customer's ID token; the routes identify them by it. */
  const authedFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!user) throw new Error("Please sign in to continue.");
      const idToken = await user.getIdToken();
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${idToken}`);
      return fetch(path, { ...init, headers });
    },
    [user],
  );

  const missingProfileFields = useMemo(() => {
    const missing: string[] = [];
    if (!profile?.displayName?.trim()) missing.push("display name");
    if (!profile?.phone?.trim()) missing.push("phone");
    if (!profile?.address?.trim()) missing.push("address");
    // We only deliver inside Tachileik, so an address elsewhere counts as missing.
    else if (!isDeliverableAddress(profile.address))
      missing.push("a delivery ward or area in Tachileik");
    return missing;
  }, [profile]);

  const isProfileComplete = missingProfileFields.length === 0;

  // Load the activated coupon plus any the customer could still apply.
  const refreshCoupons = useCallback(async () => {
    if (!user) {
      setActiveCoupon(null);
      setAvailableCoupons([]);
      return;
    }

    setLoadingCoupon(true);
    try {
      const [applied, available] = await Promise.all([
        CouponService.getActiveCoupon(user.uid),
        CouponService.getAvailableCoupons(user.uid),
      ]);
      setActiveCoupon(applied);
      setAvailableCoupons(available);
    } catch (error) {
      console.error("Error loading coupons:", error);
      setActiveCoupon(null);
      setAvailableCoupons([]);
    } finally {
      setLoadingCoupon(false);
    }
  }, [user]);

  useEffect(() => {
    refreshCoupons();
  }, [refreshCoupons]);

  const applyCoupon = async (couponId: string) => {
    if (!user) return;

    setCouponActionId(couponId);
    setError(null);
    try {
      const response = await authedFetch("/api/loyalty/use-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId }),
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to apply coupon");
      }

      await refreshCoupons();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply coupon");
    } finally {
      setCouponActionId(null);
    }
  };

  const removeCoupon = async (couponId: string) => {
    if (!user) return;

    setCouponActionId(couponId);
    setError(null);
    try {
      const response = await authedFetch(
        `/api/loyalty/use-coupon?couponId=${encodeURIComponent(couponId)}`,
        { method: "DELETE" },
      );
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to remove coupon");
      }

      await refreshCoupons();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove coupon");
    } finally {
      setCouponActionId(null);
    }
  };

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

    // An unconfirmed address means order updates and refunds could not reach
    // the customer, so block payment until it is verified.
    if (!isEmailVerified) {
      router.push(
        `/auth/verify-email?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
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

    // Handle COD checkout separately
    if (paymentMethod === "cod") {
      await createCODOrder();
      return;
    }

    // Handle Scan/QR payment through MyanMyanPay
    setSubmitting(true);
    setError(null);
    setQrValue("");
    setPaymentUrl("");
    setOnlineOrderId("");
    setQrDeadline(null);
    setSecondsLeft(0);

    try {
      // Only what to buy and what the customer was shown. The server prices
      // the order itself, builds the MyanMyanPay itemisation and charges its
      // own total, refusing the order if that differs from the one on screen.
      const response = await authedFetch("/api/mmpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: orderLines,
          couponId: activeCoupon?.id || null,
          deliveryFee: deliveryFeeTHB,
          expectedTotalTHB: totalTHB,
          expectedTotalMMK: totalMMK,
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
        // Seed the visible value alongside the deadline so the first paint
        // shows the full window instead of briefly flashing "expired".
        setQrDeadline(Date.now() + QR_VALIDITY_SECONDS * 1000);
        setSecondsLeft(QR_VALIDITY_SECONDS);
        if (url.length > 0) setPaymentUrl(url);
        return;
      }

      if (url.length > 0) {
        window.location.href = url;
        return;
      }

      throw new Error("Payment URL is missing from MyanMyanPay response");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Payment creation failed";

      // The coupon stays selected: nothing consumed it, and a retry (for
      // example after a "prices changed" refusal) should still apply it.
      // Re-read it in case the server refused it as no longer usable.
      if (activeCoupon) await refreshCoupons();

      // Make limit errors more user-friendly
      if (errorMessage.toLowerCase().includes("limit")) {
        setError(
          "⚠️ Payment Gateway Limit Reached\n\n" +
          "The sandbox testing account has reached its transaction limit. " +
          "This is a temporary testing restriction.\n\n" +
          "Solutions:\n" +
          "• Contact MyanMyanPay support to increase sandbox limits\n" +
          "• Complete merchant verification for production use\n" +
          "• Try Cash on Delivery instead\n\n" +
          "For now, please use Cash on Delivery payment method."
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const createCODOrder = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // The server prices the order from Firestore and refuses it if the
      // total differs from the one on screen; no prices are sent.
      const response = await authedFetch("/api/transactions/create-cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: orderLines,
          couponId: activeCoupon?.id || null,
          deliveryFeeTHB: deliveryFeeTHB,
          expectedTotalTHB: totalTHB,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create COD order");
      }

      // The coupon is consumed server-side by /api/transactions/create-cod,
      // which also deducts the points. Doing it again here would double-deduct.

      // Clear cart if checkout was from cart
      if (!productId) {
        clearCart();
      }

      // Redirect to orders page
      router.push("/account/purchases");
    } catch (e) {
      setError(e instanceof Error ? e.message : "COD order creation failed");

      // Nothing consumed the coupon, so it stays selected for a retry. Re-read
      // it in case the server refused it as no longer usable.
      if (activeCoupon) await refreshCoupons();
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
      const response = await authedFetch("/api/mmpay/test-complete", {
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

  // Tick the scan-window countdown once a second. The remaining time is
  // recomputed from the deadline rather than decremented, so a throttled or
  // backgrounded tab cannot drift the clock.
  useEffect(() => {
    if (qrDeadline === null) return;

    const read = () =>
      Math.max(0, Math.ceil((qrDeadline - Date.now()) / 1000));

    setSecondsLeft(read());
    if (read() === 0) return;

    const intervalId = setInterval(() => {
      const remaining = read();
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(intervalId);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [qrDeadline]);

  const qrExpired = qrDeadline !== null && secondsLeft <= 0;

  useEffect(() => {
    if (!onlineOrderId || !qrValue) return;
    // Once the window closes, stop asking the server about this order.
    if (qrExpired) return;

    let mounted = true;
    const intervalId = setInterval(async () => {
      try {
        // Only the customer who placed the order may read its status.
        const response = await authedFetch(
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
  }, [onlineOrderId, qrValue, qrExpired, router, productId, clearCart, authedFetch]);

  // `!cartLoading` guards against announcing an empty cart before the signed-in
  // customer's server cart has arrived — the skeleton below covers that gap.
  if (!productId && !cartLoading && cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16 md:py-24">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-50 to-pink-50">
              <svg
                className="h-7 w-7 text-rose-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13 5.4 5M7 13l-.7 3.5h11.4M9 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              No checkout item selected
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Add something to your cart before checking out.
            </p>
            <Link
              href="/cart"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
            >
              Go to Cart
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if ((productId && isLoading) || loading || (!productId && cartLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white">
        <div className="mx-auto max-w-6xl px-4 py-5 md:py-8">
          <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
          <div className="mt-6 h-9 w-64 animate-pulse rounded bg-gray-100" />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-2 space-y-5">
              <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
              <div className="h-56 animate-pulse rounded-2xl bg-gray-100" />
            </div>
            <div className="h-80 animate-pulse rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white">
    <div className="mx-auto max-w-6xl px-4 py-5 md:py-8">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-2 text-xs md:text-sm text-gray-500"
      >
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-rose-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 12H5m0 0 6-6m-6 6 6 6"
            />
          </svg>
          Back
        </button>
        <span className="text-gray-300">/</span>
        <Link href="/cart" className="transition-colors hover:text-rose-600">
          Cart
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-medium text-gray-900">Checkout</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">
          Secure Checkout
        </span>
        <h1 className="mt-3 text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-gray-900">
          Online Checkout
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Choose your payment method and complete your order.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
      {/* Payment Method Selection */}
      <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Payment Method
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Scan/QR Payment */}
          <button
            onClick={() => setPaymentMethod("scan")}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              paymentMethod === "scan"
                ? "border-rose-500 bg-rose-50 shadow-sm"
                : "border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50/40"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  paymentMethod === "scan"
                    ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">QR Code Payment</p>
                <p className="text-sm text-gray-600">
                  Pay via MyanMyanPay gateway
                </p>
              </div>
            </div>
          </button>

          {/* COD Payment */}
          <button
            onClick={() => setPaymentMethod("cod")}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              paymentMethod === "cod"
                ? "border-rose-500 bg-rose-50 shadow-sm"
                : "border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50/40"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  paymentMethod === "cod"
                    ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Cash on Delivery</p>
                <p className="text-sm text-gray-600">
                  Pay when you receive your order
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Order Items
        </h2>
        <div className="space-y-4">
          {pricedItems.map((item) => (
            <div key={item.key} className="flex gap-4">
              <div className="shrink-0 overflow-hidden rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/60 via-white to-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    item.image ||
                    "https://via.placeholder.com/120x160?text=Product"
                  }
                  alt={item.name}
                  className="h-28 w-24 object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base md:text-lg font-semibold leading-snug text-gray-900">
                  {item.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">
                    {item.color || "Default"}
                  </span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                    Size {item.size || "N/A"}
                  </span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                    Qty {item.quantity}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Unit price
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-gray-900">
                    ฿ {item.unitPriceTHB.toFixed(2)}
                  </div>
                </div>
                {!item.available && (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    No longer available. Remove it from your cart to continue.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
        </div>

        {/* Right column */}
        <div className="lg:sticky lg:top-6 space-y-5">
      <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 via-white to-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Order Summary
        </h2>

        <div className="mt-4">
          {discountTHB > 0 ? (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
              <svg
                className="h-4 w-4 shrink-0 text-emerald-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs font-semibold text-emerald-800">
                {promotionTitle}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-xs font-medium text-gray-500">
              Subtotal (THB)
            </span>
            <span className="text-sm font-semibold text-gray-900">
              ฿ {baseTotalTHB.toFixed(2)}
            </span>
          </div>
          {discountTHB > 0 ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-xs font-medium text-emerald-700">
                Promotion Discount (THB)
              </span>
              <span className="text-sm font-semibold text-emerald-700">
                -฿ {discountTHB.toFixed(2)}
              </span>
            </div>
          ) : null}
          
          {/* Coupon Discount */}
          {activeCoupon && couponDiscountTHB > 0 && (
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-purple-700">
                  Coupon Discount
                </span>
                <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                  {activeCoupon.code}
                </span>
              </div>
              <span className="text-sm font-semibold text-purple-700">-฿ {couponDiscountTHB.toFixed(2)}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-xs font-medium text-gray-500">
              Tax ({taxRatePercent}%)
            </span>
            <span className="text-sm font-semibold text-gray-900">
              ฿ {taxTHB.toFixed(2)}
            </span>
          </div>

          {/* Delivery fee - always shown so the customer knows before paying */}
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-xs font-medium text-gray-500">
              Delivery Fee
            </span>
            {!hasTaxRate ? (
              // Settings still loading; avoid flashing "Free" before the fee.
              <span className="text-sm font-semibold text-gray-400">—</span>
            ) : deliveryFeeTHB > 0 ? (
              <span className="text-sm font-semibold text-gray-900">
                ฿ {deliveryFeeTHB.toFixed(2)}
              </span>
            ) : (
              <span className="text-sm font-semibold text-emerald-700">
                Free
              </span>
            )}
          </div>

          <div className="mt-4 border-t border-rose-100 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Total (THB)
            </div>
            <div className="mt-1 bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-2xl md:text-3xl font-bold text-transparent">
              ฿ {totalTHB.toFixed(2)}
            </div>
            <div className="mt-0.5 text-sm font-medium text-gray-500">
              Ks {totalMMK.toLocaleString()}
            </div>
          </div>
          
          {/* Applied coupon */}
          {activeCoupon && (
            <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-purple-900">
                    Coupon Applied: {activeCoupon.code}
                  </p>
                  <p className="text-xs text-purple-700 mt-1">
                    {activeCoupon.discountType === "percentage"
                      ? `${activeCoupon.discountValue}% discount`
                      : `฿${activeCoupon.discountValue} discount`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeCoupon(activeCoupon.id)}
                  disabled={couponActionId === activeCoupon.id || submitting}
                  className="text-xs font-semibold text-purple-700 underline hover:text-purple-900 disabled:opacity-50"
                >
                  {couponActionId === activeCoupon.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          )}

          {/* Coupons the customer owns but has not applied yet */}
          {!activeCoupon && availableCoupons.length > 0 && (
            <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-900">
                You have {availableCoupons.length} coupon
                {availableCoupons.length > 1 ? "s" : ""} available
              </p>
              <div className="mt-2 space-y-2">
                {availableCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {coupon.code}
                      </p>
                      <p className="text-xs text-purple-700">
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}% off`
                          : `฿${coupon.discountValue} off`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyCoupon(coupon.id)}
                      disabled={couponActionId === coupon.id || submitting}
                      className="shrink-0 rounded-full bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {couponActionId === coupon.id ? "Applying..." : "Apply"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!activeCoupon && !loadingCoupon && availableCoupons.length === 0 && (
            <p className="mt-3 text-xs text-gray-500">
              No coupons available.{" "}
              <Link
                href="/membership"
                className="font-medium text-rose-600 hover:text-rose-700"
              >
                View your membership
              </Link>
            </p>
          )}
        </div>

        {qrValue && (
          <div className="mt-5 rounded-xl border border-rose-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Scan to pay
            </p>
            <div className="mt-3 flex justify-center rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/60 via-white to-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrValue)}`}
                alt="Payment QR"
                className={`h-[200px] w-[200px] transition-opacity ${
                  qrExpired ? "opacity-25" : ""
                }`}
              />
            </div>

            {/* Scan window countdown, directly beneath the QR. */}
            {qrDeadline !== null && !qrExpired && (
              <div
                className="mt-3 flex items-center justify-center gap-2 rounded-full bg-rose-50 px-3 py-2"
                aria-live="polite"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-rose-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
                <span className="text-xs font-medium text-gray-600">
                  {t("qr_expires_in")}
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-rose-600">
                  {formatCountdown(secondsLeft)}
                </span>
              </div>
            )}

            {qrExpired && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-center">
                <p className="text-xs font-semibold text-amber-900">
                  {t("qr_expired")}
                </p>
                <p className="mt-1 text-[11px] text-amber-800">
                  {t("qr_expired_hint")}
                </p>
                <button
                  type="button"
                  onClick={createPayment}
                  disabled={submitting}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? t("creating_payment") : t("generate_new_qr")}
                </button>
              </div>
            )}

            {paymentUrl && !qrExpired && (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-semibold text-rose-600 underline decoration-rose-300 underline-offset-4 transition-colors hover:text-rose-700"
              >
                Open payment page instead
              </a>
            )}
            {SHOW_TEST_PAYMENT && onlineOrderId && !qrExpired && (
              <button
                type="button"
                onClick={completePaymentForTest}
                disabled={completingTest}
                className="mt-3 inline-flex w-full items-center justify-center rounded-full border-2 border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
            Please login before continuing to payment.
          </p>
        )}

        {user && !isEmailVerified && (
          <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
            Please verify your email address before continuing to payment.{" "}
            <Link
              href={`/auth/verify-email?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              className="font-semibold underline"
            >
              Verify Email
            </Link>
          </p>
        )}

        {user && isEmailVerified && !isProfileComplete && (
          <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
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
          <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-2.5">
          <button
            onClick={createPayment}
            disabled={
              submitting ||
              !user ||
              !isEmailVerified ||
              !isProfileComplete ||
              !hasTaxRate ||
              pricesLoading ||
              unavailableItems.length > 0
            }
            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
          >
            {submitting
              ? paymentMethod === "cod"
                ? "Creating COD Order..."
                : "Creating Payment..."
              : !user
                ? "Login to Continue"
                : !isEmailVerified
                  ? "Verify Email to Continue"
                  : !isProfileComplete
                  ? "Complete Profile to Continue"
                  : !hasTaxRate
                    ? "Loading tax settings..."
                    : pricesLoading
                      ? "Checking prices..."
                      : unavailableItems.length > 0
                        ? "Remove unavailable items"
                        : paymentMethod === "cod"
                      ? "Place COD Order"
                      : "Pay with MyanMyanPay"}
          </button>

          <Link
            href="/cart"
            className="inline-flex w-full items-center justify-center rounded-full border-2 border-rose-200 bg-white px-5 py-3 text-sm font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50"
          >
            Back to Cart
          </Link>
        </div>
      </div>

        </div>
      </div>
    </div>
    </div>
  );
}
