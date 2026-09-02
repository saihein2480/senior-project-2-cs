import { useQuery } from "@tanstack/react-query";

type SettingsResponse = {
  data?: {
    currencyRate?: number;
    taxRate?: number;
  };
  currencyRate?: number;
  taxRate?: number;
  success?: boolean;
  error?: string;
};

/**
 * Fetch settings data with no cache for real-time updates
 */
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<SettingsResponse> => {
      const response = await fetch("/api/settings", {
        cache: 'no-store', // Disable Next.js caching
        headers: {
          'Cache-Control': 'no-cache', // Disable browser caching
        },
      });
      if (!response.ok) {
        throw new Error(`Settings API error: ${response.status}`);
      }
      return response.json();
    },
    staleTime: 0, // Always consider data stale - refetch immediately
    gcTime: 0, // Don't cache at all
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchInterval: 5000, // Poll every 5 seconds for changes
  });
}

/**
 * Get currency rate from settings
 * Returns default MMK rate if API fails
 */
export function useCurrencyRate() {
  const { data, isLoading, error } = useSettings();

  const rate =
    (data?.data?.currencyRate ??
      data?.currencyRate ??
      Number(process?.env?.NEXT_PUBLIC_MMK_RATE)) ||
    55;

  return {
    rate,
    isLoading,
    error,
  };
}

/**
 * Get tax rate from settings
 * Returns default 7% tax rate if API fails
 * Note: taxRate is stored as percentage (e.g., 7 for 7%), so we divide by 100
 */
export function useTaxRate() {
  const { data, isLoading, error } = useSettings();

  // Tax rate is stored as a percentage in POS settings (e.g. 7 for 7%).
  // Never invent a fallback rate: if settings are unavailable we must not
  // silently charge a tax the owner did not configure.
  const resolvedPercent = data?.data?.taxRate ?? data?.taxRate;
  const hasTaxRate = typeof resolvedPercent === "number";
  const taxRatePercent = hasTaxRate ? resolvedPercent : 0;

  return {
    taxRate: taxRatePercent / 100,
    taxRatePercent, // Percentage value for display
    hasTaxRate, // False until the real rate has loaded
    isLoading,
    error,
  };
}
