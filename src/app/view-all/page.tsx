"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import ProductsList from "../../components/ProductsList";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ViewAllPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const category = searchParams?.get("category") || "all";

  // Format category name for display
  const getCategoryTitle = () => {
    if (category === "all") {
      return "All Products";
    }
    // Capitalize first letter of each word
    return category
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Header Section */}
      <div className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-4 py-3 md:py-4">
          <div className="text-center">
            <p className="text-xs md:text-sm text-gray-400 uppercase tracking-[0.15em] mb-1 font-medium">
              {category === "all" ? "Explore Our Collection" : "Category"}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 uppercase tracking-[0.2em] mb-1.5">
              {getCategoryTitle()}
            </h1>
            <div className="flex items-center justify-center gap-4 md:gap-6">
              <div className="h-px w-12 md:w-16 bg-gray-300" />
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-pink-400 flex-shrink-0"
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
        </div>
      </div>

      {/* Products Section */}
      <main className="w-full">
        <ProductsList
          showOnlyNew={false}
          itemsPerPageDefault={40}
          hideFilters={true}
          showPriceFilter={true}
        />
      </main>
    </div>
  );
}
