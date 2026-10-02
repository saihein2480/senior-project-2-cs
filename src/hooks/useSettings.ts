import { useQuery } from "@tanstack/react-query";
import { normalizeDeliveryFee } from "../lib/deliveryFee";
import { resolveMmkRate } from "../lib/orderPricing";

/**
 * The parts of the POS business settings the storefront uses.
 *
 * `/api/settings` proxies the POS endpoint, which returns the whole settings
 * document. Only what the storefront actually renders is typed here.
 */
type BusinessSettingsPayload = {
  currencyRate?: number;
  taxRate?: number;
  /** Flat THB delivery fee per online order; 0 or missing = free. */
  deliveryFee?: number;
  businessName?: string;
  businessLogo?: string;
  showBusinessLogoOnInvoice?: boolean;
  invoiceFooterMessage?: string;
  invoiceFooterImage?: string;
  currentBranch?: string;
  storeInfo?: {
    address?: string;
    phone?: string;
    email?: string;
  };
};

type SettingsResponse = BusinessSettingsPayload & {
  data?: BusinessSettingsPayload;
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

  // Same rule the order routes use (lib/orderPricing.ts), so the MMK amount
  // shown at checkout is the amount the server charges.
  const rate = resolveMmkRate(
    data?.data?.currencyRate ?? data?.currencyRate,
    process?.env?.NEXT_PUBLIC_MMK_RATE,
  );

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

/**
 * Delivery fee (THB) configured in POS Settings.
 *
 * Comes from the same settings response as the tax rate, so once `useTaxRate`
 * reports `hasTaxRate` this value is loaded too. A missing value means the owner
 * has not set a fee, which is free delivery.
 */
export function useDeliveryFee() {
  const { data, isLoading, error } = useSettings();

  const deliveryFeeTHB = normalizeDeliveryFee(
    data?.data?.deliveryFee ?? data?.deliveryFee,
  );

  return {
    deliveryFeeTHB,
    isFreeDelivery: deliveryFeeTHB === 0,
    isLoading,
    error,
  };
}

/** Who the store is, as it should appear at the top of a customer invoice. */
export type StoreProfile = {
  businessName: string;
  businessLogo: string;
  showLogoOnInvoice: boolean;
  invoiceFooterMessage: string;
  invoiceFooterImage: string;
  branchName: string;
  address: string;
  phone: string;
  email: string;
};

/**
 * Store identity for invoice headers.
 *
 * A customer invoice has to say who issued it. Everything here is optional at
 * the source, so each field falls back to an empty string and the invoice simply
 * omits whatever the owner has not configured rather than printing "undefined".
 */
export function useStoreProfile() {
  const { data, isLoading, error } = useSettings();

  const settings = data?.data ?? data ?? {};
  const store = settings.storeInfo ?? {};

  const profile: StoreProfile = {
    businessName: settings.businessName?.trim() || "",
    businessLogo: settings.businessLogo?.trim() || "",
    showLogoOnInvoice: settings.showBusinessLogoOnInvoice ?? true,
    invoiceFooterMessage: settings.invoiceFooterMessage?.trim() || "",
    invoiceFooterImage: settings.invoiceFooterImage?.trim() || "",
    branchName: settings.currentBranch?.trim() || "",
    address: store.address?.trim() || "",
    phone: store.phone?.trim() || "",
    email: store.email?.trim() || "",
  };

  return { profile, isLoading, error };
}
