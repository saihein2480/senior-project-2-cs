/**
 * Store categories, as owned by the POS app.
 *
 * The POS keeps them as a single array on `settings/categories` (see
 * CategoryService in pos-clothing-store), which is also what its stock forms use
 * to populate the category dropdown. So whatever the owner configures there is
 * exactly what products get tagged with, and reading this document is the only
 * way to stay in step with them.
 *
 * Server-only: uses the Admin SDK so callers do not depend on `settings` being
 * publicly readable under Firestore security rules.
 */

import { adminDb } from "./firebase-admin";

/**
 * Current category names, in the order the owner arranged them.
 *
 * Reads through on every call — no caching. These are consumed by request
 * handlers (the API route below, and the Telegram bot), so a fresh read is what
 * makes an edit in the POS show up immediately rather than after a redeploy.
 * Returns `[]` rather than throwing: an empty category list is a state every
 * caller has to handle anyway.
 */
export async function getStoreCategories(): Promise<string[]> {
  if (!adminDb) {
    console.error("Cannot read categories: Firebase Admin not configured");
    return [];
  }

  try {
    const snap = await adminDb.collection("settings").doc("categories").get();
    const raw = snap.exists ? snap.data()?.categories : [];

    if (!Array.isArray(raw)) return [];

    return raw
      .map((c) => String(c ?? "").trim())
      .filter((c) => c.length > 0);
  } catch (error) {
    console.error("Error reading store categories:", error);
    return [];
  }
}
