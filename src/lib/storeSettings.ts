/**
 * Owner-configured store settings, read server-side.
 *
 * The POS app owns these: `SettingsService` in pos-clothing-store writes a
 * single `business_settings/main` document. The storefront normally reaches them
 * by proxying the POS `/api/settings` route, but the Telegram bot has no browser
 * and no session, so it reads the document directly with the Admin SDK.
 */

import { adminDb } from "./firebase-admin";

/**
 * Fallback THB -> MMK rate.
 *
 * Matches the storefront's `useCurrencyRate()` fallback chain so a missing
 * setting produces the same number in the bot as on the website. The bot used to
 * default to 43 while the website defaulted to 55, which meant the same product
 * was quoted two different prices.
 */
const DEFAULT_MMK_RATE = 55;

/** Settings change rarely; one read per minute is plenty for a chat. */
const CACHE_TTL_MS = 60 * 1000;

let cached: { rate: number; at: number } | null = null;

/**
 * Current THB -> MMK conversion rate.
 *
 * Resolution order mirrors the storefront: the owner's `currencyRate`, then
 * `NEXT_PUBLIC_MMK_RATE`, then the shared default. Cached in-process, so on a
 * serverless platform each instance holds its own copy — acceptable because the
 * value is a display rate, not something we transact on.
 */
export async function getMmkRate(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.rate;
  }

  const envRate = Number(process.env.NEXT_PUBLIC_MMK_RATE);
  let rate = Number.isFinite(envRate) && envRate > 0 ? envRate : DEFAULT_MMK_RATE;

  if (adminDb) {
    try {
      const snap = await adminDb
        .collection("business_settings")
        .doc("main")
        .get();

      const configured = Number(snap.data()?.currencyRate);
      if (Number.isFinite(configured) && configured > 0) {
        rate = configured;
      }
    } catch (error) {
      console.error("Could not read currencyRate, using fallback:", error);
    }
  }

  cached = { rate, at: Date.now() };
  return rate;
}
