"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "../contexts/LanguageContext";
import { useCurrencyRate } from "../hooks/useSettings";
import { useCurrency, formatPrice } from "../hooks/useCurrency";
import { useOnlinePromotions } from "../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../lib/onlinePromotion";
import { useRecommendations } from "../hooks/useRecommendations";
import { productImageProps } from "../lib/productImage";

/**
 * "You May Like" — personalised suggestions from the shopper's own browsing,
 * searching and buying.
 *
 * Renders nothing at all until there is something to personalise from, so a
 * brand-new visitor sees the normal homepage rather than an empty shelf.
 */
export default function RecommendedProducts({
  branch,
  pageSize = 24,
}: {
  branch?: string;
  /** Products shown per batch; "Load More" reveals another batch. */
  pageSize?: number;
}) {
  const { t } = useLanguage();
  const { rate: mmkRate } = useCurrencyRate();
  const displayCurrency = useCurrency();
  const { data: onlinePromotions = [] } = useOnlinePromotions();

  // Unlimited: the full ranking is paginated here rather than in the hook, so
  // "Load More" needs no refetch or re-rank.
  const { recommendations, hasSignals, loading } = useRecommendations({
    branch,
  });

  const [visibleCount, setVisibleCount] = useState(pageSize);

  // No history yet, still resolving, or nothing in the catalogue matches this
  // shopper's taste — in every case there is no honest section to show.
  if (!hasSignals || loading || recommendations.length === 0) return null;

  const visible = recommendations.slice(0, visibleCount);
  const hasMore = visibleCount < recommendations.length;

  return (
    <section className="mt-8 md:mt-12">
      <div className="text-center mb-3 px-4 sm:px-6 md:px-8">
        <p className="text-xs md:text-sm text-gray-400 uppercase tracking-[0.15em] mb-1 font-medium">
          {t("recommended_eyebrow")}
        </p>
        <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 uppercase tracking-[0.2em] mb-2">
          {t("recommended_title")}
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
        <p className="mt-2 text-xs text-gray-400">
          {t("recommended_subtitle")}
        </p>
      </div>

      {/* Same responsive grid as New Arrivals and Best Sellers, so the three
          sections line up column-for-column (6 across at 2xl). */}
      <div className="grid grid-cols-2 gap-3 px-2 py-4 sm:grid-cols-2 md:gap-4 md:px-4 md:py-6 md:grid-cols-3 lg:gap-5 lg:px-6 lg:grid-cols-4 xl:gap-6 xl:px-6 xl:grid-cols-5 2xl:grid-cols-6 bg-white">
        {visible.map(({ product: p }) => {
          const displayStock = p.stock ?? (p.price ? 10 : 0);
          const isOutOfStock = displayStock === 0;

          return (
            <Link key={p.id} href={`/product/${p.id}`} className="block">
              <div
                className={`group h-full bg-white overflow-hidden rounded-lg hover:shadow-md transition-all duration-200 flex flex-col ${
                  isOutOfStock ? "opacity-70" : ""
                }`}
              >
                {/* Image Container */}
                <div className="relative bg-gray-50 overflow-hidden flex-shrink-0">
                  {p.isNew && !isOutOfStock && (
                    <span className="absolute top-2 left-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] px-2 py-1 rounded-full z-10 font-semibold shadow-md">
                      {t("new_label")}
                    </span>
                  )}
                  {isOutOfStock && (
                    <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center">
                      <span className="text-xs font-bold text-white bg-black/60 px-2 py-1 rounded">
                        {t("out_of_stock")}
                      </span>
                    </div>
                  )}

                  <div className="w-full aspect-[3/4] overflow-hidden bg-gray-50 flex items-center justify-center p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      {...productImageProps(p)}
                      alt={p.name}
                      className={`w-full h-full object-contain block transition-transform duration-300 group-hover:scale-105 ${
                        isOutOfStock ? "opacity-50" : ""
                      }`}
                    />
                  </div>

                  {/* Category Badge */}
                  {p.description && (
                    <div className="absolute bottom-1 right-1 z-10">
                      <span className="inline-block bg-white/95 text-[10px] text-gray-700 px-2 py-0.5 rounded-full font-medium truncate max-w-[120px]">
                        {p.description}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content Container */}
                <div className="p-2.5 flex flex-col flex-grow">
                  <h4 className="font-semibold text-gray-900 text-sm leading-tight truncate mb-1.5">
                    {p.name && p.name.length > 20
                      ? `${p.name.substring(0, 20)}...`
                      : p.name}
                  </h4>

                  {p.price ? (
                    <div className="text-xs text-gray-800 mb-2">
                      {(() => {
                        const basePrice = Number(p.price || 0);
                        const promo = applyBestPromotionToLine({
                          unitPriceTHB: basePrice,
                          quantity: 1,
                          productId: p.id,
                          promotions: onlinePromotions,
                        });

                        return (
                          <>
                            {promo.promotion ? (
                              <span className="mr-1.5 text-[10px] text-gray-400 line-through">
                                {formatPrice(
                                  basePrice,
                                  displayCurrency,
                                  mmkRate,
                                )}
                              </span>
                            ) : null}
                            <span className="font-bold text-rose-600">
                              {formatPrice(
                                promo.finalSubtotalTHB,
                                displayCurrency,
                                mmkRate,
                              )}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-700 mb-2">—</span>
                  )}

                  {displayStock <= 5 && !isOutOfStock && (
                    <div className="text-[10px] text-orange-600 font-semibold mb-1.5">
                      Only {displayStock} left
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Expands in place rather than linking away: there is no standalone page
          for a personalised ranking, and the full list is already in memory. */}
      {hasMore && (
        <div className="mt-4 mb-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + pageSize)}
            className="px-6 py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-medium text-sm rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
          >
            {t("load_more")}
          </button>
        </div>
      )}
    </section>
  );
}
