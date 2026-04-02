"use client";

import React, { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import ProductsList from "../../../components/ProductsList";
import { useProduct } from "../../../hooks/useProducts";
import { useCurrencyRate } from "../../../hooks/useSettings";
import { useCart } from "../../../contexts/CartContext";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";
import { useOnlinePromotions } from "../../../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../../../lib/onlinePromotion";

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
  const mmkPrice =
    displayFinalPrice !== null ? Math.round(displayFinalPrice * mmkRate) : null;

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
      <div className="min-h-screen flex items-center justify-center p-6">
        \
        <div className="max-w-5xl w-full grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="animate-pulse">
            <div className="w-full bg-gray-100 rounded-md h-[420px] xl:h-[550px]" />
            <div className="mt-4 h-6 bg-gray-100 rounded w-3/4" />
            <div className="mt-2 h-4 bg-gray-100 rounded w-1/2" />
          </div>
          <div className="animate-pulse">
            <div className="h-6 bg-gray-100 rounded w-1/3 mb-4" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-5/6" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    );
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!product) return <div className="p-6">No product</div>;

  return (
    <>
      <div className="p-4 xl:p-8 max-w-[1100px] mx-auto">
        <div className="mb-4">
          <button
            onClick={() => router.back()}
            className="text-sm underline text-gray-700"
          >
            <svg
              width="61"
              height="14"
              viewBox="0 0 61 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-gray-600"
            >
              <path
                d="M60.25 6.75H0.75M0.75 6.75L6.75 0.75M0.75 6.75L6.75 12.75"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>{" "}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:[grid-template-columns:450px_1fr] gap-10 xl:gap-20 items-start">
          <div>
            <div className="w-full bg-white overflow-visible flex items-center justify-center xl:w-[450px] xl:min-h-[550px] h-auto flex-col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mainImageSrc}
                alt={displayName || "Product"}
                className="w-full h-auto xl:w-[450px] xl:max-h-[550px] object-contain"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />

              {/* Image navigation thumbnails (group image + variants) */}
              <div
                className="mt-3 flex items-start gap-3 overflow-x-auto pb-2 w-full max-w-full"
                style={{
                  touchAction: "pan-x",
                  WebkitOverflowScrolling: "touch",
                  overflowY: "hidden",
                  scrollbarWidth: "auto",
                }}
              >
                {/* group image thumbnail */}
                <button
                  onClick={() => {
                    setSelectedVariantId(null);
                    setSelectedSize("");
                  }}
                  aria-pressed={!selectedVariantId}
                  className={`flex flex-col items-center w-20 shrink-0`}
                >
                  <div
                    className={`w-16 h-16 rounded overflow-hidden border ${!selectedVariantId ? "border-pink-300 shadow-sm" : "border-gray-200"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        product?.groupImage ||
                        product?.image ||
                        `https://via.placeholder.com/160x220?text=${encodeURIComponent(displayName || "Product")}`
                      }
                      alt={displayName || "Product"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Default</div>
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
                      className={`flex flex-col items-center w-20 shrink-0 inline-flex`}
                    >
                      <div
                        className={`w-16 h-16 rounded overflow-hidden border ${isActive ? "border-pink-300 shadow-sm" : "border-gray-200"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            v.image ||
                            `https://via.placeholder.com/160x220?text=${encodeURIComponent(v.color || "")}`
                          }
                          alt={v.color}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {v.color}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="p-2 xl:p-6 rounded xl:col-span-1 xl:pl-10">
            <div className="space-y-3">
              <div className="text-2xl xl:text-3xl font-bold text-gray-900">
                {displayName}
              </div>

              <div className="mt-1 text-2xl xl:text-3xl text-gray-900">
                {displayPrice !== null ? (
                  <>
                    {singleItemPromo.promotion ? (
                      <span className="mr-3 text-base text-gray-400 line-through align-middle">
                        {Number.isInteger(displayPrice)
                          ? `฿ ${displayPrice.toFixed(0)}`
                          : `฿ ${displayPrice.toFixed(2)}`}
                      </span>
                    ) : null}
                    <span className="font-semibold text-2xl md:text-3xl">
                      {Number.isInteger(displayFinalPrice || 0)
                        ? `฿ ${(displayFinalPrice || 0).toFixed(0)}`
                        : `฿ ${(displayFinalPrice || 0).toFixed(2)}`}
                    </span>
                    <span className="text-gray-500 ml-3">{` / ${Math.round(
                      (displayFinalPrice || 0) * mmkRate,
                    ).toLocaleString()} Ks`}</span>
                  </>
                ) : (
                  "—"
                )}
              </div>

              <div className="text-base text-gray-600 mt-2">
                <span className="text-sm text-gray-500">Category: </span>
                <span className="font-medium text-base text-gray-900 ml-2">
                  {product.category || product.description || "—"}
                </span>
              </div>

              <div>
                <div className="text-base text-gray-700 mb-1">
                  <span className="font-medium">Color :</span>
                  <span className="font-semibold text-gray-900 ml-2">
                    {selectedVariant?.color || ""}
                  </span>
                </div>
                <div
                  className="flex flex-wrap items-center gap-3 mb-3 mt-3 p-2 w-full max-w-full xl:max-h-none xl:flex-nowrap xl:overflow-x-auto xl:whitespace-nowrap"
                  style={{
                    WebkitOverflowScrolling: "touch",
                    overflowY: "hidden",
                    scrollbarWidth: "auto",
                  }}
                >
                  {variants.length === 0 && (
                    <div className="text-sm text-gray-500">No colors</div>
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
                        className={`w-8 h-8 rounded-full border-2 transition-all inline-flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "ring-2 ring-offset-1 ring-blue-300 border-transparent"
                            : "border-gray-300"
                        }`}
                        style={{ backgroundColor: v.colorCode || "#ddd" }}
                      />
                    );
                  })}
                </div>

                {/* Clear button placed below swatches so it doesn't scroll with them */}
                {selectedVariantId && (
                  <div className="mt-4 mb-4 ">
                    <button
                      onClick={() => {
                        setSelectedVariantId(null);
                        setSelectedSize("");
                      }}
                      className="px-4 py-2 text-base bg-red-50 text-red-600 rounded inline-flex"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* optional model info */}
                {product.modelInfo && (
                  <div className="text-sm text-gray-700 mb-2">
                    Model is size {product.modelInfo}
                  </div>
                )}

                <div className="text-base text-gray-700 mb-2">
                  <span className="font-medium">Size :</span>
                  <span className="font-semibold text-gray-900 ml-2">
                    {selectedSize || ""}
                  </span>
                </div>

                <div
                  className="flex gap-2 overflow-x-auto pb-2 whitespace-nowrap w-full max-w-full xl:grid xl:grid-cols-4 xl:gap-3 xl:overflow-visible xl:whitespace-normal"
                  style={{
                    WebkitOverflowScrolling: "touch",
                    overflowY: "hidden",
                    scrollbarWidth: "auto",
                  }}
                >
                  {!selectedVariantId ? (
                    <div className="text-xs text-gray-500">
                      Select a color to view sizes
                    </div>
                  ) : (sizesToShow || []).length === 0 ? (
                    <div className="text-xs text-gray-500">No sizes</div>
                  ) : null}
                  {(sizesToShow || []).map((sq: SizeQuantity) => {
                    const qty = Number(sq.quantity) || 0;
                    const isSelected = selectedSize === String(sq.size);
                    return (
                      <button
                        key={String(sq.size)}
                        onClick={() =>
                          qty > 0 && setSelectedSize(String(sq.size))
                        }
                        disabled={qty === 0}
                        className={`px-4 py-3 border rounded text-base transition-colors inline-flex items-center justify-center ${
                          isSelected
                            ? "bg-pink-300  text-white border-pink-300"
                            : qty === 0
                              ? "bg-white text-gray-400 border-gray-200 line-through opacity-60"
                              : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span className="font-semibold">{String(sq.size)}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected item summary */}
                {selectedVariantId && selectedSize && (
                  <div className="mt-4 border-t pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Selected Item:
                      </div>
                      <div className="text-base font-medium text-right">
                        {selectedItemLabel}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">Price:</div>
                      <div className="text-base font-medium text-right">
                        {displayPrice !== null ? (
                          <>
                            {singleItemPromo.promotion ? (
                              <span className="text-sm text-gray-400 line-through mr-2">
                                {Number.isInteger(displayPrice)
                                  ? `฿ ${displayPrice.toFixed(0)}`
                                  : `฿ ${displayPrice.toFixed(2)}`}
                              </span>
                            ) : null}
                            <span className="font-semibold">
                              {Number.isInteger(displayFinalPrice || 0)
                                ? `฿ ${(displayFinalPrice || 0).toFixed(0)}`
                                : `฿ ${(displayFinalPrice || 0).toFixed(2)}`}
                            </span>
                            {mmkPrice !== null ? (
                              <span className="text-gray-500 text-sm ml-2">
                                / {mmkPrice.toLocaleString()} Ks
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Available Quantity
                      </div>
                      <div className="text-base font-medium text-right">
                        {selectedQty}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Order Quantity
                      </div>
                      <div className="inline-flex items-center rounded-md border border-gray-300 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setPurchaseQty(selectedPurchaseQty - 1)
                          }
                          disabled={
                            selectedQty <= 0 || selectedPurchaseQty <= 1
                          }
                          className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          -
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
                          className="w-12 text-center text-sm font-medium text-gray-900 outline-none [appearance:textfield]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPurchaseQty(selectedPurchaseQty + 1)
                          }
                          disabled={
                            selectedQty <= 0 ||
                            selectedPurchaseQty >= selectedQty
                          }
                          className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="pt-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => {
                            if (!user) {
                              const redirectPath = `/product/${id}`;
                              router.push(
                                `/auth/login?redirect=${encodeURIComponent(redirectPath)}`,
                              );
                              return;
                            }

                            addItem({
                              id: `${id}:${String(selectedVariantId)}:${selectedSize}`,
                              productId: id,
                              name: displayName || "Product",
                              image:
                                selectedVariant?.image ||
                                product?.groupImage ||
                                product?.image ||
                                "",
                              variantId: String(selectedVariantId),
                              color: selectedVariant?.color || "",
                              size: selectedSize,
                              unitPriceTHB: Number(
                                displayFinalPrice || displayPrice || 0,
                              ),
                              quantity: selectedPurchaseQty,
                              maxQuantity: selectedQty,
                            });
                          }}
                          disabled={selectedQty <= 0}
                          className="w-full rounded-md border border-pink-300 bg-white px-4 py-2 text-pink-600 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user ? "Add to Cart" : "Login to Add to Cart"}
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

                            const query = new URLSearchParams({
                              productId: id,
                              variant: String(selectedVariantId),
                              size: selectedSize,
                              qty: String(selectedPurchaseQty),
                            });
                            router.push(`/checkout?${query.toString()}`);
                          }}
                          disabled={selectedQty <= 0}
                          className="w-full rounded-md bg-pink-500 px-4 py-2 text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user ? "Buy Now" : "Login to Buy"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
      {/* Suggested / New items list */}
      <div className="mt-10">
        <div className="flex items-center max-w-[1100px] mx-auto px-4 xl:px-0">
          <div className="flex-1 h-px bg-pink-300" />
          <h2 className="px-6 text-2xl font-pacifico text-center text-pink-400">
            Suggest Items
          </h2>
          <div className="flex-1 h-px bg-pink-300" />
        </div>

        <div className="max-w-[1100px] mx-auto pb-12 pt-6">
          <ProductsList showOnlyNew itemsPerPageDefault={20} hideFilters />
        </div>
      </div>
    </>
  );
}
