import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export type Currency = "THB" | "MMK";

/**
 * Hook to manage currency selection across the application
 * Syncs with URL params, localStorage and listens to currency change events
 */
export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>("THB");
  const searchParams = useSearchParams();

  useEffect(() => {
    // Priority 1: Read from URL parameter
    const urlCurrency = searchParams?.get("currency") as Currency | null;
    if (urlCurrency === "THB" || urlCurrency === "MMK") {
      setCurrency(urlCurrency);
      // Save to localStorage for future sessions
      try {
        localStorage.setItem("currency", urlCurrency);
      } catch (e) {
        // ignore
      }
      return;
    }

    // Priority 2: Load from localStorage on mount
    try {
      const savedCurrency = localStorage.getItem("currency") as Currency | null;
      if (savedCurrency === "THB" || savedCurrency === "MMK") {
        setCurrency(savedCurrency);
      }
    } catch (e) {
      // ignore
    }

    // Listen for currency changes from NavBar
    const handleCurrencyChange = (e: CustomEvent) => {
      const newCurrency = e.detail as Currency;
      if (newCurrency === "THB" || newCurrency === "MMK") {
        setCurrency(newCurrency);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("app:currency", handleCurrencyChange as EventListener);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("app:currency", handleCurrencyChange as EventListener);
      }
    };
  }, [searchParams]);

  return currency;
}

/**
 * Format price in the selected currency
 */
export function formatPrice(
  priceTHB: number,
  currency: Currency,
  mmkRate: number
): string {
  if (currency === "THB") {
    return Number.isInteger(priceTHB)
      ? `฿${priceTHB.toFixed(0)}`
      : `฿${priceTHB.toFixed(2)}`;
  } else {
    const priceMMK = Math.round(priceTHB * mmkRate);
    return `${priceMMK.toLocaleString()} Ks`;
  }
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: Currency): string {
  return currency === "THB" ? "฿" : "Ks";
}
