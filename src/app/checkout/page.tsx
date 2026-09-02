"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useProduct } from "../../hooks/useProducts";
import { useCurrencyRate, useTaxRate } from "../../hooks/useSettings";
import { useCustomerAuth } from "../../contexts/CustomerAuthContext";
import { useCart } from "../../contexts/CartContext";
import { useOnlinePromotions } from "../../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../../lib/onlinePromotion";
import { CouponService, type Coupon } from "../../lib/couponService";

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
  const { taxRate, taxRatePercent, hasTaxRate } = useTaxRate();
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
  const subtotalAfterDiscount = Math.max(0, baseTotalTHB - discountTHB);
  
  // Calculate coupon discount
  const couponDiscount = activeCoupon
    ? CouponService.calculateDiscount(subtotalAfterDiscount, activeCoupon)
    : { discountAmount: 0, finalAmount: subtotalAfterDiscount };
  
  const subtotalAfterCoupon = couponDiscount.finalAmount;
  const taxTHB = subtotalAfterCoupon * taxRate; // Use dynamic tax rate from POS settings
  const totalTHB = subtotalAfterCoupon + taxTHB;
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
      const response = await fetch("/api/loyalty/use-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: user.uid, couponId }),
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
      const response = await fetch(
        `/api/loyalty/use-coupon?customerId=${encodeURIComponent(user.uid)}&couponId=${encodeURIComponent(couponId)}`,
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

    try {
      // The gateway itemisation must add up to the amount we actually charge.
      // Building lines straight from item prices would ignore the coupon and
      // tax, so the customer would be shown (and possibly charged) the
      // undiscounted total. Instead, allocate the final MMK total across the
      // lines in proportion to their value, letting the last line absorb any
      // rounding remainder so the sum matches totalMMK exactly.
      const linePromoTotalsTHB = checkoutItems.map(
        (item) =>
          applyBestPromotionToLine({
            unitPriceTHB: item.unitPriceTHB,
            quantity: item.quantity,
            productId: item.productId,
            variantId: item.variantId,
            promotions: onlinePromotions,
          }).finalSubtotalTHB,
      );
      const linesTotalTHB = linePromoTotalsTHB.reduce(
        (sum, value) => sum + value,
        0,
      );

      let allocatedMmk = 0;
      const payloadItems = checkoutItems.map((item, index) => {
        const isLastLine = index === checkoutItems.length - 1;
        const share =
          linesTotalTHB > 0
            ? linePromoTotalsTHB[index] / linesTotalTHB
            : 1 / checkoutItems.length;

        const lineMmk = isLastLine
          ? totalMMK - allocatedMmk
          : Math.max(0, Math.round(totalMMK * share));
        allocatedMmk += lineMmk;

        const variantLabel = [item.color, item.size].filter(Boolean).join(", ");
        const nameParts = [item.name];
        if (variantLabel) nameParts.push(`(${variantLabel})`);
        if (item.quantity > 1) nameParts.push(`x${item.quantity}`);

        // quantity is 1 because `amount` already covers the whole line; the
        // real quantity is kept in the label so the payment page still shows it.
        return {
          name: nameParts.join(" "),
          amount: lineMmk,
          quantity: 1,
        };
        // Zero-value lines are dropped below; they contribute nothing to the
        // sum, so the itemisation still reconciles with totalMMK.
      }).filter((line) => line.amount > 0);

      const response = await fetch("/api/mmpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMmk: totalMMK,
          // Pass complete financial breakdown
          subtotal: baseTotalTHB, // Original subtotal before any discounts
          discount: discountTHB, // Promotion discount only; coupon tracked separately
          tax: taxTHB, // Tax amount
          taxRate: taxRatePercent, // Rate actually applied, for accurate display later
          total: totalTHB, // Final total
          exchangeRate: mmkRate, // Rate used for the MMK amount
          customer: {
            uid: user.uid,
            email: user.email || profile.email,
            displayName: profile.displayName,
            phone: profile.phone,
            address: profile.address,
          },
          items: payloadItems,
          // Add coupon information
          ...(activeCoupon && {
            couponCode: activeCoupon.code,
            couponId: activeCoupon.id,
            couponDiscountTHB: couponDiscount.discountAmount,
          }),
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
      const errorMessage = e instanceof Error ? e.message : "Payment creation failed";

      // No order was created, so hand the coupon back (COD already does this).
      if (activeCoupon && user) {
        await CouponService.releaseCoupon(user.uid, activeCoupon.id);
        await refreshCoupons();
      }

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
      // Create COD transaction directly in Firebase
      const response = await fetch("/api/transactions/create-cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            uid: user!.uid,
            email: user!.email || profile!.email,
            displayName: profile!.displayName,
            phone: profile!.phone,
            address: profile!.address,
          },
          items: checkoutItems.map((item) => {
            const line = applyBestPromotionToLine({
              unitPriceTHB: item.unitPriceTHB,
              quantity: item.quantity,
              productId: item.productId,
              variantId: item.variantId,
              promotions: onlinePromotions,
            });
            return {
              productId: item.productId,
              productName: item.name,
              variantId: item.variantId || "",
              color: item.color || "",
              size: item.size || "",
              image: item.image || "",
              quantity: item.quantity,
              unitPriceTHB: item.unitPriceTHB,
              discountedPriceTHB:
                item.quantity > 0
                  ? line.finalSubtotalTHB / item.quantity
                  : item.unitPriceTHB,
            };
          }),
          subtotalTHB: baseTotalTHB,
          discountTHB: discountTHB,
          couponDiscountTHB: activeCoupon ? couponDiscount.discountAmount : 0,
          couponCode: activeCoupon?.code || null,
          couponId: activeCoupon?.id || null,
          taxTHB: taxTHB,
          taxRatePercent: taxRatePercent,
          totalTHB: totalTHB,
          exchangeRate: mmkRate,
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
      
      // Release coupon if order creation failed
      if (activeCoupon) {
        await CouponService.releaseCoupon(user!.uid, activeCoupon.id);
      }
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
        Choose your payment method and complete your order.
      </p>

      {/* Payment Method Selection */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Payment Method
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Scan/QR Payment */}
          <button
            onClick={() => setPaymentMethod("scan")}
            className={`p-4 border-2 rounded-xl transition-all ${
              paymentMethod === "scan"
                ? "border-pink-500 bg-pink-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  paymentMethod === "scan"
                    ? "bg-pink-500 text-white"
                    : "bg-gray-100 text-gray-600"
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
            className={`p-4 border-2 rounded-xl transition-all ${
              paymentMethod === "cod"
                ? "border-pink-500 bg-pink-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center ${
                  paymentMethod === "cod"
                    ? "bg-pink-500 text-white"
                    : "bg-gray-100 text-gray-600"
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
          
          {/* Coupon Discount */}
          {activeCoupon && couponDiscount.discountAmount > 0 && (
            <div className="flex items-center justify-between py-1 text-purple-700">
              <div className="flex items-center gap-2">
                <span>Coupon Discount</span>
                <span className="text-xs bg-purple-100 px-2 py-0.5 rounded font-semibold">
                  {activeCoupon.code}
                </span>
              </div>
              <span className="font-medium">-฿ {couponDiscount.discountAmount.toFixed(2)}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between py-1">
            <span>Tax ({taxRatePercent}%)</span>
            <span className="font-medium">฿ {taxTHB.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between py-1 border-t border-gray-200 pt-2 mt-2">
            <span className="font-semibold">Total (THB)</span>
            <span className="font-semibold text-lg">฿ {totalTHB.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="font-semibold">Total (MMK)</span>
            <span className="font-semibold text-lg">Ks {totalMMK.toLocaleString()}</span>
          </div>
          
          {/* Applied coupon */}
          {activeCoupon && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
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
            <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
              <p className="text-sm font-semibold text-purple-900">
                You have {availableCoupons.length} coupon
                {availableCoupons.length > 1 ? "s" : ""} available
              </p>
              <div className="mt-2 space-y-2">
                {availableCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-purple-200 bg-white px-3 py-2"
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
                      className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
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
                className="font-medium text-pink-600 hover:text-pink-700"
              >
                View your membership
              </Link>
            </p>
          )}
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
            disabled={submitting || !user || !isProfileComplete || !hasTaxRate}
            className="rounded-md bg-pink-500 px-5 py-2 text-white hover:bg-pink-600 disabled:opacity-50"
          >
            {submitting
              ? paymentMethod === "cod"
                ? "Creating COD Order..."
                : "Creating Payment..."
              : !user
                ? "Login to Continue"
                : !isProfileComplete
                  ? "Complete Profile to Continue"
                  : !hasTaxRate
                    ? "Loading tax settings..."
                    : paymentMethod === "cod"
                      ? "Place COD Order"
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
