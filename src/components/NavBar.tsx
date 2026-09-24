"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useLanguage } from "../contexts/LanguageContext";
import { useCustomerAuth } from "../contexts/CustomerAuthContext";
import { useCart } from "../contexts/CartContext";
import { useShops } from "../hooks/useShops";
import { useCategories } from "../hooks/useCategories";
import { recordSearch } from "../lib/recommendations/signals";

function NavBarContent() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lang, setLang] = useState("EN");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<"THB" | "MMK">(
    "THB",
  );
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showNewArrivalsCategories, setShowNewArrivalsCategories] =
    useState(false);
  const [showBestSellersCategories, setShowBestSellersCategories] =
    useState(false);
  const [showViewAllCategories, setShowViewAllCategories] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { user, logout } = useCustomerAuth();
  const { itemCount } = useCart();
  const { data: shops = [] } = useShops();
  const { data: adminCategories = [] } = useCategories();
  const branchDropdownRef = useRef<HTMLDivElement | null>(null);
  const currencyDropdownRef = useRef<HTMLDivElement | null>(null);
  const languageDropdownRef = useRef<HTMLDivElement | null>(null);

  // Every branch the owner has created is selectable. The list is ordered so
  // "Main Branch" leads — `availableBranches[0]` is also the fallback branch
  // used when the URL carries no valid `branch` param.
  const availableBranches = React.useMemo(() => {
    const isMain = (name: string) => name.toLowerCase().includes("main");
    return [...shops].sort((a, b) => {
      const aMain = isMain(a.name);
      const bMain = isMain(b.name);
      if (aMain !== bMain) return aMain ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [shops]);

  // Check membership status when user changes
  useEffect(() => {
    const checkMembershipStatus = async () => {
      if (!user) {
        setIsMember(false);
        return;
      }

      setMembershipLoading(true);
      try {
        const response = await fetch(`/api/loyalty/summary?customerId=${user.uid}`);
        const data = await response.json();
        if (data.success && data.data) {
          setIsMember(data.data.isMember || false);
        } else {
          setIsMember(false);
        }
      } catch (error) {
        console.error("Error checking membership:", error);
        setIsMember(false);
      } finally {
        setMembershipLoading(false);
      }
    };

    checkMembershipStatus();

    // Listen for membership updates
    const handleMembershipUpdate = () => {
      checkMembershipStatus();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("app:membership-updated", handleMembershipUpdate);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("app:membership-updated", handleMembershipUpdate);
      }
    };
  }, [user]);

  // Sync currency from localStorage on mount and listen for changes
  useEffect(() => {
    // Only sync from localStorage if URL already has currency set
    const urlCurrency = searchParams?.get("currency");
    if (urlCurrency) {
      try {
        const savedCurrency = localStorage.getItem("currency") as
          "THB" | "MMK" | null;
        if (savedCurrency === "THB" || savedCurrency === "MMK") {
          setSelectedCurrency(savedCurrency);
        }
      } catch (e) {
        // ignore
      }
    }

    // Listen for currency changes from other components
    const handleCurrencyChange = (e: CustomEvent) => {
      const newCurrency = e.detail as "THB" | "MMK";
      if (newCurrency === "THB" || newCurrency === "MMK") {
        setSelectedCurrency(newCurrency);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "app:currency",
        handleCurrencyChange as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "app:currency",
          handleCurrencyChange as EventListener,
        );
      }
    };
  }, [searchParams]);

  // The category menu mirrors the list the owner manages in the POS app
  // (settings/categories). It is deliberately NOT derived from product data:
  // doing that would keep showing categories the owner deleted and would hide
  // a newly added category until some product happened to use it.
  const categories = adminCategories;

  const isActive = (p: string) => {
    if (!pathname) return false;
    return pathname === p;
  };

  const supportsInlineSearch = (p?: string | null) => {
    if (!p) return false;
    return (
      p === "/" ||
      p.startsWith("/view-all") ||
      p.startsWith("/new-arrivals") ||
      p.startsWith("/best-sellers") ||
      p.startsWith("/product/")
    );
  };

  const navLinkClass = (p: string, extra = "") =>
    `text-gray-800  ${isActive(p) ? "text-[#111827] font-semibold underline decoration-rose-300 underline-offset-4 decoration-2" : ""} ${extra}`.trim();

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Current page URL with the search term applied.
   *
   * Built from the existing params rather than from scratch: writing
   * `${pathname}?q=...` dropped `branch` and `currency`, which knocked the
   * shopper back to the default branch whenever the query changed.
   *
   * Changing or clearing the term changes the result set, so the page position
   * is discarded too.
   */
  const buildSearchUrl = (term: string) => {
    const base = pathname || "/";
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (term) params.set("q", term);
    else params.delete("q");
    params.delete("page");
    const queryString = params.toString();
    return queryString ? `${base}?${queryString}` : base;
  };

  /** Tell any listening product grid what the active query is. */
  const broadcastSearch = (term: string) => {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent("app:search", { detail: term }));
    } catch {
      // ignore
    }
  };

  // Update URL query without closing UI (used for live typing)
  const updateUrlQuery = (term: string) => {
    try {
      if (supportsInlineSearch(pathname)) {
        // replace history state without triggering navigation
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", buildSearchUrl(term));
          broadcastSearch(term);
        }
      } else {
        // don't auto-redirect to home when live-typing with an empty query
        if (!term) return;
        router.push(`/search?q=${encodeURIComponent(term)}`);
      }
    } catch (e) {
      // ignore
    }
  };

  /**
   * Close the search UI and clear the search.
   *
   * Deliberately different from committing a search: submitting keeps the
   * results on screen, whereas closing is an abandon, so the term, the `q`
   * param and any listening grid all return to the unfiltered view.
   */
  const closeSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);

    if (!supportsInlineSearch(pathname)) return;

    // router.replace rather than history.replaceState: the grid resolves its
    // filter as `localQuery || urlQuery`, so clearing only the broadcast would
    // leave a stale `?q=` in the URL still driving the filter. A real
    // navigation clears both.
    try {
      router.replace(buildSearchUrl(""));
    } finally {
      broadcastSearch("");
    }
  };

  // Commit search (Enter or explicit click) — navigate and close UI
  const commitSearch = (q?: string) => {
    const term = (q ?? searchQuery).trim();

    // Only committed searches feed recommendations. The 350ms live-typing path
    // (updateUrlQuery) fires for every keystroke, which would fill the history
    // with prefixes of a single word.
    recordSearch(user?.uid, term);

    try {
      if (supportsInlineSearch(pathname)) {
        try {
          router.replace(buildSearchUrl(term));
        } finally {
          broadcastSearch(term);
        }
      } else {
        if (!term) router.push("/");
        else router.push(`/search?q=${encodeURIComponent(term)}`);
      }
    } finally {
      setSearchOpen(false);
      setMenuOpen(false);
    }
  };

  // live search debounce when typing — updates URL only, keeps search open
  React.useEffect(() => {
    const id = setTimeout(() => {
      const term = searchQuery.trim();
      updateUrlQuery(term);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the mobile drawer is open, freeze the page behind it so the drawer
  // scrolls on its own, and let Escape dismiss it.
  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Close the drawer once the viewport is wide enough to show the desktop nav,
  // otherwise it stays stuck open (and scroll-locked) after a rotate/resize.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Auto-expand categories when on respective pages
  useEffect(() => {
    if (pathname === "/view-all") {
      setShowViewAllCategories(true);
    } else if (pathname === "/new-arrivals") {
      setShowNewArrivalsCategories(true);
    } else if (pathname === "/best-sellers") {
      setShowBestSellersCategories(true);
    }
  }, [pathname]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved) setLang(saved);
      if (typeof document !== "undefined") {
        document.documentElement.lang = saved === "MM" ? "my" : "en";
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const setLanguage = (code: string) => {
    setLang(code);
    try {
      localStorage.setItem("lang", code);
      if (typeof document !== "undefined") {
        document.documentElement.lang = code === "MM" ? "my" : "en";
      }
      try {
        window.dispatchEvent(new CustomEvent("app:language", { detail: code }));
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }
  };

  // focus the desktop search input when it opens
  useEffect(() => {
    if (searchOpen) {
      // small timeout to ensure element is visible before focusing
      const id = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
    return;
  }, [searchOpen]);

  // Handle category filter.
  //
  // Categories are a *filter*, not a route: we only ever change the
  // `category` query parameter on a product listing page. `targetPath` lets
  // the side menu apply a category from anywhere (e.g. tapping "Jeans" under
  // New Arrivals while sitting on the cart page) instead of requiring the
  // shopper to navigate to that page first.
  const handleCategoryClick = (category: string, targetPath?: string) => {
    setSelectedCategory(category);
    const currentPath = targetPath || pathname || "/";
    const currentParams = new URLSearchParams(searchParams?.toString() || "");

    // Preserve branch parameter
    if (selectedBranch && availableBranches.length > 0) {
      currentParams.set("branch", selectedBranch);
    }

    // Preserve currency parameter
    if (selectedCurrency) {
      currentParams.set("currency", selectedCurrency);
    }

    // Set category parameter. Note: URLSearchParams encodes values on
    // serialisation, so the raw value is stored as-is — encoding it here too
    // would double-encode and make multi-word categories such as
    // "Short Skirt" arrive as "Short%20Skirt", matching no product.
    if (category === "all") {
      currentParams.delete("category");
    } else {
      currentParams.set("category", category);
    }

    // Changing the filter invalidates the current page position, so start the
    // result set from the beginning again.
    currentParams.delete("page");

    const queryString = currentParams.toString();
    const newUrl = queryString ? `${currentPath}?${queryString}` : currentPath;

    // Dispatch currency event to ensure it persists across navigation
    try {
      const savedCurrency = localStorage.getItem("currency") || "THB";
      window.dispatchEvent(
        new CustomEvent("app:currency", { detail: savedCurrency }),
      );
    } catch (e) {
      // ignore
    }

    router.push(newUrl);
  };

  // Sync selected category from URL
  useEffect(() => {
    const cat = searchParams?.get("category") || "all";
    setSelectedCategory(cat);
  }, [searchParams]);

  // Sync selected branch from URL, default to first branch (Main Branch)
  // Once user selects a branch, persist it across navigation
  useEffect(() => {
    if (availableBranches.length === 0) return;

    const urlBranch = searchParams?.get("branch");
    const savedBranch = typeof window !== 'undefined' ? localStorage.getItem("selectedBranch") : null;
    const defaultBranch = availableBranches[0].id; // First branch is Main Branch

    // Priority: URL branch > Saved branch > Default Main Branch
    let branchToUse = defaultBranch;

    if (urlBranch && availableBranches.some((b) => b.id === urlBranch)) {
      // Valid branch in URL
      branchToUse = urlBranch;
    } else if (savedBranch && availableBranches.some((b) => b.id === savedBranch)) {
      // Use saved branch from localStorage if valid
      branchToUse = savedBranch;
    }

    setSelectedBranch(branchToUse);

    // Save to localStorage (only in browser)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem("selectedBranch", branchToUse);
      } catch (e) {
        // ignore
      }
    }

    // Update URL if branch is not in URL or different from current
    if (!urlBranch || urlBranch !== branchToUse) {
      const currentParams = new URLSearchParams(searchParams?.toString() || "");
      currentParams.set("branch", branchToUse);
      
      // Ensure currency is also in URL
      if (!currentParams.has("currency")) {
        const savedCurrency = typeof window !== 'undefined' ? localStorage.getItem("currency") || "THB" : "THB";
        currentParams.set("currency", savedCurrency);
      }
      
      const newUrl = `${pathname}?${currentParams.toString()}`;
      router.replace(newUrl);
    }
  }, [searchParams, availableBranches, pathname, router]);

  // Sync selected currency from URL and localStorage
  // Once user selects a currency, persist it across navigation
  useEffect(() => {
    const urlCurrency = searchParams?.get("currency") as "THB" | "MMK" | null;
    const savedCurrency = typeof window !== 'undefined' ? (localStorage.getItem("currency") as "THB" | "MMK" | null) : null;
    
    // Priority: URL currency > Saved currency > Default THB
    let currencyToUse: "THB" | "MMK" = "THB";

    if (urlCurrency === "THB" || urlCurrency === "MMK") {
      currencyToUse = urlCurrency;
    } else if (savedCurrency === "THB" || savedCurrency === "MMK") {
      currencyToUse = savedCurrency;
    }

    setSelectedCurrency(currencyToUse);

    // Save to localStorage (only in browser)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem("currency", currencyToUse);
      } catch (e) {
        // ignore
      }
    }

    // Update URL if currency is not in URL or different from current
    if (!urlCurrency || urlCurrency !== currencyToUse) {
      const currentParams = new URLSearchParams(searchParams?.toString() || "");
      currentParams.set("currency", currencyToUse);
      const newUrl = `${pathname}?${currentParams.toString()}`;
      router.replace(newUrl);
    }
  }, [searchParams, pathname, router]);

  // Sync currency from localStorage on mount and listen for changes
  useEffect(() => {
    // Only sync from localStorage if URL already has currency set
    const urlCurrency = searchParams?.get("currency");
    if (urlCurrency) {
      try {
        const savedCurrency = localStorage.getItem("currency") as
          "THB" | "MMK" | null;
        if (savedCurrency === "THB" || savedCurrency === "MMK") {
          setSelectedCurrency(savedCurrency);
        }
      } catch (e) {
        // ignore
      }
    }

    // Listen for currency changes from other components
    const handleCurrencyChange = (e: CustomEvent) => {
      const newCurrency = e.detail as "THB" | "MMK";
      if (newCurrency === "THB" || newCurrency === "MMK") {
        setSelectedCurrency(newCurrency);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "app:currency",
        handleCurrencyChange as EventListener,
      );
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "app:currency",
          handleCurrencyChange as EventListener,
        );
      }
    };
  }, [searchParams]);

  // Close branch dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        branchDropdownRef.current &&
        !branchDropdownRef.current.contains(event.target as Node)
      ) {
        setShowBranchDropdown(false);
      }
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCurrencyDropdown(false);
      }
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setShowLanguageDropdown(false);
      }
      // Search is deliberately NOT closed on an outside click: a shopper
      // clicking into the results while typing would lose the field. It closes
      // via its own X button, Escape, or on submitting a search.
    };

    if (showBranchDropdown || showCurrencyDropdown || showLanguageDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showBranchDropdown, showCurrencyDropdown, showLanguageDropdown]);

  // Handle branch filter
  const handleBranchClick = (branchId: string) => {
    setSelectedBranch(branchId);
    
    // Save to localStorage for persistence
    try {
      localStorage.setItem("selectedBranch", branchId);
    } catch (e) {
      // ignore
    }

    const currentPath = pathname || "/";
    const currentParams = new URLSearchParams(searchParams?.toString() || "");

    currentParams.set("branch", branchId);

    // Preserve currency parameter
    if (selectedCurrency) {
      currentParams.set("currency", selectedCurrency);
    }

    const newUrl = `${currentPath}?${currentParams.toString()}`;

    router.push(newUrl);
    setShowBranchDropdown(false);
  };

  // Handle currency selection
  const handleCurrencyClick = (currency: "THB" | "MMK") => {
    setSelectedCurrency(currency);
    try {
      localStorage.setItem("currency", currency);
      window.dispatchEvent(
        new CustomEvent("app:currency", { detail: currency }),
      );
    } catch (e) {
      // ignore
    }
    setShowCurrencyDropdown(false);

    // Update URL with selected currency
    if (pathname) {
      const currentParams = new URLSearchParams(searchParams?.toString() || "");
      currentParams.set("currency", currency);
      // Preserve branch parameter
      if (selectedBranch && availableBranches.length > 0) {
        currentParams.set("branch", selectedBranch);
      }
      const newUrl = `${pathname}?${currentParams.toString()}`;
      router.push(newUrl);
    }
  };

  // Helper function to build URL with branch and currency parameters
  // Always use current selected values or values from localStorage
  const buildUrlWithBranch = (path: string) => {
    const params = new URLSearchParams();
    
    // Use current selected branch or from localStorage (only in browser)
    const branchToUse = selectedBranch || (typeof window !== 'undefined' ? localStorage.getItem("selectedBranch") : null);
    if (branchToUse && availableBranches.length > 0) {
      params.set("branch", branchToUse);
    }
    
    // Use current selected currency or from localStorage (only in browser)
    const currencyToUse = selectedCurrency || (typeof window !== 'undefined' ? (localStorage.getItem("currency") as "THB" | "MMK") : null) || "THB";
    params.set("currency", currencyToUse);
    
    return params.toString() ? `${path}?${params.toString()}` : path;
  };

  return (
    <>
      <nav
        className={`sticky top-0 z-50 bg-white border-b border-pink-200/70 transition-shadow ${
          scrolled ? "shadow-sm" : ""
        }`}
        aria-label="Main navigation"
      >
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-2 px-3 sm:px-4 md:px-8 py-3 md:py-3.5 relative">
          {/* Left: mobile hamburger + desktop search & nav links */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-6 flex-shrink-0">
            {/* Mobile hamburger */}
            <button
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((s) => !s)}
              className="inline-flex h-10 w-10 items-center justify-center -ml-1.5 rounded-full text-pink-600 hover:bg-pink-50 hover:text-pink-700 transition-colors md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden
              >
                <path strokeLinecap="round" d="M3.5 6h17M3.5 12h17M3.5 18h17" />
              </svg>
            </button>

            {/* Search icon with dropdown search box */}
            <div className="relative">
              <button
                aria-label="Toggle search"
                aria-expanded={searchOpen}
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-pink-600 hover:bg-pink-50 hover:text-pink-700 transition-colors md:h-auto md:w-auto md:rounded-none md:hover:bg-transparent"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                  />
                </svg>
              </button>

              {/* Desktop-only: on small screens the full-width bar under the
                  header handles search, so this dropdown must stay hidden or
                  both would appear at once. */}
              {searchOpen && (
                <div className="hidden md:block absolute top-full left-0 mt-3 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
                  <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitSearch();
                        }
                        if (e.key === "Escape") {
                          closeSearch();
                        }
                      }}
                      placeholder={t("search_placeholder")}
                      className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400"
                    />
                    <button
                      aria-label="Search"
                      onClick={() => commitSearch()}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                        />
                      </svg>
                    </button>
                    {/* Explicit close, since clicking outside no longer
                        dismisses the search box. */}
                    <button
                      aria-label="Close search"
                      onClick={closeSearch}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.9}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M18 6 6 18M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => {
                  if (pathname !== "/view-all") {
                    router.push(buildUrlWithBranch("/view-all"));
                  }
                  setShowViewAllCategories(true);
                  setMenuOpen(true);
                }}
                className={`text-xs font-semibold tracking-widest uppercase transition-colors ${
                  isActive("/view-all")
                    ? "text-pink-700 underline decoration-pink-300 underline-offset-4 decoration-2"
                    : "text-pink-600 hover:text-pink-700"
                }`}
              >
                Shop
              </button>
              <Link
                href={buildUrlWithBranch("/new-arrivals")}
                className={`text-xs font-semibold tracking-widest uppercase transition-colors ${
                  isActive("/new-arrivals")
                    ? "text-pink-700 underline decoration-pink-300 underline-offset-4 decoration-2"
                    : "text-pink-600 hover:text-pink-700"
                }`}
              >
                {t("new_arrivals")}
              </Link>
              <Link
                href={buildUrlWithBranch("/best-sellers")}
                className={`text-xs font-semibold tracking-widest uppercase transition-colors ${
                  isActive("/best-sellers")
                    ? "text-pink-700 underline decoration-pink-300 underline-offset-4 decoration-2"
                    : "text-pink-600 hover:text-pink-700"
                }`}
              >
                {t("best_sellers")}
              </Link>
            </div>
          </div>

          {/* Center: Brand name */}
          <Link
            href={buildUrlWithBranch("/")}
            className="flex min-w-0 items-center justify-center md:absolute md:left-1/2 md:-translate-x-1/2"
          >
            <span className="truncate text-sm sm:text-base md:text-2xl font-semibold tracking-[0.12em] sm:tracking-[0.16em] md:tracking-[0.2em] uppercase text-gray-900">
              {t("brand")}
            </span>
          </Link>

          {/* Right: filters + icons */}
          <div className="flex items-center gap-0.5 sm:gap-1 md:gap-4 flex-shrink-0">
            {/* Branch Dropdown Filter - Desktop */}
            <div className="hidden md:block relative" ref={branchDropdownRef}>
              <button
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                className="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <span>
                  {availableBranches.find((s) => s.id === selectedBranch)
                    ?.name || "Main Branch"}
                </span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showBranchDropdown ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Branch Dropdown Menu */}
              {showBranchDropdown && (
                <div className="absolute top-full right-0 mt-3 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  {availableBranches.map((shop) => (
                    <button
                      key={shop.id}
                      onClick={() => handleBranchClick(shop.id)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        selectedBranch === shop.id
                          ? "text-gray-900 font-semibold"
                          : "text-gray-600"
                      }`}
                    >
                      {shop.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="hidden md:inline text-gray-200">|</span>

            {/* Currency Dropdown Filter - Desktop */}
            <div className="hidden md:block relative" ref={currencyDropdownRef}>
              <button
                onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                className="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <span>{selectedCurrency}</span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showCurrencyDropdown ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Currency Dropdown Menu */}
              {showCurrencyDropdown && (
                <div className="absolute top-full right-0 mt-3 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <button
                    onClick={() => handleCurrencyClick("THB")}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      selectedCurrency === "THB"
                        ? "text-gray-900 font-semibold"
                        : "text-gray-600"
                    }`}
                  >
                    ฿ Thai Baht (THB)
                  </button>
                  <button
                    onClick={() => handleCurrencyClick("MMK")}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      selectedCurrency === "MMK"
                        ? "text-gray-900 font-semibold"
                        : "text-gray-600"
                    }`}
                  >
                    Ks Myanmar Kyat (MMK)
                  </button>
                </div>
              )}
            </div>

            <span className="hidden md:inline text-gray-200">|</span>

            {/* Language Dropdown - Desktop */}
            <div className="hidden md:block relative" ref={languageDropdownRef}>
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <span>{lang === "EN" ? "English" : "Myanmar"}</span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showLanguageDropdown ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showLanguageDropdown && (
                <div className="absolute top-full right-0 mt-3 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <button
                    onClick={() => {
                      setLanguage("EN");
                      setShowLanguageDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      lang === "EN"
                        ? "text-gray-900 font-semibold"
                        : "text-gray-600"
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => {
                      setLanguage("MM");
                      setShowLanguageDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      lang === "MM"
                        ? "text-gray-900 font-semibold"
                        : "text-gray-600"
                    }`}
                  >
                    Myanmar
                  </button>
                </div>
              )}
            </div>

            {/* Account icon */}
            <Link
              href={
                user ? buildUrlWithBranch("/account/profile") : "/auth/login"
              }
              aria-label="Account"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-pink-600 hover:bg-pink-50 hover:text-pink-700 transition-colors md:h-auto md:w-auto md:rounded-none md:hover:bg-transparent"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </Link>

            {/* Cart icon */}
            <Link
              href={buildUrlWithBranch("/cart")}
              aria-label="Cart"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-pink-600 hover:bg-pink-50 hover:text-pink-700 transition-colors md:h-auto md:w-auto md:rounded-none md:hover:bg-transparent"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4h2l2 12h10l2-8H7"
                />
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="17" cy="20" r="1.5" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white md:-right-2 md:-top-2">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Offcanvas menu (responsive) - keep mounted for smooth animations */}
        <div
          className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />

        {/* `invisible` when closed keeps the off-screen panel out of the tab
            order, otherwise keyboard focus disappears into a hidden drawer. */}
        <div
          id="mobile-menu"
          aria-hidden={!menuOpen}
          className={`fixed inset-y-0 left-0 z-50 flex w-[19rem] max-w-[86vw] flex-col bg-white shadow-xl transition-transform duration-300 ${
            menuOpen
              ? "translate-x-0"
              : "-translate-x-full invisible pointer-events-none"
          }`}
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-rose-100 px-5 py-4">
            <span className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-gray-900">
              {t("brand")}
            </span>
            <button
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="-mr-2 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5">
              <Link
                href={buildUrlWithBranch("/")}
                className={`flex items-center justify-between gap-3 py-3.5 border-b border-gray-100 text-base md:text-lg transition-colors ${
                  isActive("/")
                    ? "text-rose-500"
                    : "text-gray-900 hover:text-rose-500"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                <span>{t("home")}</span>
                <svg
                  className="w-4 h-4 text-gray-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>

              {/* View All with collapsible categories */}
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowViewAllCategories((s) => !s)}
                  aria-expanded={showViewAllCategories}
                  className={`flex items-center justify-between gap-3 w-full py-3.5 text-base md:text-lg transition-colors ${
                    isActive("/view-all")
                      ? "text-rose-500"
                      : "text-gray-900 hover:text-rose-500"
                  }`}
                >
                  <span>Products</span>
                  <svg
                    className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${showViewAllCategories ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* Category filters for Products. Selecting one applies the
                    `category` filter on /view-all from wherever the shopper
                    currently is — categories are filters, not their own pages. */}
                {showViewAllCategories && (
                  <div className="pb-3 space-y-0.5">
                    <button
                      onClick={() => {
                        handleCategoryClick("all", "/view-all");
                        setMenuOpen(false);
                      }}
                      className={`block w-full text-left py-2.5 pl-3 text-sm transition-colors ${
                        isActive("/view-all") && selectedCategory === "all"
                          ? "text-rose-600 font-medium"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      All Products
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          handleCategoryClick(cat, "/view-all");
                          setMenuOpen(false);
                        }}
                        className={`block w-full text-left py-2.5 pl-3 text-sm transition-colors ${
                          isActive("/view-all") && selectedCategory === cat
                            ? "text-rose-600 font-medium"
                            : "text-gray-500 hover:text-gray-800"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* New Arrivals with collapsible categories */}
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowNewArrivalsCategories((s) => !s)}
                  aria-expanded={showNewArrivalsCategories}
                  className={`flex items-center justify-between gap-3 w-full py-3.5 text-base md:text-lg transition-colors ${
                    isActive("/new-arrivals")
                      ? "text-rose-500"
                      : "text-gray-900 hover:text-rose-500"
                  }`}
                >
                  <span>{t("new_arrivals")}</span>
                  <svg
                    className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${showNewArrivalsCategories ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* Category filters for New Arrivals */}
                {showNewArrivalsCategories && (
                  <div className="pb-3 space-y-0.5">
                    <button
                      onClick={() => {
                        handleCategoryClick("all", "/new-arrivals");
                        setMenuOpen(false);
                      }}
                      className={`block w-full text-left py-2.5 pl-3 text-sm transition-colors ${
                        isActive("/new-arrivals") && selectedCategory === "all"
                          ? "text-rose-600 font-medium"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      All Products
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          handleCategoryClick(cat, "/new-arrivals");
                          setMenuOpen(false);
                        }}
                        className={`block w-full text-left py-2.5 pl-3 text-sm transition-colors ${
                          isActive("/new-arrivals") && selectedCategory === cat
                            ? "text-rose-600 font-medium"
                            : "text-gray-500 hover:text-gray-800"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Best Sellers with collapsible categories */}
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowBestSellersCategories((s) => !s)}
                  aria-expanded={showBestSellersCategories}
                  className={`flex items-center justify-between gap-3 w-full py-3.5 text-base md:text-lg transition-colors ${
                    isActive("/best-sellers")
                      ? "text-rose-500"
                      : "text-gray-900 hover:text-rose-500"
                  }`}
                >
                  <span>{t("best_sellers")}</span>
                  <svg
                    className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${showBestSellersCategories ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* Category filters for Best Sellers */}
                {showBestSellersCategories && (
                  <div className="pb-3 space-y-0.5">
                    <button
                      onClick={() => {
                        handleCategoryClick("all", "/best-sellers");
                        setMenuOpen(false);
                      }}
                      className={`block w-full text-left py-2.5 pl-3 text-sm transition-colors ${
                        isActive("/best-sellers") && selectedCategory === "all"
                          ? "text-rose-600 font-medium"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      All Products
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          handleCategoryClick(cat, "/best-sellers");
                          setMenuOpen(false);
                        }}
                        className={`block w-full text-left py-2.5 pl-3 text-sm transition-colors ${
                          isActive("/best-sellers") && selectedCategory === cat
                            ? "text-rose-600 font-medium"
                            : "text-gray-500 hover:text-gray-800"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Link
                href={buildUrlWithBranch("/cart")}
                className={`flex items-center justify-between gap-3 py-3.5 border-b border-gray-100 text-base md:text-lg transition-colors ${
                  isActive("/cart")
                    ? "text-rose-500"
                    : "text-gray-900 hover:text-rose-500"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  Cart
                  {itemCount > 0 && (
                    <span className="bg-rose-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                      {itemCount}
                    </span>
                  )}
                </span>
                <svg
                  className="w-4 h-4 text-gray-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>

              <Link
                href={buildUrlWithBranch("/membership")}
                className={`flex items-center justify-between gap-3 py-3.5 border-b border-gray-100 text-base md:text-lg transition-colors ${
                  isActive("/membership")
                    ? "text-rose-500"
                    : "text-gray-900 hover:text-rose-500"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  {/* <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg> */}
                  {user && !isMember && !membershipLoading ? "Join Membership" : "Membership & Rewards"}
                </span>
                <svg
                  className="w-4 h-4 text-gray-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>

            {/* Utility / account footer section */}
            <div className="mt-2 bg-gray-50 px-5 py-5 space-y-3.5">
              {user ? (
                <>
                  <Link
                    href={buildUrlWithBranch("/account/profile")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    My Account
                  </Link>
                  {/* <Link
                    href={buildUrlWithBranch("/membership")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    {!isMember && !membershipLoading ? "Join Membership" : "Membership & Rewards"}
                  </Link> */}
                  <Link
                    href={buildUrlWithBranch("/account/purchases")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    Purchase History
                  </Link>
                  <Link
                    href={buildUrlWithBranch("/account/notifications")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    Notifications
                  </Link>
                  <Link
                    href={buildUrlWithBranch("/terms-and-conditions")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    {t("terms")}
                  </Link>
                  <button
                    onClick={() => logout()}
                    className="block text-sm text-red-500 hover:text-red-600 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    href="/auth/register"
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-rose-600 transition-colors"
                  >
                    Register
                  </Link>
                </>
              )}

              {/* Branch and currency live in the desktop header bar, which is
                  hidden below md. Without these the only way a phone shopper
                  could change either was by hand-editing the URL. */}
              {availableBranches.length > 0 && (
                <div className="border-t border-gray-200 pt-4 md:hidden">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Branch
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availableBranches.map((shop) => (
                      <button
                        key={shop.id}
                        onClick={() => {
                          handleBranchClick(shop.id);
                          setMenuOpen(false);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selectedBranch === shop.id
                            ? "border-transparent bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                            : "border-rose-200 bg-white text-gray-600 hover:border-rose-300 hover:bg-rose-50"
                        }`}
                      >
                        {shop.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4 md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Currency
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["THB", "MMK"] as const).map((code) => (
                    <button
                      key={code}
                      onClick={() => {
                        handleCurrencyClick(code);
                        setMenuOpen(false);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        selectedCurrency === code
                          ? "border-transparent bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                          : "border-rose-200 bg-white text-gray-600 hover:border-rose-300 hover:bg-rose-50"
                      }`}
                    >
                      {code === "THB" ? "฿ THB" : "Ks MMK"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Language
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setLanguage("EN")}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      lang === "EN"
                        ? "border-transparent bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                        : "border-rose-200 bg-white text-gray-600 hover:border-rose-300 hover:bg-rose-50"
                    }`}
                  >
                    {t("EN")}
                  </button>
                  <button
                    onClick={() => setLanguage("MM")}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      lang === "MM"
                        ? "border-transparent bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm"
                        : "border-rose-200 bg-white text-gray-600 hover:border-rose-300 hover:bg-rose-50"
                    }`}
                  >
                    {t("MM")}
                  </button>
                </div>
              </div>
            </div>
          </nav>
        </div>

        {/* Mobile search bar */}
        {searchOpen && (
          <div className="md:hidden border-t border-pink-200/70 bg-white px-3 py-2.5 sm:px-4">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitSearch();
                  }
                  if (e.key === "Escape") {
                    closeSearch();
                  }
                }}
                placeholder={t("search_placeholder")}
                enterKeyHint="search"
                className="min-w-0 flex-1 rounded-full border border-rose-200 bg-rose-50/40 px-4 py-2.5 text-base text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-200"
              />
              <button
                aria-label="Close search"
                onClick={closeSearch}
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full hover:bg-pink-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-pink-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 8.586L15.95 2.636a1 1 0 111.414 1.414L11.414 10l5.95 5.95a1 1 0 01-1.414 1.414L10 11.414l-5.95 5.95A1 1 0 012.636 15.95L8.586 10 2.636 4.05A1 1 0 014.05 2.636L10 8.586z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}

export default function NavBar() {
  return (
    <Suspense fallback={<div className="h-16 bg-[#F8EDF1]" />}>
      <NavBarContent />
    </Suspense>
  );
}
