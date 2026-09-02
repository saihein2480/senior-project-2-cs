"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useLanguage } from "../contexts/LanguageContext";
import { useCustomerAuth } from "../contexts/CustomerAuthContext";
import { useCart } from "../contexts/CartContext";
import { useProducts } from "../hooks/useProducts";
import { useShops } from "../hooks/useShops";

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
  const { data: products = [] } = useProducts();
  const { data: shops = [] } = useShops();
  const branchDropdownRef = useRef<HTMLDivElement | null>(null);
  const currencyDropdownRef = useRef<HTMLDivElement | null>(null);
  const languageDropdownRef = useRef<HTMLDivElement | null>(null);

  // Get only first two branches (Main Branch should be first)
  // Sort by name to ensure "Main Branch" comes first if it exists by name
  const availableBranches = React.useMemo(() => {
    const sorted = [...shops].sort((a, b) => {
      // Prioritize "Main Branch" by name
      if (a.name.toLowerCase().includes("main")) return -1;
      if (b.name.toLowerCase().includes("main")) return 1;
      // Otherwise sort alphabetically
      return a.name.localeCompare(b.name);
    });
    return sorted.slice(0, 2);
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

  // Extract unique categories from products
  const categories = React.useMemo(() => {
    if (!products || products.length === 0) return [];
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.description) cats.add(p.description);
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  const isActive = (p: string) => {
    if (!pathname) return false;
    return pathname === p;
  };

  const supportsInlineSearch = (p?: string | null) => {
    if (!p) return false;
    return (
      p === "/" ||
      p.startsWith("/new-arrivals") ||
      p.startsWith("/best-sellers") ||
      p.startsWith("/product/")
    );
  };

  const navLinkClass = (p: string, extra = "") =>
    `text-gray-800  ${isActive(p) ? "text-[#111827] font-semibold underline decoration-pink-300 underline-offset-4 decoration-2" : ""} ${extra}`.trim();

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Update URL query without closing UI (used for live typing)
  const updateUrlQuery = (term: string) => {
    try {
      if (supportsInlineSearch(pathname)) {
        const lg = pathname || "/";
        const newUrl = term ? `${lg}?q=${encodeURIComponent(term)}` : lg;
        // replace history state without triggering navigation
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", newUrl);
          try {
            window.dispatchEvent(
              new CustomEvent("app:search", { detail: term }),
            );
          } catch (e) {
            // ignore
          }
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

  // Commit search (Enter or explicit click) — navigate and close UI
  const commitSearch = (q?: string) => {
    const term = (q ?? searchQuery).trim();
    try {
      if (supportsInlineSearch(pathname)) {
        const lg = pathname || "/";
        const newUrl = term ? `${lg}?q=${encodeURIComponent(term)}` : lg;
        try {
          router.replace(newUrl);
        } finally {
          if (typeof window !== "undefined") {
            try {
              window.dispatchEvent(
                new CustomEvent("app:search", { detail: term }),
              );
            } catch (e) {
              // ignore
            }
          }
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

  // Handle category filter
  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    const currentPath = pathname || "/";
    const currentParams = new URLSearchParams(searchParams?.toString() || "");

    // Preserve branch parameter
    if (selectedBranch && availableBranches.length > 0) {
      currentParams.set("branch", selectedBranch);
    }

    // Preserve currency parameter
    if (selectedCurrency) {
      currentParams.set("currency", selectedCurrency);
    }

    // Set category parameter
    if (category === "all") {
      currentParams.set("category", "all");
    } else {
      currentParams.set("category", encodeURIComponent(category));
    }

    const newUrl = `${currentPath}?${currentParams.toString()}`;

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
        className={`sticky top-0 z-50 bg-white border-b border-gray-200 transition-shadow ${
          scrolled ? "shadow-sm" : ""
        }`}
        aria-label="Main navigation"
      >
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 md:px-8 py-3.5 relative">
          {/* Left: mobile hamburger + desktop search & nav links */}
          <div className="flex items-center gap-6 flex-shrink-0">
            {/* Mobile hamburger */}
            <button
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((s) => !s)}
              className="p-1 -ml-1 text-gray-700 md:hidden"
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
                onClick={() => setSearchOpen((s) => !s)}
                className="inline-flex text-gray-700 hover:text-gray-900 transition-colors"
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

              {searchOpen && (
                <div className="absolute top-full left-0 mt-3 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
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
                          setSearchOpen(false);
                        }
                      }}
                      placeholder={t("search_placeholder")}
                      className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400"
                    />
                    <button
                      aria-label="Search"
                      onClick={() => commitSearch()}
                      className="text-gray-500 hover:text-gray-800"
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
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Shop
              </button>
              <Link
                href={buildUrlWithBranch("/new-arrivals")}
                className={`text-xs font-semibold tracking-widest uppercase transition-colors ${
                  isActive("/new-arrivals")
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {t("new_arrivals")}
              </Link>
              <Link
                href={buildUrlWithBranch("/best-sellers")}
                className={`text-xs font-semibold tracking-widest uppercase transition-colors ${
                  isActive("/best-sellers")
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {t("best_sellers")}
              </Link>
            </div>
          </div>

          {/* Center: Brand name */}
          <Link
            href={buildUrlWithBranch("/")}
            className="flex items-center md:absolute md:left-1/2 md:-translate-x-1/2"
          >
            <span className="text-lg md:text-2xl font-semibold tracking-[0.2em] uppercase text-gray-900">
              {t("brand")}
            </span>
          </Link>

          {/* Right: filters + icons */}
          <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
            {/* Branch Dropdown Filter - Desktop */}
            <div className="hidden md:block relative" ref={branchDropdownRef}>
              <button
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
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
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
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
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
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
              className="text-gray-700 hover:text-gray-900 transition-colors"
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
              className="relative text-gray-700 hover:text-gray-900 transition-colors"
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
                <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-pink-500 px-1 text-center text-[10px] font-semibold text-white">
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

        <div
          className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-white shadow-xl transform transition-transform duration-300 flex flex-col ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="px-5 pt-5 pb-2 flex items-center flex-shrink-0">
            <button
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.25}
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

          <nav
            className="flex-1 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 60px)" }}
          >
            <div className="px-5">
              <Link
                href={buildUrlWithBranch("/")}
                className={`flex items-center justify-between py-4 border-b border-gray-100 text-xl transition-colors ${
                  isActive("/")
                    ? "text-pink-500"
                    : "text-gray-900 hover:text-pink-500"
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
                  onClick={() => {
                    if (pathname !== "/view-all") {
                      router.push(buildUrlWithBranch("/view-all"));
                      setShowViewAllCategories(true);
                      // Don't close menu - keep it open
                    } else {
                      setShowViewAllCategories(!showViewAllCategories);
                    }
                  }}
                  className={`flex items-center justify-between w-full py-4 text-xl transition-colors ${
                    isActive("/view-all")
                      ? "text-pink-500"
                      : "text-gray-900 hover:text-pink-500"
                  }`}
                >
                  <span>Products</span>
                  <svg
                    className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${pathname === "/view-all" && showViewAllCategories ? "rotate-90" : ""}`}
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

                {/* Category Filter for View All */}
                {pathname === "/view-all" && showViewAllCategories && (
                  <div className="pb-3 space-y-0.5">
                    <button
                      onClick={() => {
                        handleCategoryClick("all");
                        setMenuOpen(false);
                      }}
                      className={`block w-full text-left py-2 text-sm transition-colors ${
                        selectedCategory === "all"
                          ? "text-pink-600 font-medium"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      All Products
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          handleCategoryClick(cat);
                        }}
                        className={`block w-full text-left py-2 text-sm transition-colors ${
                          selectedCategory === cat
                            ? "text-pink-600 font-medium"
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
                  onClick={() => {
                    if (pathname !== "/new-arrivals") {
                      router.push(buildUrlWithBranch("/new-arrivals"));
                      setShowNewArrivalsCategories(true);
                      // Don't close menu - keep it open
                    } else {
                      setShowNewArrivalsCategories(!showNewArrivalsCategories);
                    }
                  }}
                  className={`flex items-center justify-between w-full py-4 text-xl transition-colors ${
                    isActive("/new-arrivals")
                      ? "text-pink-500"
                      : "text-gray-900 hover:text-pink-500"
                  }`}
                >
                  <span>{t("new_arrivals")}</span>
                  <svg
                    className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${pathname === "/new-arrivals" && showNewArrivalsCategories ? "rotate-90" : ""}`}
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

                {/* Category Filter for New Arrivals */}
                {pathname === "/new-arrivals" && showNewArrivalsCategories && (
                  <div className="pb-3 space-y-0.5">
                    <button
                      onClick={() => {
                        handleCategoryClick("all");
                        setMenuOpen(false);
                      }}
                      className={`block w-full text-left py-2 text-sm transition-colors ${
                        selectedCategory === "all"
                          ? "text-pink-600 font-medium"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      All Products
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          handleCategoryClick(cat);
                        }}
                        className={`block w-full text-left py-2 text-sm transition-colors ${
                          selectedCategory === cat
                            ? "text-pink-600 font-medium"
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
                  onClick={() => {
                    if (pathname !== "/best-sellers") {
                      router.push(buildUrlWithBranch("/best-sellers"));
                      setShowBestSellersCategories(true);
                      // Don't close menu - keep it open
                    } else {
                      setShowBestSellersCategories(!showBestSellersCategories);
                    }
                  }}
                  className={`flex items-center justify-between w-full py-4 text-xl transition-colors ${
                    isActive("/best-sellers")
                      ? "text-pink-500"
                      : "text-gray-900 hover:text-pink-500"
                  }`}
                >
                  <span>{t("best_sellers")}</span>
                  <svg
                    className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-200 ${pathname === "/best-sellers" && showBestSellersCategories ? "rotate-90" : ""}`}
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

                {/* Category Filter for Best Sellers */}
                {pathname === "/best-sellers" && showBestSellersCategories && (
                  <div className="pb-3 space-y-0.5">
                    <button
                      onClick={() => {
                        handleCategoryClick("all");
                        setMenuOpen(false);
                      }}
                      className={`block w-full text-left py-2 text-sm transition-colors ${
                        selectedCategory === "all"
                          ? "text-pink-600 font-medium"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      All Products
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          handleCategoryClick(cat);
                        }}
                        className={`block w-full text-left py-2 text-sm transition-colors ${
                          selectedCategory === cat
                            ? "text-pink-600 font-medium"
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
                className={`flex items-center justify-between py-4 border-b border-gray-100 text-xl transition-colors ${
                  isActive("/cart")
                    ? "text-pink-500"
                    : "text-gray-900 hover:text-pink-500"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  Cart
                  {itemCount > 0 && (
                    <span className="bg-pink-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
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
                className={`flex items-center justify-between py-4 border-b border-gray-100 text-xl transition-colors ${
                  isActive("/membership")
                    ? "text-pink-500"
                    : "text-gray-900 hover:text-pink-500"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
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
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
                  >
                    My Account
                  </Link>
                  <Link
                    href={buildUrlWithBranch("/membership")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
                  >
                    {!isMember && !membershipLoading ? "Join Membership" : "Membership & Rewards"}
                  </Link>
                  <Link
                    href={buildUrlWithBranch("/account/purchases")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
                  >
                    Purchase History
                  </Link>
                  <Link
                    href={buildUrlWithBranch("/account/notifications")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
                  >
                    Notifications
                  </Link>
                  <Link
                    href={buildUrlWithBranch("/terms-and-conditions")}
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
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
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    href="/auth/register"
                    onClick={() => setMenuOpen(false)}
                    className="block text-sm text-gray-600 hover:text-pink-600 transition-colors"
                  >
                    Register
                  </Link>
                </>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setLanguage("EN")}
                  className={`text-sm transition-colors ${
                    lang === "EN"
                      ? "text-pink-600 font-semibold"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {t("EN")}
                </button>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => setLanguage("MM")}
                  className={`text-sm transition-colors ${
                    lang === "MM"
                      ? "text-pink-600 font-semibold"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {t("MM")}
                </button>
              </div>
            </div>
          </nav>
        </div>

        {/* Mobile search bar */}
        {searchOpen && (
          <div className="md:hidden border-t bg-white px-4 py-3">
            <div className="flex items-center space-x-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitSearch();
                  }
                }}
                placeholder={t("search_placeholder")}
                className="w-full border rounded-full border-gray-300 px-3 py-2 text-sm outline-none"
              />
              <button
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-700"
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
    <Suspense fallback={<div className="h-16 bg-white" />}>
      <NavBarContent />
    </Suspense>
  );
}
