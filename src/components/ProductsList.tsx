"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useProducts, type Product } from "../hooks/useProducts";
import { useCurrencyRate } from "../hooks/useSettings";
import { useShops } from "../hooks/useShops";
import { useOnlinePromotions } from "../hooks/useOnlinePromotions";
import { applyBestPromotionToLine } from "../lib/onlinePromotion";
import { useCurrency, formatPrice } from "../hooks/useCurrency";
import { productImageProps } from "../lib/productImage";

type SizeQuantity = {
  size?: string;
  quantity?: number | string;
};

type ColorVariant = {
  id?: string;
  color?: string;
  colorCode?: string;
  image?: string;
  sizeQuantities?: SizeQuantity[];
};

export default function ProductsList({
  showOnlyNew = false,
  itemsPerPageDefault = 40,
  hideFilters = false,
  showLoadMoreButton = false,
  loadMoreLink = "/view-all",
  hideSortBy = false,
  showPriceFilter = false,
  topSellingIds = [],
  topSellingQuantities = {},
  sortByTopSelling = false,
  topSellingLoading = false,
}: {
  showOnlyNew?: boolean;
  itemsPerPageDefault?: number;
  hideFilters?: boolean;
  showLoadMoreButton?: boolean;
  loadMoreLink?: string;
  hideSortBy?: boolean;
  showPriceFilter?: boolean;
  topSellingIds?: string[];
  /** productId -> total units sold, used to show "N sold" on best sellers */
  topSellingQuantities?: Record<string, number>;
  sortByTopSelling?: boolean;
  topSellingLoading?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = (searchParams?.get("q") || "").trim();
  const urlCategory = (searchParams?.get("category") || "all").trim();
  const urlBranch = searchParams?.get("branch") || "";
  const urlCurrency = (searchParams?.get("currency") || "THB") as "THB" | "MMK";
  const urlPage = Math.max(1, parseInt(searchParams?.get("page") || "1", 10) || 1);
  const [localQuery, setLocalQuery] = useState(urlQuery);

  // sync localQuery with URL param changes
  useEffect(() => {
    setLocalQuery(urlQuery);
  }, [urlQuery]);

  // listen for global search events dispatched from NavBar when using replaceState
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const q = (e?.detail || "").toString();
      setLocalQuery(q || "");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("app:search", handler as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("app:search", handler as EventListener);
      }
    };
  }, []);

  // Use TanStack Query hooks for cached data fetching
  const {
    data: products,
    isLoading: loading,
    error: queryError,
  } = useProducts();
  const { rate: mmkRate } = useCurrencyRate();
  const { data: onlinePromotions = [] } = useOnlinePromotions();
  const { data: shopsData = [] } = useShops();

  const [error, setError] = useState<string | null>(null);

  // Set error from query if it exists
  useEffect(() => {
    if (queryError) {
      setError(
        queryError instanceof Error ? queryError.message : String(queryError),
      );
    }
  }, [queryError]);
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>(
    {},
  );
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>(
    {},
  );
  const [currentPage, setCurrentPageState] = useState<number>(urlPage);
  const [itemsPerPage] = useState<number>(itemsPerPageDefault);

  // keep currentPage in sync with the URL (e.g. browser back/forward)
  useEffect(() => {
    setCurrentPageState(urlPage);
  }, [urlPage]);

  // update both local state and the URL so the page survives navigation
  // (e.g. visiting a product detail page and using the browser back button)
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const setCurrentPage = React.useCallback(
    (value: number | ((prev: number) => number)) => {
      const next =
        typeof value === "function" ? value(currentPageRef.current) : value;

      setCurrentPageState(next);

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (next > 1) {
          params.set("page", String(next));
        } else {
          params.delete("page");
        }
        const queryString = params.toString();
        router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, {
          scroll: false,
        });
      }
    },
    [router, pathname],
  );
  const [showFilter, setShowFilter] = useState(false);
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMinPrice, setFilterMinPrice] = useState<string>("");
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("");
  const [filterCurrency, setFilterCurrency] = useState<"THB" | "MMK">("THB");
  const [filterSize, setFilterSize] = useState<string>("");
  const [expandedBranch, setExpandedBranch] = useState<boolean>(true);
  const [expandedCategory, setExpandedCategory] = useState<boolean>(false);
  const [expandedSize, setExpandedSize] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<
    "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc"
  >("newest");
  const { t } = useLanguage();

  // Use currency hook for global currency state
  const displayCurrency = useCurrency();

  // Sync filterCategory with URL parameter
  useEffect(() => {
    if (urlCategory && urlCategory !== filterCategory) {
      setFilterCategory(urlCategory);
    }
  }, [urlCategory]);

  // Switching category shrinks the result set, so the current page position is
  // no longer meaningful. The nav menu already drops `page` when it applies a
  // category, but this covers any other route to a category change (a shared
  // link that kept `?page=`, for example). Only the *initial* URL is honoured
  // as-is, so deep links such as ?category=Top&page=2 still work.
  const prevUrlCategoryRef = useRef(urlCategory);
  useEffect(() => {
    if (prevUrlCategoryRef.current === urlCategory) return;
    prevUrlCategoryRef.current = urlCategory;
    if (currentPage > 1) {
      setCurrentPage(1);
    }
  }, [urlCategory, currentPage, setCurrentPage]);

  // Sync filterCurrency with URL parameter
  useEffect(() => {
    if (urlCurrency && urlCurrency !== filterCurrency) {
      setFilterCurrency(urlCurrency);
    }
  }, [urlCurrency]);

  // Sync filterBranch with URL parameter, or use first available branch as default
  useEffect(() => {
    if (urlBranch && urlBranch !== filterBranch) {
      setFilterBranch(urlBranch);
    } else if (!urlBranch && !filterBranch && shopsData.length > 0) {
      // No branch in URL and no filterBranch set, default to first branch
      const defaultBranch = shopsData[0]?.id;
      if (defaultBranch) {
        setFilterBranch(defaultBranch);
      }
    }
  }, [urlBranch, shopsData, filterBranch]);

  // derive filter option lists from products
  const branches = shopsData;
  // derive available options scoped to the selected branch
  const branchFilteredProducts = (() => {
    if (!products) return [] as Product[];
    if (!filterBranch) return products;
    const selectedShop = shopsData.find((s) => s.id === filterBranch);
    const shopName = selectedShop?.name;
    return products.filter((p) => {
      const pShop = ((p as Product).shop || "").toString();
      return pShop === filterBranch || pShop === shopName;
    });
  })();

  const categories = branchFilteredProducts
    ? Array.from(
        new Set(
          branchFilteredProducts
            .map(
              (p) =>
                (p as Product).description || (p as Product).category || "",
            )
            .filter(Boolean),
        ),
      )
    : [];
  // derive unique colors with optional color codes
  const sizes = branchFilteredProducts
    ? Array.from(
        new Set(
          branchFilteredProducts
            .flatMap((p) => (p as Product).colorVariants || [])
            .flatMap((v: ColorVariant) =>
              (v.sizeQuantities || []).map((s: SizeQuantity) => s.size),
            )
            .filter(Boolean),
        ),
      )
    : [];

  // when branch changes, ensure selected category/color/size remain valid
  useEffect(() => {
    if (!branchFilteredProducts) return;
    if (filterCategory !== "all" && !categories.includes(filterCategory)) {
      setFilterCategory("all");
    }
    if (filterSize && !sizes.map(String).includes(String(filterSize))) {
      setFilterSize("");
    }
  }, [filterBranch, shopsData, products]);

  // apply filters
  const filteredProducts = products
    ? products.filter((p) => {
        if (filterBranch) {
          const selectedShop = shopsData.find((s) => s.id === filterBranch);
          const shopName = selectedShop?.name;
          const pShop = ((p as Product).shop || "").toString();
          // match by id or by name
          if (pShop !== filterBranch && pShop !== shopName) return false;
        }
        if (
          filterCategory !== "all" &&
          ((p as Product).description || (p as Product).category || "") !==
            filterCategory
        )
          return false;
        // color filter removed
        if (filterSize) {
          const hasSize = ((p as Product).colorVariants || []).some(
            (v: ColorVariant) =>
              (v.sizeQuantities || []).some(
                (sq: SizeQuantity) =>
                  String(sq.size) === filterSize && Number(sq.quantity) > 0,
              ),
          );
          if (!hasSize) return false;
        }
        if (showOnlyNew && !(p as Product).isNew) return false;
        // Best sellers is the only listing that hides sold-out products
        // entirely. Every other listing keeps them visible but pushes them to
        // the end of the grid (see the sorting step below).
        if (sortByTopSelling && Number((p as Product).stock || 0) <= 0) {
          return false;
        }
        if (filterMinPrice || filterMaxPrice) {
          const price = Number(p.price || 0);
          const priceCompare =
            filterCurrency === "THB" ? price : Math.round(price * mmkRate);
          if (filterMinPrice && priceCompare < Number(filterMinPrice))
            return false;
          if (filterMaxPrice && priceCompare > Number(filterMaxPrice))
            return false;
        }

        // URL search query filtering (case-insensitive) — match name or description
        const effectiveQuery = (localQuery || urlQuery || "").trim();
        if (effectiveQuery) {
          const q = effectiveQuery.toLowerCase();
          const name = String(p.name || "").toLowerCase();
          const desc = String(p.description || "").toLowerCase();
          if (!name.includes(q) && !desc.includes(q)) return false;
        }
        return true;
      })
    : [];

  // Apply sorting, then push out-of-stock items to the end of the list
  const sortedProducts = filteredProducts
    ? (() => {
        // When showing best sellers, restrict the list to only products that
        // actually appear in the top-selling data (matches the "Top Selling
        // Products" behavior in the owner dashboard) instead of showing the
        // full catalog sorted with top sellers merely bubbled to the top.
        //
        // This restriction is unconditional: if the ranking is empty (still
        // loading, or genuinely no sales yet) we must show nothing rather than
        // silently falling back to the entire catalogue.
        const list = sortByTopSelling
          ? filteredProducts.filter((p) => topSellingIds.includes(p.id))
          : filteredProducts.slice();

        // If sortByTopSelling is enabled and we have top-selling IDs, sort by that first
        if (sortByTopSelling && topSellingIds.length > 0) {
          list.sort((a: Product, b: Product) => {
            const aIndex = topSellingIds.indexOf(a.id);
            const bIndex = topSellingIds.indexOf(b.id);
            
            // Both products are in top-selling list - sort by their rank
            if (aIndex !== -1 && bIndex !== -1) {
              return aIndex - bIndex;
            }
            
            // Only a is in top-selling - a comes first
            if (aIndex !== -1) return -1;
            
            // Only b is in top-selling - b comes first
            if (bIndex !== -1) return 1;
            
            // Neither is in top-selling - maintain existing sort
            return 0;
          });
        } else {
          // Regular sorting when not using top-selling
          list.sort((a: Product, b: Product) => {
            try {
              if (sortBy === "newest") {
                const aVal = Number(
                  (a.createdAt &&
                  typeof a.createdAt === "object" &&
                  a.createdAt !== null &&
                  "toMillis" in a.createdAt &&
                  typeof (a.createdAt as { toMillis?: () => number }).toMillis ===
                    "function"
                    ? (a.createdAt as { toMillis: () => number }).toMillis()
                    : a.createdAt) ?? 0,
                );
                const bVal = Number(
                  (b.createdAt &&
                  typeof b.createdAt === "object" &&
                  b.createdAt !== null &&
                  "toMillis" in b.createdAt &&
                  typeof (b.createdAt as { toMillis?: () => number }).toMillis ===
                    "function"
                    ? (b.createdAt as { toMillis: () => number }).toMillis()
                    : b.createdAt) ?? 0,
                );
                return bVal - aVal; // newest first
              }

              if (sortBy === "price-asc") {
                const aP = Number(a.price ?? 0);
                const bP = Number(b.price ?? 0);
                return aP - bP;
              }

              if (sortBy === "price-desc") {
                const aP = Number(a.price ?? 0);
                const bP = Number(b.price ?? 0);
                return bP - aP;
              }

              if (sortBy === "name-asc") {
                return String(a.name || "").localeCompare(String(b.name || ""));
              }

              if (sortBy === "name-desc") {
                return String(b.name || "").localeCompare(String(a.name || ""));
              }
            } catch (e) {
              return 0;
            }
            return 0;
          });
        }

        // Move sold-out products to the end while preserving the sort order
        // within each group. On best sellers this is a no-op because sold-out
        // products were already filtered out above.
        const inStock: Product[] = [];
        const outOfStock: Product[] = [];
        for (const p of list) {
          if (Number((p as Product).stock || 0) > 0) inStock.push(p);
          else outOfStock.push(p);
        }

        return [...inStock, ...outOfStock];
      })()
    : [];

  // Pagination calculations (hooks must be declared before any early returns)
  const totalPages = Math.max(
    1,
    Math.ceil(sortedProducts.length / itemsPerPage),
  );
  // Pagination resets to page 1 when the user actually changes a filter.
  // This is handled directly in the filter event handlers (see
  // handleFilterCategoryChange, handleFilterSizeChange, etc. and the
  // price/currency apply button) rather than via a useEffect watching
  // filter state. That's because the filter state itself is also
  // populated asynchronously on mount (synced from the URL / default
  // branch once shop data loads) — a useEffect watching those values
  // can't distinguish "user changed a filter" from "async initial sync",
  // and resetting on the latter wipes out a page restored from the URL
  // (e.g. via the browser back button from a product page).

  // clamp currentPage if it's beyond the available pages (e.g. the result
  // set shrank after a filter change). Skip while products are still
  // loading — before data arrives `totalPages` is artificially `1`, which
  // would otherwise wipe out a page number restored from the URL (e.g.
  // after using the browser back button from a product detail page).
  useEffect(() => {
    if (loading) return;
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, setCurrentPage]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const visibleProducts = sortedProducts.slice(startIndex, endIndex);

  const paginationItems: Array<number | "ellipsis"> = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const items: Array<number | "ellipsis"> = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) items.push("ellipsis");
    for (let page = start; page <= end; page++) items.push(page);
    if (end < totalPages - 1) items.push("ellipsis");

    items.push(totalPages);
    return items;
  })();

  // Best sellers also has to wait for the sales ranking, otherwise the grid
  // would briefly render as "empty" before the ranking arrives.
  if (loading || (sortByTopSelling && topSellingLoading))
    return (
      <div className="bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="flex items-center justify-center">
              <div className="h-12 w-12 border-4 border-gray-200 border-t-rose-500 rounded-full animate-spin" />
            </div>
            <div className="mt-4 h-6 bg-gray-100 rounded w-48 mx-auto animate-pulse" />
            <div className="mt-3 h-3 bg-gray-100 rounded w-64 mx-auto animate-pulse" />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({
              length: Math.min(12, Math.max(6, itemsPerPage)),
            }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white">
                <div className="w-full aspect-[5/8] bg-gray-100 rounded-md" />
                <div className="px-2 py-3">
                  <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!products || products.length === 0)
    return <div className="p-8">No products found.</div>;

  const effectiveQuery = (localQuery || urlQuery || "").trim();
  if (effectiveQuery && filteredProducts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <div className="text-lg md:text-xl font-medium text-gray-700">
          {t("no_items_found_for").replace("{q}", effectiveQuery)}
        </div>
        <div className="mt-3 text-sm text-gray-500">
          {t("try_different_search")}
        </div>
      </div>
    );
  }
  if (!effectiveQuery && filteredProducts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <div className="text-lg md:text-xl font-medium text-gray-700">
          {t("no_items_match_filters")}
        </div>
        <div className="mt-3 text-sm text-gray-500">
          {t("try_clearing_filters")}
        </div>
      </div>
    );
  }
  // Best sellers: the catalogue has products, but none of them have sales yet
  // (or none of the ranked products are available at this branch / in stock).
  if (sortByTopSelling && sortedProducts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <div className="text-lg md:text-xl font-medium text-gray-700">
          No best sellers yet
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Products will appear here once they start selling at this branch.
        </div>
      </div>
    );
  }

  const handleColorSelect = (productId: string, colorId: string) => {
    setSelectedColors((prev) => {
      const current = prev[productId];
      const next = current === colorId ? "" : colorId;
      return { ...prev, [productId]: next };
    });
    setSelectedSizes((prev) => ({ ...prev, [productId]: "" }));
  };

  const handleSizeSelect = (productId: string, size: string) => {
    setSelectedSizes((prev) => ({ ...prev, [productId]: size }));
  };

  /**
   * Image props for a card, honouring the colour the shopper picked.
   *
   * Returns a candidate list rather than a single URL so a dead image URL
   * fails over to the next option instead of rendering broken.
   */
  const getImageProps = (p: Product) => {
    const variantImg = p.colorVariants?.find(
      (v: ColorVariant, i: number) =>
        (v.id ?? `${p.id}-v-${i}`) === selectedColors[p.id],
    )?.image;
    return productImageProps(p, variantImg);
  };

  // removed old getColorCode helper — colors now include codes

  // Conversion rate THB -> MMK (Ks). `mmkRate` state is populated from owner
  // settings API and falls back to `NEXT_PUBLIC_MMK_RATE`.

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between px-2 py-2 md:px-6 md:py-4">
        <div className="flex flex-col md:flex-row md:items-center">
          <div className="text-sm text-gray-600">
            {/* Count the list that is actually rendered. On best sellers
                `sortedProducts` is narrowed to the ranked products, so using
                `filteredProducts` here would report the whole branch
                catalogue instead of what's on screen. */}
            {`${sortedProducts.length} ${t("items")}`}
          </div>

          {!hideFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-2 ml-3 md:mt-0">
              {filterCategory !== "all" && (
                <span className="inline-flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm px-3 py-1 rounded">
                  <span>{filterCategory}</span>
                  <button
                    onClick={() => {
                      setFilterCategory("all");
                      setCurrentPage(1);
                    }}
                    aria-label="Remove category filter"
                    className="text-amber-700 hover:text-amber-900 ml-1"
                  >
                    ×
                  </button>
                </span>
              )}

              {/* color filter removed */}

              {filterSize && (
                <span className="inline-flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm px-3 py-1 rounded">
                  <span>{filterSize}</span>
                  <button
                    onClick={() => {
                      setFilterSize("");
                      setCurrentPage(1);
                    }}
                    aria-label="Remove size filter"
                    className="text-amber-700 hover:text-amber-900 ml-1"
                  >
                    ×
                  </button>
                </span>
              )}

              {(filterMinPrice || filterMaxPrice) && (
                <span className="inline-flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm px-3 py-1 rounded">
                  <span>
                    {filterCurrency === "THB" ? "฿" : "Ks"}{" "}
                    {filterMinPrice || "-"} - {filterMaxPrice || "-"}
                  </span>
                  <button
                    onClick={() => {
                      setFilterMinPrice("");
                      setFilterMaxPrice("");
                      setCurrentPage(1);
                    }}
                    aria-label="Remove price filter"
                    className="text-amber-700 hover:text-amber-900 ml-1"
                  >
                    ×
                  </button>
                </span>
              )}

              {(filterCategory !== "all" ||
                filterSize ||
                filterMinPrice ||
                filterMaxPrice) && (
                <button
                  onClick={() => {
                    setFilterCategory("all");
                    setFilterSize("");
                    setFilterMinPrice("");
                    setFilterMaxPrice("");
                    setFilterCurrency("THB");
                    setCurrentPage(1);
                  }}
                  className="text-md text-red-600 underline md:ml-2 ml-0"
                >
                  {t("clear_all")}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2 mt-3 md:mt-0">
          <div>
            {!hideFilters && (
              <button
                onClick={() => setShowFilter((s) => !s)}
                aria-expanded={showFilter}
                aria-controls="filters-panel"
                className="px-3 py-1 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50 inline-flex items-center space-x-2"
              >
                <span>{t("filters")}</span>
                <svg
                  className={`h-4 w-4 transform transition-transform duration-200 ${showFilter ? "rotate-180" : "rotate-0"}`}
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M5 8.5L10 13.5L15 8.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Sort control */}
          {!hideSortBy && (
            <div className="text-sm">
              <label className="sr-only">Sort by</label>
              <div className="relative inline-flex items-center">
                <select
                  title="sortBy"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | "newest"
                        | "price-asc"
                        | "price-desc"
                        | "name-asc"
                        | "name-desc",
                    )
                  }
                  className="peer border border-gray-200 rounded px-2 py-1 text-sm bg-white appearance-none pr-8"
                >
                  <option value="newest">{t("sort_newest")}</option>
                  <option value="price-asc">{t("sort_price_asc")}</option>
                  <option value="price-desc">{t("sort_price_desc")}</option>
                  <option value="name-asc">{t("sort_name_asc")}</option>
                  <option value="name-desc">{t("sort_name_desc")}</option>
                </select>
                <svg
                  className="h-4 w-4 absolute right-2 transform transition-transform duration-200 peer-focus:rotate-180 pointer-events-none text-gray-600"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <path
                    d="M5 8.5L10 13.5L15 8.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}

          {/* Price Range Dropdown - shown when showPriceFilter is true */}
          {showPriceFilter && (
            <div className="relative text-sm">
              <button
                onClick={() => setShowPriceDropdown(!showPriceDropdown)}
                className="px-3 py-1 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50 inline-flex items-center space-x-2"
              >
                <span>Price Range</span>
                <svg
                  className={`h-4 w-4 transform transition-transform duration-200 ${showPriceDropdown ? "rotate-180" : "rotate-0"}`}
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5 8.5L10 13.5L15 8.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Price Dropdown Panel */}
              {showPriceDropdown && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50">
                  {/* Currency Selection */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Currency
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setFilterCurrency("THB");
                          setCurrentPage(1);
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          filterCurrency === "THB"
                            ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-sm"
                            : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        ฿ THB
                      </button>
                      <button
                        onClick={() => {
                          setFilterCurrency("MMK");
                          setCurrentPage(1);
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          filterCurrency === "MMK"
                            ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-sm"
                            : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Ks MMK
                      </button>
                    </div>
                  </div>

                  {/* Price Range Inputs */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Price Range
                    </label>
                    <div className="flex items-center rounded-lg border border-gray-300 bg-white overflow-hidden focus-within:outline-none focus-within:ring-2 focus-within:ring-rose-400">
                      <input
                        type="number"
                        value={filterMinPrice}
                        onChange={(e) => setFilterMinPrice(e.target.value)}
                        placeholder="Min"
                        className="w-1/2 min-w-0 px-3 py-1.5 text-sm focus:outline-none"
                      />
                      <span className="h-4 w-px bg-gray-200" />
                      <input
                        type="number"
                        value={filterMaxPrice}
                        onChange={(e) => setFilterMaxPrice(e.target.value)}
                        placeholder="Max"
                        className="w-1/2 min-w-0 px-3 py-1.5 text-sm focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setFilterMinPrice("");
                        setFilterMaxPrice("");
                        setCurrentPage(1);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPage(1);
                        setShowPriceDropdown(false);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 rounded-lg hover:shadow-md transition-all"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-2 py-4 sm:grid-cols-2 md:gap-4 md:px-4 md:py-6 md:grid-cols-3 lg:gap-5 lg:px-6 lg:grid-cols-4 xl:gap-6 xl:px-6 xl:grid-cols-5 2xl:grid-cols-6 bg-white">
        {visibleProducts.map((p) => {
          const hasVariants =
            Array.isArray(p.colorVariants) && p.colorVariants.length > 0;
          const displayStock = p.stock ?? (p.price ? 10 : 0);
          const isOutOfStock = displayStock === 0;
          const soldCount = Number(topSellingQuantities[p.id] || 0);

          const variant = hasVariants
            ? p.colorVariants!.find(
                (v: ColorVariant, i: number) =>
                  (v.id ?? `${p.id}-v-${i}`) === selectedColors[p.id],
              ) || p.colorVariants![0]
            : null;

          // If a color is selected, show sizes for that variant only.
          // If no color selected, aggregate sizes across all variants and
          // show sizes whose total quantity > 0.
          let availableSizes: SizeQuantity[] = [];
          if (hasVariants) {
            if (selectedColors[p.id]) {
              availableSizes = (variant?.sizeQuantities || []).filter(
                (sq: SizeQuantity) => Number(sq.quantity) > 0,
              );
            } else {
              const sizeMap: Record<string, number> = {};
              const order: string[] = [];
              p.colorVariants!.forEach((v: ColorVariant) => {
                (v.sizeQuantities || []).forEach((sq: SizeQuantity) => {
                  const key = String(sq.size);
                  if (!order.includes(key)) order.push(key);
                  sizeMap[key] = (sizeMap[key] || 0) + Number(sq.quantity || 0);
                });
              });
              availableSizes = order
                .map((s) => ({ size: s, quantity: sizeMap[s] || 0 }))
                .filter((x) => Number(x.quantity) > 0);
            }
          } else {
            availableSizes = [];
          }

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
                      {...getImageProps(p)}
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
                  {/* Product Name */}
                  <h4 className="font-semibold text-gray-900 text-sm leading-tight truncate mb-1.5">
                    {p.name && p.name.length > 20
                      ? `${p.name.substring(0, 20)}...`
                      : p.name}
                  </h4>

                  {/* Price */}
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
                        const finalPriceTHB = promo.finalSubtotalTHB;

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
                                finalPriceTHB,
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

                  {/* Units sold — best sellers only, where the ranking is by
                      sales volume so the sold count is the meaningful number */}
                  {sortByTopSelling && soldCount > 0 && (
                    <div className="text-[10px] text-rose-600 font-semibold mb-1.5">
                      {soldCount} sold
                    </div>
                  )}

                  {/* Stock Indicator */}
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
      {/* Slide-in filter panel (hidden when `hideFilters`) */}
      {!hideFilters && (
        <>
          <div
            className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
              showFilter
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setShowFilter(false)}
            aria-hidden
          />

          <div
            className={`fixed inset-y-0 left-0 z-50 w-70 bg-white shadow-lg transform transition-transform duration-300 ${
              showFilter ? "translate-x-0" : "-translate-x-full"
            }`}
            aria-hidden={!showFilter}
          >
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-3xl font-medium font-pacifico">
                  {t("filters")}
                </h3>
                <button
                  onClick={() => setShowFilter(false)}
                  aria-label="Close filters"
                  className="text-gray-500 hover:text-gray-700 p-1 rounded"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 6l12 12" />
                    <path d="M6 18L18 6" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 overflow-auto pr-4 pt-6 pb-6">
                <div className="pb-3">
                  <button
                    type="button"
                    onClick={() => setExpandedBranch((s) => !s)}
                    aria-expanded={expandedBranch}
                    className="w-full flex items-center justify-between text-sm font-medium text-gray-800"
                  >
                    <span>{t("branch")}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className={`transform transition-transform h-6 w-6 ${expandedBranch ? "rotate-180" : "rotate-0"}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  <div
                    className={`mt-2 space-y-2 ${expandedBranch ? "block" : "hidden"}`}
                  >
                    <button
                      onClick={() => setFilterBranch("all")}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${filterBranch === "all" ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
                    >
                      {t("all_branches")}
                    </button>

                    {branches.map((sh: { id: string; name: string }) => (
                      <button
                        key={sh.id}
                        onClick={() => setFilterBranch(sh.id)}
                        className={`w-full text-left px-3 py-2 rounded text-sm ${filterBranch === sh.id ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
                      >
                        {sh.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-dashed border-gray-300 my-2" />

                <div className="pt-3 pb-3">
                  <button
                    type="button"
                    onClick={() => setExpandedCategory((s) => !s)}
                    aria-expanded={expandedCategory}
                    className="w-full flex items-center justify-between text-sm font-medium text-gray-800"
                  >
                    <span>{t("category")}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className={`transform transition-transform h-6 w-6 ${expandedCategory ? "rotate-180" : "rotate-0"}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  <div
                    className={`mt-2 space-y-2 ${expandedCategory ? "block" : "hidden"}`}
                  >
                    <button
                      onClick={() => setFilterCategory("all")}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${filterCategory === "all" ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
                    >
                      {t("all_categories")}
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        onClick={() => setFilterCategory(c)}
                        className={`w-full text-left px-3 py-2 rounded text-sm ${filterCategory === c ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-dashed border-gray-300 my-2" />

                {/* color filter removed */}

                <div className="pt-3 pb-3">
                  <button
                    type="button"
                    onClick={() => setExpandedSize((s) => !s)}
                    aria-expanded={expandedSize}
                    className="w-full flex items-center justify-between text-sm font-medium text-gray-800"
                  >
                    <span>{t("size")}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className={`transform transition-transform h-6 w-6 ${expandedSize ? "rotate-180" : "rotate-0"}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  <div className={`mt-2 ${expandedSize ? "block" : "hidden"}`}>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => setFilterSize("")}
                        className={`col-span-4 text-left px-3 py-2 rounded text-sm ${
                          filterSize === ""
                            ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
                            : "bg-white text-gray-700 border border-gray-200"
                        }`}
                      >
                        {t("any_size")}
                      </button>

                      {sizes.map((s) => (
                        <button
                          key={String(s)}
                          onClick={() => setFilterSize(String(s))}
                          className={`text-center px-2 py-2 rounded text-sm ${
                            filterSize === String(s)
                              ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
                              : "bg-white text-gray-700 border border-gray-200"
                          }`}
                        >
                          {String(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-dashed border-gray-300 my-2" />

                <div className="pt-3 pb-3">
                  <label className="bw-full flex items-center justify-between text-sm font-medium text-gray-800">
                    {t("price")} ({filterCurrency === "THB" ? "฿" : "Ks"})
                  </label>
                  <div className="mt-2 flex items-center space-x-2 text-sm">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="currency"
                        checked={filterCurrency === "THB"}
                        onChange={() => setFilterCurrency("THB")}
                        className="mr-1"
                      />
                      ฿
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="currency"
                        checked={filterCurrency === "MMK"}
                        onChange={() => setFilterCurrency("MMK")}
                        className="mr-1"
                      />
                      Ks
                    </label>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <input
                      type="number"
                      value={filterMinPrice}
                      onChange={(e) => setFilterMinPrice(e.target.value)}
                      placeholder={t("min")}
                      className="w-1/2 border border-gray-200 rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      value={filterMaxPrice}
                      onChange={(e) => setFilterMaxPrice(e.target.value)}
                      placeholder={t("max")}
                      className="w-1/2 border border-gray-200 rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setFilterBranch("all");
                      setFilterCategory("all");
                      setFilterSize("");
                      setFilterMinPrice("");
                      setFilterMaxPrice("");
                      setFilterCurrency("THB");
                    }}
                    className="px-3 py-2 rounded-full border border-gray-300 bg-white text-sm"
                  >
                    {t("reset")}
                  </button>
                  <button
                    onClick={() => {
                      // apply current filters (they're live) then close panel and reset pagination
                      setShowFilter(false);
                      setCurrentPage(1);
                    }}
                    aria-label="Apply filters"
                    className="ml-auto px-3 py-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white text-sm"
                  >
                    {t("apply")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pagination controls or Load More button */}
      {showLoadMoreButton ? (
        <div className="mt-4 mb-4 flex justify-center">
          <Link
            href={loadMoreLink}
            className="px-6 py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-medium text-sm rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
          >
            Load More
          </Link>
        </div>
      ) : (
        <div className="mt-4 mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 w-7 rounded-md flex items-center justify-center text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Previous page"
            >
              ‹
            </button>

            <div className="hidden sm:flex items-center gap-0.5">
              {paginationItems.map((item, idx) => {
                if (item === "ellipsis") {
                  return (
                    <span
                      key={`ellipsis-${idx}`}
                      className="inline-flex h-7 w-7 items-center justify-center text-xs text-gray-400"
                    >
                      ···
                    </span>
                  );
                }

                const page = item;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-7 min-w-[1.75rem] px-2 rounded-md text-xs font-medium transition ${
                      currentPage === page
                        ? "bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-sm"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <span className="sm:hidden px-2 text-xs text-gray-600 font-medium">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-7 w-7 rounded-md flex items-center justify-center text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </>
  );
}
