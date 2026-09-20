"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ProductsList from "../../../components/ProductsList";
import { useProduct } from "../../../hooks/useProducts";
import { useCurrencyRate } from "../../../hooks/useSettings";
import { useCart } from "../../../contexts/CartContext";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";
import { useOnlinePromotions } from "../../../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../../../lib/onlinePromotion";
import { useCurrency, formatPrice } from "../../../hooks/useCurrency";

type SizeQuantity = { size?: string; quantity?: number | string };
type ColorVariant = {
  id?: string;
  color?: string;
  colorCode?: string;
  image?: string;
  sizeQuantities?: SizeQuantity[];
};

export default function ProductDetailPage() {
  const params = useParams() as { id?: string };
  const id = params?.id || "";
  const router = useRouter();

  // Use TanStack Query hook for cached data fetching
  const {
    data: product,
    isLoading: loading,
    error: queryError,
  } = useProduct(id);
  const { addItem } = useCart();
  const { user } = useCustomerAuth();
  const { rate: mmkRate } = useCurrencyRate();
  const { data: onlinePromotions = [] } = useOnlinePromotions();
  const displayCurrency = useCurrency();

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedPurchaseQty, setSelectedPurchaseQty] = useState<number>(1);
  const [selectedPurchaseQtyInput, setSelectedPurchaseQtyInput] =
    useState<string>("1");

  const variants: ColorVariant[] = (product && product.colorVariants) || [];
  const stockFromVariants = variants.reduce(
    (total: number, v: ColorVariant) =>
      total +
      (v.sizeQuantities || []).reduce(
        (t: number, s: SizeQuantity) => t + (Number(s.quantity) || 0),
        0,
      ),
    0,
  );
  const stock = product?.stock ?? stockFromVariants ?? 0;

  const displayName = product?.name || "";
  const displayPrice: number | null = (() => {
    if (!product) return null;
    if (typeof product.price === "number") return product.price;
    const parsed = Number(product.price);
    return Number.isFinite(parsed) ? parsed : null;
  })();

  const getSizesForVariant = (vid?: string | null) => {
    if (!variants || variants.length === 0) return [] as SizeQuantity[];
    const v = variants.find(
      (x) => (x.id ?? x.color ?? String(x)) === vid || vid == null,
    );
    if (!v) return [] as SizeQuantity[];
    return (v.sizeQuantities || []) as SizeQuantity[];
  };

  const aggregateSizes = () => {
    const map: Record<string, number> = {};
    for (const v of variants) {
      (v.sizeQuantities || []).forEach((sq: SizeQuantity) => {
        const key = String(sq.size);
        map[key] = (map[key] || 0) + (Number(sq.quantity) || 0);
      });
    }
    return Object.keys(map).map((k) => ({ size: k, quantity: map[k] }));
  };

  // Do not show sizes until a color variant is selected
  const sizesToShow = selectedVariantId
    ? getSizesForVariant(selectedVariantId)
    : ([] as SizeQuantity[]);

  // Automatically select first variant if user tries to select a size without choosing color
  const handleSizeSelection = (size: string, qty: number) => {
    if (!selectedVariantId && variants.length > 0) {
      // Find variant that has this size
      const matchingVariant = variants.find((v) =>
        (v.sizeQuantities || []).some((sq) => String(sq.size) === size),
      );
      if (matchingVariant) {
        const vid = matchingVariant.id ?? matchingVariant.color ?? "0";
        setSelectedVariantId(vid);
        setSelectedSize(size);
        return;
      }
    }
    if (qty > 0) {
      setSelectedSize(size);
    }
  };

  const selectedVariant = variants.find(
    (v) => String(v.id ?? v.color ?? String(v)) === String(selectedVariantId),
  );

  const mainImageSrc =
    selectedVariant?.image ||
    product?.groupImage ||
    product?.image ||
    (variants[0] && variants[0].image) ||
    `https://via.placeholder.com/400x600?text=${encodeURIComponent(
      displayName || "Product",
    )}`;

  const singleItemPromo = applyBestPromotionToLine({
    unitPriceTHB: displayPrice || 0,
    quantity: 1,
    productId: id,
    variantId: selectedVariantId || undefined,
    promotions: onlinePromotions,
  });
  const displayFinalPrice =
    displayPrice !== null ? singleItemPromo.finalSubtotalTHB : null;

  const selectedQty = (() => {
    if (!selectedVariant) return 0;
    if (selectedSize) {
      const found = (selectedVariant.sizeQuantities || []).find(
        (s) => String(s.size) === String(selectedSize),
      );
      return Number(found?.quantity) || 0;
    }
    return (selectedVariant.sizeQuantities || []).reduce(
      (t, s) => t + (Number(s.quantity) || 0),
      0,
    );
  })();

  const selectedItemLabel = `${displayName}${selectedVariant?.color ? ` • ${selectedVariant.color}` : ""}${selectedSize ? ` • ${selectedSize}` : ""}`;

  const clampPurchaseQty = (value: number) => {
    const upperBound = Math.max(1, selectedQty);
    return Math.max(1, Math.min(Math.floor(value), upperBound));
  };

  const setPurchaseQty = (value: number) => {
    const safe = clampPurchaseQty(value);
    setSelectedPurchaseQty(safe);
    setSelectedPurchaseQtyInput(String(safe));
  };

  React.useEffect(() => {
    if (!selectedVariantId || !selectedSize || selectedQty <= 0) {
      setSelectedPurchaseQty(1);
      setSelectedPurchaseQtyInput("1");
      return;
    }

    setSelectedPurchaseQty((prev) => {
      const safe = Math.max(1, Math.min(prev, selectedQty));
      setSelectedPurchaseQtyInput(String(safe));
      return safe;
    });
  }, [selectedVariantId, selectedSize, selectedQty]);

  // Touch swipe support for mobile: swipe image to change selected color
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const selectVariantByIndex = (index: number) => {
    if (!variants || variants.length === 0) return;
    const v = variants[Math.max(0, Math.min(index, variants.length - 1))];
    const vid = v.id ?? v.color ?? String(index);
    setSelectedVariantId(vid);
    setSelectedSize("");
  };

  const selectNextVariant = () => {
    if (!variants || variants.length === 0) return;
    const idx = variants.findIndex(
      (v) => String(v.id ?? v.color ?? String(v)) === String(selectedVariantId),
    );
    if (idx === -1) {
      selectVariantByIndex(0);
    } else {
      const next = idx + 1 >= variants.length ? 0 : idx + 1;
      selectVariantByIndex(next);
    }
  };

  const selectPrevVariant = () => {
    if (!variants || variants.length === 0) return;
    const idx = variants.findIndex(
      (v) => String(v.id ?? v.color ?? String(v)) === String(selectedVariantId),
    );
    if (idx === -1) {
      selectVariantByIndex(variants.length - 1);
    } else {
      const prev = idx - 1 < 0 ? variants.length - 1 : idx - 1;
      selectVariantByIndex(prev);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchEndX.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const dx = touchStartX.current - touchEndX.current;
    const threshold = 40; // px
    if (Math.abs(dx) > threshold) {
      if (dx > 0) {
        // swipe left -> next
        selectNextVariant();
      } else {
        // swipe right -> prev
        selectPrevVariant();
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  if (loading)
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="animate-pulse">
              <div className="w-full aspect-[4/5] bg-gray-100 rounded-2xl" />
              <div className="mt-4 flex gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 w-16 rounded-xl bg-gray-100" />
                ))}
              </div>
            </div>
            <div className="animate-pulse space-y-5">
              <div className="h-5 bg-gray-100 rounded w-24" />
              <div className="h-9 bg-gray-100 rounded w-3/4" />
              <div className="h-12 bg-gray-100 rounded w-1/2" />
              <div className="h-px bg-gray-100" />
              <div className="h-4 bg-gray-100 rounded w-20" />
              <div className="flex gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 w-10 rounded-full bg-gray-100" />
                ))}
              </div>
              <div className="h-4 bg-gray-100 rounded w-20" />
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-gray-100" />
                ))}
              </div>
              <div className="h-12 bg-gray-100 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-rose-100 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
            <svg
              className="h-6 w-6 text-rose-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
          >
            Go back
          </button>
        </div>
      </div>
    );

  if (!product)
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">
            Product not found
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            This item may have been removed or is no longer available.
          </p>
          <Link
            href="/view-all"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
          >
            Browse products
          </Link>
        </div>
      </div>
    );

  const isOutOfStock = stock <= 0;
  const canPurchase = Boolean(
    selectedVariantId && selectedSize && selectedQty > 0,
  );
  const discountPercent =
    singleItemPromo.promotion && displayPrice && displayFinalPrice !== null
      ? Math.round(((displayPrice - displayFinalPrice) / displayPrice) * 100)
      : 0;
  const categoryLabel = product.category || product.description || "";

  return (
    <>
      <div className="min-h-screen">
      <div className="px-4 py-5 md:py-8 max-w-6xl mx-auto">
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
          <Link
            href="/view-all"
            className="transition-colors hover:text-rose-600"
          >
            Products
          </Link>
          {categoryLabel && (
            <>
              <span className="text-gray-300">/</span>
              <span className="hidden sm:inline">{categoryLabel}</span>
            </>
          )}
          <span className="text-gray-300 hidden sm:inline">/</span>
          <span className="truncate font-medium text-gray-900">
            {displayName}
          </span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div className="lg:sticky lg:top-6">
            <div className="w-full flex flex-col">
              {/* Main image */}
              <div className="relative overflow-hidden ">
                {/* Badges */}
                {/* <div className="absolute left-3 top-3 z-20 flex flex-col gap-2">
                  {product.isNew && !isOutOfStock && (
                    <span className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                      New
                    </span>
                  )}
                  {discountPercent > 0 && (
                    <span className="rounded-full bg-gray-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                      -{discountPercent}%
                    </span>
                  )}
                </div> */}

                {isOutOfStock && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                    <span className="rounded-full bg-gray-900/85 px-5 py-2 text-xs font-bold uppercase tracking-widest text-white">
                      Sold out
                    </span>
                  </div>
                )}

                <div className="flex aspect-[4/5] items-center justify-center p-4 md:p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mainImageSrc}
                    alt={displayName || "Product"}
                    className="h-full w-full object-contain"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                </div>

                {/* Prev / next colour arrows */}
                {variants.length > 1 && (
                  <>
                    <button
                      onClick={selectPrevVariant}
                      aria-label="Previous colour"
                      className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-rose-100 bg-white/90 p-2 text-gray-600 shadow-sm backdrop-blur transition-all hover:bg-gradient-to-r hover:from-rose-500 hover:to-pink-500 hover:text-white"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={selectNextVariant}
                      aria-label="Next colour"
                      className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-rose-100 bg-white/90 p-2 text-gray-600 shadow-sm backdrop-blur transition-all hover:bg-gradient-to-r hover:from-rose-500 hover:to-pink-500 hover:text-white"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* Image navigation thumbnails (group image + variants) */}
              <div
                className="mt-3 flex items-start gap-3 overflow-x-auto pb-2 w-full max-w-full"
                style={{
                  touchAction: "pan-x",
                  WebkitOverflowScrolling: "touch",
                  overflowY: "hidden",
                }}
              >
                {/* group image thumbnail */}
                <button
                  onClick={() => {
                    setSelectedVariantId(null);
                    setSelectedSize("");
                  }}
                  aria-pressed={!selectedVariantId}
                  className="group flex ml-8 w-16 shrink-0 flex-col items-center"
                >
                  <div
                    className={`h-16 w-16 overflow-hidden rounded-xl border-2 bg-white transition-all ${
                      !selectedVariantId
                        ? "border-rose-500 ring-2 ring-rose-200"
                        : "border-gray-200 group-hover:border-rose-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        product?.groupImage ||
                        product?.image ||
                        `https://via.placeholder.com/160x220?text=${encodeURIComponent(displayName || "Product")}`
                      }
                      alt={displayName || "Product"}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div
                    className={`mt-1.5 w-full truncate text-center text-[11px] ${
                      !selectedVariantId
                        ? "font-semibold text-rose-600"
                        : "text-gray-500"
                    }`}
                  >
                    All
                  </div>
                </button>

                {variants.map((v, idx) => {
                  const vid = v.id ?? v.color ?? String(idx);
                  const isActive = String(selectedVariantId) === String(vid);
                  return (
                    <button
                      key={vid}
                      onClick={() => {
                        setSelectedVariantId(vid);
                        setSelectedSize("");
                      }}
                      aria-pressed={isActive}
                      title={v.color}
                      className="group flex w-16 shrink-0 flex-col items-center"
                    >
                      <div
                        className={`h-16 w-16 overflow-hidden rounded-xl border-2 bg-white transition-all ${
                          isActive
                            ? "border-rose-500 ring-2 ring-rose-200"
                            : "border-gray-200 group-hover:border-rose-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            v.image ||
                            `https://via.placeholder.com/160x220?text=${encodeURIComponent(v.color || "")}`
                          }
                          alt={v.color}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div
                        className={`mt-1.5 w-full truncate text-center text-[11px] ${
                          isActive
                            ? "font-semibold text-rose-600"
                            : "text-gray-500"
                        }`}
                      >
                        {v.color}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="lg:col-span-1">
            <div className="space-y-6">
              {/* Title block */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {categoryLabel && (
                    <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">
                      {categoryLabel}
                    </span>
                  )}
                  {isOutOfStock ? (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Out of stock
                    </span>
                  ) : stock <= 5 ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                      Only {stock} left
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      In stock
                    </span>
                  )}
                </div>

                <h1 className="mt-3 text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-gray-900">
                  {displayName}
                </h1>
              </div>

              {/* Price */}
              <div className=" via-white to-white p-4 md:p-5">
                {displayPrice !== null ? (
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                    <span className="bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-3xl md:text-4xl font-bold text-transparent">
                      {formatPrice(
                        displayFinalPrice || 0,
                        displayCurrency,
                        mmkRate,
                      )}
                    </span>
                    {singleItemPromo.promotion ? (
                      <>
                        <span className="text-base text-gray-400 line-through">
                          {formatPrice(displayPrice, displayCurrency, mmkRate)}
                        </span>
                        {discountPercent > 0 && (
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                            Save {discountPercent}%
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-2xl font-semibold text-gray-400">—</span>
                )}
                {singleItemPromo.promotion?.name ? (
                  <p className="mt-2 text-xs font-medium text-rose-600">
                    {singleItemPromo.promotion.name}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Colour
                  </span>
                  
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {variants.length === 0 && (
                    <div className="text-sm text-gray-500">
                      No colours available
                    </div>
                  )}
                  {variants.map((v, idx) => {
                    const vid = v.id ?? v.color ?? String(idx);
                    const isSelected =
                      String(selectedVariantId) === String(vid);
                    return (
                      <button
                        key={vid}
                        onClick={() => {
                          setSelectedVariantId(vid);
                          setSelectedSize("");
                        }}
                        title={v.color}
                        aria-label={v.color}
                        aria-pressed={isSelected}
                        className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                          isSelected
                            ? "border-white ring-2 ring-rose-500 ring-offset-1 scale-110 shadow-md"
                            : "border-white ring-1 ring-gray-200 hover:ring-rose-300 hover:scale-105"
                        }`}
                        style={{ backgroundColor: v.colorCode || "#ddd" }}
                      >
                        {isSelected && (
                          <svg
                            className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })}

                  {selectedVariantId && (
                    <button
                      onClick={() => {
                        setSelectedVariantId(null);
                        setSelectedSize("");
                      }}
                      className="ml-1 text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-rose-600 hover:decoration-rose-300"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* optional model info */}
                {product.modelInfo && (
                  <p className="mt-3 text-xs text-gray-500">
                    Model is wearing size{" "}
                    <span className="font-semibold text-gray-700">
                      {product.modelInfo}
                    </span>
                  </p>
                )}
              </div>

              {/* Sizes */}
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Size
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!selectedVariantId ? (
                    <div className="w-full rounded-xl border border-dashed border-rose-200 bg-rose-50/40 px-4 py-3 text-xs text-gray-500">
                      Pick a colour first to see available sizes
                    </div>
                  ) : (sizesToShow || []).length === 0 ? (
                    <div className="w-full rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                      No sizes available for this colour
                    </div>
                  ) : null}
                  {(sizesToShow || []).map((sq: SizeQuantity) => {
                    const qty = Number(sq.quantity) || 0;
                    const isSelected = selectedSize === String(sq.size);
                    return (
                      <button
                        key={String(sq.size)}
                        onClick={() => handleSizeSelection(String(sq.size), qty)}
                        disabled={qty === 0}
                        title={
                          qty === 0
                            ? "Out of stock"
                            : `${qty} available`
                        }
                        className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-lg border-2 px-3 py-1.5 text-xs font-semibold transition-all ${
                          isSelected
                            ? "border-transparent bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md"
                            : qty === 0
                              ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through"
                              : "border-gray-200 bg-white text-gray-700 hover:border-rose-300 hover:bg-rose-50/50 hover:text-rose-600"
                        }`}
                      >
                        {String(sq.size)}
                      </button>
                    );
                  })}
                </div>
              </div>

                {/* Selected item summary */}
                {canPurchase && (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium text-gray-500">
                        Selected
                      </span>
                      <span className="text-right text-sm font-semibold text-gray-900">
                        {selectedItemLabel}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium text-gray-500">
                        Unit price
                      </span>
                      <span className="text-right text-sm font-semibold text-gray-900">
                        {displayPrice !== null ? (
                          <>
                            {singleItemPromo.promotion ? (
                              <span className="mr-2 text-xs font-normal text-gray-400 line-through">
                                {formatPrice(
                                  displayPrice,
                                  displayCurrency,
                                  mmkRate,
                                )}
                              </span>
                            ) : null}
                            <span>
                              {formatPrice(
                                displayFinalPrice || 0,
                                displayCurrency,
                                mmkRate,
                              )}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-gray-500">
                        Available
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {selectedQty} in stock
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs font-medium text-gray-500">
                        Quantity
                      </span>
                      <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() =>
                            setPurchaseQty(selectedPurchaseQty - 1)
                          }
                          disabled={
                            selectedQty <= 0 || selectedPurchaseQty <= 1
                          }
                          className="px-3 py-2 text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min={1}
                          max={Math.max(1, selectedQty)}
                          value={selectedPurchaseQtyInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (!/^\d*$/.test(raw)) return;

                            setSelectedPurchaseQtyInput(raw);

                            if (raw === "") return;

                            const parsed = Number(raw);
                            if (!Number.isFinite(parsed)) return;

                            setSelectedPurchaseQty(clampPurchaseQty(parsed));
                          }}
                          onBlur={() => {
                            const parsed = Number(selectedPurchaseQtyInput);
                            if (!Number.isFinite(parsed)) {
                              setPurchaseQty(selectedPurchaseQty);
                              return;
                            }

                            setPurchaseQty(parsed);
                          }}
                          className="w-12 border-x border-gray-100 py-2 text-center text-sm font-semibold text-gray-900 outline-none [appearance:textfield]"
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() =>
                            setPurchaseQty(selectedPurchaseQty + 1)
                          }
                          disabled={
                            selectedQty <= 0 ||
                            selectedPurchaseQty >= selectedQty
                          }
                          className="px-3 py-2 text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Subtotal
                      </span>
                      <span className="bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-lg font-bold text-transparent">
                        {formatPrice(
                          (displayFinalPrice || 0) * selectedPurchaseQty,
                          displayCurrency,
                          mmkRate,
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Call to action */}
                <div>
                  {!canPurchase && !isOutOfStock && (
                    <p className="mb-2.5 text-xs text-gray-500">
                      {!selectedVariantId
                        ? "Choose a colour and size to continue."
                        : "Choose a size to continue."}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <button
                          onClick={() => {
                            if (!user) {
                              const redirectPath = `/product/${id}`;
                              router.push(
                                `/auth/login?redirect=${encodeURIComponent(redirectPath)}`,
                              );
                              return;
                            }

                            // Find the actual variant that has the selected size
                            let effectiveVariantId = selectedVariantId;
                            let effectiveColor = selectedVariant?.color || "";
                            
                            if (!effectiveVariantId && selectedSize) {
                              const matchingVariant = variants.find((v) =>
                                (v.sizeQuantities || []).some(
                                  (sq) => String(sq.size) === selectedSize,
                                ),
                              );
                              if (matchingVariant) {
                                effectiveVariantId = matchingVariant.id ?? matchingVariant.color ?? "0";
                                effectiveColor = matchingVariant.color || "";
                              } else if (variants.length > 0) {
                                effectiveVariantId = variants[0].id ?? variants[0].color ?? "0";
                                effectiveColor = variants[0].color || "";
                              }
                            }

                            addItem({
                              id: `${id}:${String(effectiveVariantId)}:${selectedSize}`,
                              productId: id,
                              name: displayName || "Product",
                              image:
                                selectedVariant?.image ||
                                product?.groupImage ||
                                product?.image ||
                                "",
                              variantId: String(effectiveVariantId || "0"),
                              color: effectiveColor,
                              size: selectedSize,
                              unitPriceTHB: Number(
                                displayFinalPrice || displayPrice || 0,
                              ),
                              quantity: selectedPurchaseQty,
                              maxQuantity: selectedQty,
                            });
                          }}
                          disabled={!canPurchase}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-rose-200 bg-white px-5 py-3 text-sm font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white"
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
                              d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13 5.4 5M7 13l-.7 3.5h11.4M9 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
                            />
                          </svg>
                          {user ? "Add to Cart" : "Login to Add"}
                        </button>
                        <button
                          onClick={() => {
                            if (!user) {
                              const redirectPath = `/product/${id}`;
                              router.push(
                                `/auth/login?redirect=${encodeURIComponent(redirectPath)}`,
                              );
                              return;
                            }

                            // Find the actual variant that has the selected size
                            let effectiveVariantId = selectedVariantId;
                            if (!effectiveVariantId && selectedSize) {
                              const matchingVariant = variants.find((v) =>
                                (v.sizeQuantities || []).some(
                                  (sq) => String(sq.size) === selectedSize,
                                ),
                              );
                              if (matchingVariant) {
                                effectiveVariantId = matchingVariant.id ?? matchingVariant.color ?? "0";
                              } else if (variants.length > 0) {
                                effectiveVariantId = variants[0].id ?? variants[0].color ?? "0";
                              }
                            }

                            const query = new URLSearchParams({
                              productId: id,
                              variant: String(effectiveVariantId || "0"),
                              size: selectedSize,
                              qty: String(selectedPurchaseQty),
                            });
                            router.push(`/checkout?${query.toString()}`);
                          }}
                          disabled={!canPurchase}
                          className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
                        >
                          {isOutOfStock
                            ? "Sold out"
                            : user
                              ? "Buy Now"
                              : "Login to Buy"}
                        </button>
                  </div>
                </div>

                {/* Reassurance */}
                <ul className="grid gap-3 border-t border-gray-100 pt-5 sm:grid-cols-3">
                  {[
                    "100% authentic",
                    "Free 7-day returns",
                    "Member discounts",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-xs text-gray-600"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500">
                        <svg
                          className="h-3 w-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </span>
                      <span className="font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
            </div>
          </aside>
        </div>
      </div>
      </div>
      {/* Suggested / New items list */}
      <div className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-10">
          <div className="text-center">
            <p className="mb-1 text-xs md:text-sm font-medium uppercase tracking-[0.15em] text-gray-400">
              You may also like
            </p>
            <h2 className="mb-2 text-3xl md:text-4xl font-semibold uppercase tracking-[0.2em] text-gray-900">
              New Arrivals
            </h2>
            <div className="flex items-center justify-center gap-4 md:gap-6">
              <div className="h-px w-12 md:w-16 bg-gray-300" />
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-rose-500 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 64 64"
                aria-hidden
              >
                <path d="M16 14 Q10 8, 6 10 Q2 12, 2 16 Q2 20, 6 22 Q10 24, 16 18 L16 14 Z" />
                <path d="M48 14 Q54 8, 58 10 Q62 12, 62 16 Q62 20, 58 22 Q54 24, 48 18 L48 14 Z" />
                <rect x="26" y="12" width="12" height="10" rx="2" />
                <path d="M20 22 L14 48 L18 44 L24 22 Z" />
                <path d="M44 22 L50 48 L46 44 L40 22 Z" />
              </svg>
              <div className="h-px w-12 md:w-16 bg-gray-300" />
            </div>
          </div>
        </div>

        <div className="w-full pb-12 pt-4">
          <ProductsList showOnlyNew itemsPerPageDefault={20} hideFilters />
        </div>
      </div>
    </>
  );
}
