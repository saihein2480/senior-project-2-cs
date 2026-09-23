"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "../../contexts/CartContext";
import { useCurrencyRate } from "../../hooks/useSettings";
import { useOnlinePromotions } from "../../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../../lib/onlinePromotion";

export default function CartPage() {
  const router = useRouter();
  const { items, subtotalTHB, removeItem, updateQuantity, clearCart } =
    useCart();
  const { rate: mmkRate } = useCurrencyRate();
  const { data: onlinePromotions = [] } = useOnlinePromotions();

  const discountTHB = items.reduce((sum, item) => {
    const applied = applyBestPromotionToLine({
      unitPriceTHB: item.unitPriceTHB,
      quantity: item.quantity,
      productId: item.productId,
      variantId: item.variantId,
      promotions: onlinePromotions,
    });
    return sum + applied.discountTHB;
  }, 0);

  const promoTitle = (() => {
    for (const item of items) {
      const applied = applyBestPromotionToLine({
        unitPriceTHB: item.unitPriceTHB,
        quantity: item.quantity,
        productId: item.productId,
        variantId: item.variantId,
        promotions: onlinePromotions,
      });
      if (applied.promotion?.name) return applied.promotion.name;
    }
    return "Promotion";
  })();

  const finalSubtotalTHB = Math.max(0, subtotalTHB - discountTHB);
  const finalSubtotalMMK = Math.round(finalSubtotalTHB * mmkRate);

  const subtotalMMK = Math.round(subtotalTHB * mmkRate);

  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) {
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
              Your cart is empty
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Browse the collection and add something you love.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
            >
              Continue Shopping
            </Link>
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
          <Link
            href="/view-all"
            className="transition-colors hover:text-rose-600"
          >
            Products
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-900">Cart</span>
        </nav>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">
              {items.length} {items.length === 1 ? "item" : "items"} ·{" "}
              {totalUnits} {totalUnits === 1 ? "unit" : "units"}
            </span>
            <h1 className="mt-3 text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-gray-900">
              Your Cart
            </h1>
          </div>
          <button
            onClick={clearCart}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.9 12a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 7m5 4v6m4-6v6M4 7h16M9 7V4h6v3"
              />
            </svg>
            Clear Cart
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          {/* Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                  {/* Image */}
                  <div className="shrink-0 overflow-hidden rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/60 via-white to-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        item.image ||
                        "https://via.placeholder.com/120x160?text=Item"
                      }
                      alt={item.name}
                      className="h-28 w-24 object-cover"
                    />
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base md:text-lg font-semibold leading-snug text-gray-900">
                        {item.name}
                      </h2>
                      <button
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        title="Remove from cart"
                        className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600">
                        {item.color || "Default"}
                      </span>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                        Size {item.size || "N/A"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          Unit price
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-gray-900">
                          ฿ {item.unitPriceTHB.toFixed(2)}
                        </div>
                      </div>

                      {/* Quantity stepper */}
                      <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          className="px-3 py-2 text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={item.maxQuantity || 999}
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.id, Number(e.target.value || 1))
                          }
                          aria-label={`Quantity for ${item.name}`}
                          className="w-14 border-x border-gray-100 py-2 text-center text-sm font-semibold text-gray-900 outline-none [appearance:textfield]"
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          className="px-3 py-2 text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order summary */}
          <div className="lg:sticky lg:top-6 space-y-5">
            <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 via-white to-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Order Summary
              </h2>

              {discountTHB > 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
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
                    {promoTitle}
                  </span>
                </div>
              ) : null}

              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">
                    Subtotal (THB)
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    ฿ {subtotalTHB.toFixed(2)}
                  </span>
                </div>

                {discountTHB > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-emerald-700">
                      Promotion Discount (THB)
                    </span>
                    <span className="text-sm font-semibold text-emerald-700">
                      -฿ {discountTHB.toFixed(2)}
                    </span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-gray-500">
                    Subtotal (MMK)
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    Ks {subtotalMMK.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-4 border-t border-rose-100 pt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Total After Discount
                </div>
                <div className="mt-1 bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-2xl md:text-3xl font-bold text-transparent">
                  ฿ {finalSubtotalTHB.toFixed(2)}
                </div>
                <div className="mt-0.5 text-sm font-medium text-gray-500">
                  Ks {finalSubtotalMMK.toLocaleString()}
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <button
                  onClick={() => router.push("/checkout")}
                  className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
                >
                  Proceed to Checkout
                </button>
                <Link
                  href="/view-all"
                  className="inline-flex w-full items-center justify-center rounded-full border-2 border-rose-200 bg-white px-5 py-3 text-sm font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>

            {/* Reassurance */}
            {/* <ul className="space-y-2.5 px-1">
              {[
                "100% authentic",
                "Free 7-day returns",
                "Member discounts",
              ].map((text) => (
                <li
                  key={text}
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
                  <span className="font-medium">{text}</span>
                </li>
              ))}
            </ul> */}
          </div>
        </div>
      </div>
    </div>
  );
}
