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

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-semibold text-gray-900">Your Cart</h1>
        <p className="mt-4 text-gray-600">Your cart is currently empty.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-4 py-2 text-white"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-gray-900">Your Cart</h1>
        <button
          onClick={clearCart}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Clear Cart
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    item.image ||
                    "https://via.placeholder.com/120x160?text=Item"
                  }
                  alt={item.name}
                  className="h-24 w-20 rounded-md object-cover"
                />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {item.name}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Color: {item.color || "Default"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Size: {item.size || "N/A"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    ฿ {item.unitPriceTHB.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={item.maxQuantity || 999}
                  value={item.quantity}
                  onChange={(e) =>
                    updateQuantity(item.id, Number(e.target.value || 1))
                  }
                  className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-sm"
                />
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  className="ml-2 rounded-md border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {discountTHB > 0 ? (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {promoTitle}
          </div>
        ) : null}

        <div className="flex items-center justify-between py-1 text-sm text-gray-700">
          <span>Subtotal (THB)</span>
          <span className="font-semibold">฿ {subtotalTHB.toFixed(2)}</span>
        </div>
        {discountTHB > 0 ? (
          <div className="flex items-center justify-between py-1 text-sm text-emerald-700">
            <span>Promotion Discount (THB)</span>
            <span className="font-semibold">-฿ {discountTHB.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between py-1 text-sm text-gray-700">
          <span>Subtotal (MMK)</span>
          <span className="font-semibold">
            Ks {subtotalMMK.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-sm text-gray-900">
          <span>Total After Discount</span>
          <span className="font-bold">
            ฿ {finalSubtotalTHB.toFixed(2)} / Ks{" "}
            {finalSubtotalMMK.toLocaleString()}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => router.push("/checkout")}
            className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-5 py-2 text-white"
          >
            Proceed to Checkout
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
