"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProductsList from "../components/ProductsList";
import RecommendedProducts from "../components/RecommendedProducts";
import { productImageProps } from "../lib/productImage";
import { useNewItems } from "../hooks/useNewItems";
import { useTopSelling } from "../hooks/useTopSelling";

// Decorative shapes component
function DecorativeShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Large rose circle - top right */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-rose-300/20 rounded-full blur-3xl" />
      {/* Pink circle - bottom left */}
      <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-pink-200/25 rounded-full blur-3xl" />
      {/* Small pink accent - middle */}
      <div className="absolute top-1/3 right-1/4 w-40 h-40 bg-pink-300/15 rounded-full blur-2xl" />
    </div>
  );
}

function HeroSection({ branch }: { branch?: string }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const { data: items = [], isLoading: loading } = useNewItems(4, branch);

  // Switching branch swaps the whole item set, which can leave `current`
  // pointing past the end of a shorter list. Clamp while rendering instead of
  // resetting in an effect, so there's no extra render pass.
  const safeIndex = items.length > 0 ? Math.min(current, items.length - 1) : 0;

  useEffect(() => {
    if (!items.length) return;
    if (paused) return;
    const id = setInterval(() => {
      setCurrent((c) => (c === items.length - 1 ? 0 : c + 1));
    }, 5000);
    return () => clearInterval(id);
  }, [items, paused]);

  if (loading) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-50 via-pink-50 to-white p-8 md:p-16 shadow-xl border border-pink-100">
      <DecorativeShapes />

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left: Text Content */}
        <div className="flex flex-col justify-center space-y-6">
          <div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
              Style Meets
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
                Quality
              </span>
            </h1>
          </div>

          <p className="text-gray-700 text-base md:text-lg leading-relaxed max-w-md">
            Shop your style • Latest trends • Affordable luxury • Fast delivery
          </p>

          <div className="space-y-3 text-sm md:text-base text-gray-600">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500"></div>
              <span className="font-medium">100% Authentic Products</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500"></div>
              <span className="font-medium">Free Returns Within 7 Days</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500"></div>
              <span className="font-medium">Exclusive Member Benefits</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/new-arrivals"
              className="inline-block px-10 py-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
            >
              Shop Now
            </Link>
          </div>
        </div>

        {/* Right: Product Image Carousel. Rendered only when the selected
            branch actually has new items — the surrounding hero copy and CTA
            stay visible either way. */}
        {items.length > 0 && (
        <div className="relative h-80 md:h-96">
          {/* Plain <img> rather than next/image: these are remote R2 objects
              that can 404, and only a raw element gives us an onError hook to
              swap in the local fallback. "/fallback.png" was referenced here
              but does not exist in public/, so failures showed as broken. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...productImageProps({
              image: items[safeIndex]?.image,
              groupImage: items[safeIndex]?.groupImage,
            })}
            alt={items[safeIndex]?.name || "Product"}
            className="absolute inset-0 h-full w-full object-contain drop-shadow-2xl"
          />

          {/* Carousel controls */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`transition-all duration-300 rounded-full ${
                  idx === safeIndex
                    ? "bg-gradient-to-r from-rose-500 to-pink-500 w-8 h-3 shadow-md"
                    : "bg-gray-300 hover:bg-rose-300 w-3 h-3"
                }`}
              />
            ))}
          </div>

          {/* Navigation arrows */}
          <button
            onClick={() =>
              setCurrent(safeIndex === 0 ? items.length - 1 : safeIndex - 1)
            }
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 bg-white hover:bg-gradient-to-r hover:from-rose-500 hover:to-pink-500 text-gray-700 hover:text-white rounded-full p-3 shadow-lg hover:shadow-xl transition-all duration-300 border border-rose-200"
          >
            ‹
          </button>
          <button
            onClick={() =>
              setCurrent(safeIndex === items.length - 1 ? 0 : safeIndex + 1)
            }
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-6 bg-white hover:bg-gradient-to-r hover:from-rose-500 hover:to-pink-500 text-gray-700 hover:text-white rounded-full p-3 shadow-lg hover:shadow-xl transition-all duration-300 border border-rose-200"
          >
            ›
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const searchParams = useSearchParams();
  const branch = searchParams?.get("branch") || "";

  // Fetch top-selling products for the best sellers section. The limit caps how
  // many products that section can show, so it must not be lower than the
  // section's page size (24).
  const { topSelling, loading: topSellingLoading } = useTopSelling({
    branch: branch || undefined,
    limit: 24,
    autoLoad: true,
  });

  const topSellingProductIds = topSelling.map(p => p.productId);

  // productId -> units sold, so the cards can show "N sold"
  const topSellingQuantities = React.useMemo(
    () =>
      topSelling.reduce<Record<string, number>>((acc, p) => {
        acc[p.productId] = p.quantitySold;
        return acc;
      }, {}),
    [topSelling],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-pink-50/30 to-white font-sans text-gray-900">
      {/* Main Content */}
      <div className="py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
          {/* Hero Section */}
          <HeroSection branch={branch} />
        </div>

        {/* New Arrivals Section */}
        <section className="mt-8 md:mt-12">
          <div className="text-center mb-3 px-4 sm:px-6 md:px-8">
            <p className="text-xs md:text-sm text-gray-400 uppercase tracking-[0.15em] mb-1 font-medium">
              Latest Collection
            </p>
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 uppercase tracking-[0.2em] mb-2">
              New Arrivals
            </h2>
            <div className="flex items-center justify-center gap-4 md:gap-6">
              <div className="h-px w-12 md:w-16 bg-gray-300" />
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-rose-500 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 64 64"
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
          <ProductsList
            showOnlyNew={true}
            itemsPerPageDefault={24}
            hideFilters={true}
            showLoadMoreButton={true}
            loadMoreLink="/new-arrivals"
            hideSortBy={true}
          />
        </section>

        {/* Best Sellers Section */}
        <section className="mt-8 md:mt-12">
          <div className="text-center mb-3 px-4 sm:px-6 md:px-8">
            <p className="text-xs md:text-sm text-gray-400 uppercase tracking-[0.15em] mb-1 font-medium">
              Customer Favorites
            </p>
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 uppercase tracking-[0.2em] mb-2">
              Best Sellers
            </h2>
            <div className="flex items-center justify-center gap-4 md:gap-6">
              <div className="h-px w-12 md:w-16 bg-gray-300" />
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-rose-500 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 64 64"
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
          <ProductsList
            showOnlyNew={false}
            itemsPerPageDefault={24}
            hideFilters={true}
            showLoadMoreButton={true}
            loadMoreLink="/best-sellers"
            hideSortBy={true}
            topSellingIds={topSellingProductIds}
            topSellingQuantities={topSellingQuantities}
            sortByTopSelling={true}
            topSellingLoading={topSellingLoading}
          />
        </section>

        {/* Personalised suggestions. Renders nothing until the shopper has
            browsed, searched, or bought something. */}
        <RecommendedProducts branch={branch} pageSize={24} />
      </div>
    </div>
  );
}
