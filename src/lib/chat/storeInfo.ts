import { adminDb } from "../firebase-admin";
import { formatPoliciesForAssistant } from "../storePolicies";
import { DELIVERY_AREA_LABEL, DELIVERY_AREAS } from "../deliveryArea";
import { normalizeDeliveryFee } from "../deliveryFee";

const namesOf = (kind: "ward" | "local") =>
  DELIVERY_AREAS.filter((a) => a.kind === kind)
    .map((a) => `${a.name} (${a.mm})`)
    .join(", ");

/** What checkout accepts, phrased for the assistant. */
const DELIVERY_AREAS_TEXT = `${DELIVERY_AREA_LABEL} only. Wards: ${namesOf("ward")}. Local areas: ${namesOf("local")}.`;

/**
 * Store facts for the chatbot, read from the systems that already own them:
 *
 *  - branches (name, address, township, city, phones, opening hours) ->
 *    `shops` collection, managed by the owner at /owner/shops/manage
 *  - policies (delivery time, exchange, refund, cancellation) -> the published
 *    Terms & Conditions, summarised in lib/storePolicies.ts
 *  - business name, currency, tax -> business_settings/main
 *
 * Optional extras the owner can set in POS Settings fill the remaining gaps.
 * Anything genuinely unknown is listed in `unknownFields` so the model says it
 * does not have that detail rather than inventing one.
 */

export interface StoreBranch {
  name: string;
  address?: string;
  township?: string;
  city?: string;
  phone?: string;
  secondaryPhone?: string;
  /** Per-branch hours, set by the owner at /owner/shops/manage. */
  openingHours?: string;
}

export interface StoreInfoSnapshot {
  businessName: string | null;
  branches: StoreBranch[];
  /**
   * Store-wide hours from POS Settings. Per-branch hours on each entry in
   * `branches` take priority; this is only a fallback for shops that keep one
   * schedule for every branch.
   */
  openingHours: string | null;
  email: string | null;
  deliveryAvailable: boolean | null;
  deliveryAreas: string | null;
  deliveryFee: string | null;
  codAvailable: boolean | null;
  codMaxAmount: number | null;
  paymentMethods: string[];
  /** Summarised Terms & Conditions, including delivery times and returns. */
  policies: string;
  policiesUrl: string;
  taxRatePercent: number | null;
  currency: string | null;
  unknownFields: string[];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getStoreInfoSnapshot(): Promise<StoreInfoSnapshot> {
  const snapshot: StoreInfoSnapshot = {
    businessName: null,
    branches: [],
    openingHours: null,
    email: null,
    deliveryAvailable: null,
    deliveryAreas: DELIVERY_AREAS_TEXT,
    deliveryFee: null,
    codAvailable: null,
    codMaxAmount: null,
    paymentMethods: [],
    policies: formatPoliciesForAssistant(),
    policiesUrl: "/terms-and-conditions",
    taxRatePercent: null,
    currency: null,
    unknownFields: [],
  };

  if (!adminDb) {
    snapshot.unknownFields.push("all store details (database unavailable)");
    return snapshot;
  }

  // --- Branches: the shops collection is the source of truth ---
  try {
    const shopsSnap = await adminDb.collection("shops").get();

    snapshot.branches = shopsSnap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      // Closed branches should not be given out as somewhere to visit.
      .filter((shop) => shop.status !== "inactive")
      .map((shop) => ({
        name: asString(shop.name) || "Branch",
        address: asString(shop.address) || undefined,
        township: asString(shop.township) || undefined,
        city: asString(shop.city) || undefined,
        phone: asString(shop.primaryPhone) || undefined,
        secondaryPhone: asString(shop.secondaryPhone) || undefined,
        openingHours: asString(shop.openingHours) || undefined,
      }));
  } catch (error) {
    console.error("Error loading shops for chat:", error);
  }

  // --- Business settings: name, currency, tax, plus optional extras ---
  try {
    const settingsDoc = await adminDb
      .collection("business_settings")
      .doc("main")
      .get();

    const data = settingsDoc.data() || {};
    const store = (data.storeInfo as Record<string, unknown>) || {};

    snapshot.businessName = asString(data.businessName);
    snapshot.currency = asString(data.defaultCurrency);
    snapshot.taxRatePercent =
      typeof data.taxRate === "number" ? data.taxRate : null;

    snapshot.openingHours = asString(store.openingHours);
    snapshot.email = asString(store.email);
    // Checkout only accepts Tachileik addresses, so the bot must say the same
    // regardless of what free text is in settings.
    snapshot.deliveryAreas = DELIVERY_AREAS_TEXT;
    // The numeric fee is what checkout actually charges, so it wins over the
    // older free-text note. The field only exists once the owner has saved
    // settings, so "absent" still means unknown rather than free.
    if (typeof data.deliveryFee === "number") {
      const fee = normalizeDeliveryFee(data.deliveryFee);
      snapshot.deliveryFee =
        fee > 0 ? `฿${fee.toFixed(2)} per order` : "Free delivery";
    } else {
      snapshot.deliveryFee = asString(store.deliveryFee);
    }

    snapshot.deliveryAvailable =
      typeof store.deliveryAvailable === "boolean"
        ? store.deliveryAvailable
        : null;
    snapshot.codAvailable =
      typeof store.codAvailable === "boolean" ? store.codAvailable : null;
    snapshot.codMaxAmount =
      typeof store.codMaxAmount === "number" && store.codMaxAmount > 0
        ? store.codMaxAmount
        : null;

    if (Array.isArray(store.paymentMethods)) {
      snapshot.paymentMethods = store.paymentMethods
        .map((method) => asString(method))
        .filter((method): method is string => !!method);
    }
  } catch (error) {
    console.error("Error loading store settings for chat:", error);
  }

  // Only report what genuinely has no source. Branches and policies now come
  // from shops and the terms page, so they are no longer "missing".
  const gaps: Array<[string, unknown]> = [
    ["branch addresses", snapshot.branches.some((b) => b.address) || null],
    ["phone number", snapshot.branches.some((b) => b.phone) || null],
    [
      "opening hours",
      // Known if any branch has its own hours, or settings has store-wide ones.
      snapshot.branches.some((b) => b.openingHours)
        ? true
        : snapshot.openingHours,
    ],
    ["delivery areas", snapshot.deliveryAreas],
    ["delivery fee", snapshot.deliveryFee],
    ["COD availability", snapshot.codAvailable],
    [
      "accepted payment methods",
      snapshot.paymentMethods.length > 0 ? true : null,
    ],
  ];

  snapshot.unknownFields = gaps
    .filter(([, value]) => value === null || value === undefined)
    .map(([label]) => label);

  return snapshot;
}
