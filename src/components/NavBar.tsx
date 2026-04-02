"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLanguage } from "../contexts/LanguageContext";
import { useCustomerAuth } from "../contexts/CustomerAuthContext";
import { useCart } from "../contexts/CartContext";

export default function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lang, setLang] = useState("EN");
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const { user, logout } = useCustomerAuth();
  const { itemCount } = useCart();

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
  return (
    <nav
      className={`sticky top-0 z-50 bg-[#ffffff] transition-shadow ${
        scrolled ? "shadow-md" : "shadow-sm"
      }`}
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between p-4 relative">
        {/* Left: hamburger / collapse menu */}
        <div className="flex items-center">
          {/* Mobile hamburger (visible on small screens) */}
          <button
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((s) => !s)}
            className="p-2 rounded-md hover:bg-gray-100 md:hidden"
          >
            <svg
              viewBox="0 0 48 48"
              className="h-8 w-8 text-gray-700 md:h-12 md:w-12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <line
                x1="8"
                y1="14"
                x2="40"
                y2="14"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <line
                x1="8"
                y1="24"
                x2="34"
                y2="24"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <line
                x1="8"
                y1="34"
                x2="28"
                y2="34"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Desktop menu button (opens offcanvas) */}
          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen((s) => !s)}
            className="p-1 hidden md:inline-flex"
          >
            <svg
              viewBox="0 0 48 48"
              className="h-8 w-8 text-gray-700 md:h-10 md:w-18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <line
                x1="8"
                y1="14"
                x2="40"
                y2="14"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <line
                x1="8"
                y1="24"
                x2="34"
                y2="24"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <line
                x1="8"
                y1="34"
                x2="28"
                y2="34"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Center: logo + shop name */}
        <div className="flex-1 flex items-center justify-center md:justify-center">
          <Link href="/" className="flex items-center space-x-3">
            {/* <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden">
              <img
                src="/logo.png"
                alt="logo"
                className="w-full h-full object-cover"
              />
            </div> */}
            <span className="text-2xl md:text-3xl font-pacifico tracking-tight text-gray-900 mr-0 md:mr-19">
              {t("brand")}
            </span>
          </Link>
        </div>

        {/* Right: search collapse */}
        <div className="flex items-center md:absolute  md:right-2 md:top-1/2 md:-translate-y-1/2">
          <div className="hidden md:flex items-center">
            {/* keep the search icon visible and animate the input container */}
            <button
              aria-label="Toggle search"
              onClick={() => setSearchOpen((s) => !s)}
              className={`p-2 rounded-full bg-white border border-gray-300 hover:bg-gray-50 transition-opacity duration-180 ${
                searchOpen ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
            </button>

            <div
              className="ml-2 flex items-center border border-gray-300 rounded-full px-3 py-1 bg-transparent overflow-hidden"
              style={{
                width: searchOpen ? 320 : 0,
                transition:
                  "width 260ms cubic-bezier(.22,.9,.36,1), opacity 180ms ease",
                opacity: searchOpen ? 1 : 0,
              }}
            >
              <button
                aria-label="Search"
                onClick={() => commitSearch()}
                className="p-0 m-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                  />
                </svg>
              </button>

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
                className="ml-3 outline-none text-sm text-gray-700 placeholder-gray-400 w-full"
              />

              <button
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
                className="ml-2 p-1 rounded"
              >
                ✕
              </button>
            </div>
          </div>

          {/* mobile search toggle */}
          <button
            aria-label="Toggle search"
            onClick={() => setSearchOpen((s) => !s)}
            className="mr-2 p-2 rounded-full bg-white border border-gray-300 hover:bg-gray-50 md:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
              />
            </svg>
          </button>

          <Link
            href="/cart"
            aria-label="Cart"
            className="relative inline-flex items-center justify-center rounded-full border border-gray-300 bg-white p-2 hover:bg-gray-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5 text-gray-700"
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
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-pink-500 px-1.5 text-center text-xs font-semibold text-white">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Offcanvas menu (responsive) - keep mounted for smooth animations */}
      <>
        <div
          className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />

        <div
          className={`fixed inset-y-0 left-0 z-50 w-70 bg-[#ffffff] shadow-lg transform transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="px-4 py-5  flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full border border-gray-400 bg-amber-100 flex items-center justify-center overflow-hidden">
                <img
                  src="/logo.jpg"
                  alt="logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="text-lg font-pacifico text-[#111827]">
                  {t("brand")}
                </div>
                {/* <div className="text-xs text-gray-600">
                  Clothing & Accessories
                </div> */}
              </div>
            </Link>
            <button
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="p-2 rounded-md  text-gray-700"
            >
              ✕
            </button>
          </div>

          <nav className="px-4 py-4 space-y-1">
            <Link
              href="/"
              className={navLinkClass(
                "/",
                "block px-3 py-2 rounded-md text-lg  font-pacifico",
              )}
            >
              {t("home")}
            </Link>
            <Link
              href="/new-arrivals"
              className={navLinkClass(
                "/new-arrivals",
                "block px-3 py-3 rounded-md text-lg  font-pacifico",
              )}
            >
              {t("new_arrivals")}
            </Link>
            <Link
              href="/best-sellers"
              className={navLinkClass(
                "/best-sellers",
                "block px-3 py-3 rounded-md text-lg  font-pacifico",
              )}
            >
              {t("best_sellers")}
            </Link>
            <Link
              href="/cart"
              className={navLinkClass(
                "/cart",
                "block px-3 py-3 rounded-md text-lg font-pacifico",
              )}
            >
              Cart {itemCount > 0 ? `(${itemCount})` : ""}
            </Link>

            {user && (
              <>
                <Link
                  href="/account/profile"
                  className="block px-3 py-3 rounded-md text-lg font-pacifico"
                >
                  My Account
                </Link>
                <Link
                  href="/account/purchases"
                  className="block px-3 py-3 rounded-md text-lg font-pacifico"
                >
                  Purchase History
                </Link>
            <Link
              href="/terms-and-conditions"
              className={navLinkClass(
                "/terms-and-conditions",
                "block px-3 py-3 rounded-md text-lg  font-pacifico",
              )}
            >
              {t("terms")}
            </Link>
                <button
                  onClick={() => logout()}
                  className="block w-full px-3 py-3 text-left rounded-md text-lg font-pacifico text-red-700"
                >
                  Logout
                </button>
              </>
            )}

            <div className="pt-3 border-t border-pink-400 mt-10">
              <div className="text-md text-gray-600 mb-4">{t("language")}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLanguage("EN")}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${lang === "EN" ? "bg-pink-400 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
                >
                  {t("EN")}
                </button>

                <button
                  onClick={() => setLanguage("MM")}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${lang === "MM" ? "bg-pink-400 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
                >
                  {t("MM")}
                </button>
              </div>

              {!user && (
                <div className="mt-4 space-y-1">
                  <Link
                    href="/auth/login"
                    className="block px-3 py-2 rounded-md text-lg font-pacifico"
                  >
                    Login
                  </Link>
                  <Link
                    href="/auth/register"
                    className="block px-3 py-2 rounded-md text-lg font-pacifico"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      </>

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
  );
}
