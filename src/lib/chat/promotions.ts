import { adminDb } from "../firebase-admin";

/**
 * Promotion and coupon facts for the chatbot.
 *
 * Everything here comes from Firestore. The previous implementation served a
 * hardcoded array that advertised a `WELCOME10` code and a free-shipping
 * threshold that do not exist, which meant the bot promised discounts the
 * checkout would reject.
 */

export interface ChatPromotion {
  name: string;
  description?: string;
  productName?: string;
  /** "20% off" or "5000 off", already formatted. */
  discount: string;
  endsAt?: string;
}

export interface ChatCoupon {
  code: string;
  discount: string;
  expiresAt?: string;
  inUse: boolean;
  pointsCost?: number;
  packageName?: string;
}

export interface ChatRewardTier {
  name: string;
  pointsRequired: number;
  discount: string;
  affordable: boolean;
}

export interface PromotionSnapshot {
  promotions: ChatPromotion[];
  /** Only present when the customer is signed in. */
  coupons?: ChatCoupon[];
  loyaltyPoints?: number;
  redeemablePoints?: number;
  rewardTiers?: ChatRewardTier[];
  loyaltyEnabled: boolean;
}

function formatDiscount(type: string, value: number): string {
  return type === "percentage" ? `${value}% off` : `${value} off`;
}

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Mirrors isActiveNow in lib/onlinePromotion.ts: flag plus date window. */
function isPromotionLive(data: Record<string, unknown>): boolean {
  if (data.isActive === false) return false;

  const now = Date.now();

  const start = data.startDate ? new Date(String(data.startDate)) : null;
  if (start && !Number.isNaN(start.getTime()) && now < start.getTime()) {
    return false;
  }

  const end = data.endDate ? new Date(String(data.endDate)) : null;
  if (end && !Number.isNaN(end.getTime())) {
    // End date is inclusive of the whole day.
    end.setHours(23, 59, 59, 999);
    if (now > end.getTime()) return false;
  }

  return true;
}

function isCouponUsable(coupon: Record<string, unknown>): boolean {
  if (coupon.status !== "active") return false;

  const expiresAt = toIso(coupon.expiresAt);
  if (!expiresAt) return true;

  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now();
}

/**
 * Live promotions, plus the signed-in customer's own coupons and reward tiers.
 * Pass `customerUid` as null for anonymous visitors: they get store-wide
 * promotions only, and the bot must not imply they hold any coupon.
 */
export async function getPromotionSnapshot(
  customerUid: string | null,
): Promise<PromotionSnapshot> {
  const snapshot: PromotionSnapshot = {
    promotions: [],
    loyaltyEnabled: false,
  };

  if (!adminDb) return snapshot;

  // --- Store-wide product promotions ---
  try {
    const promoSnap = await adminDb.collection("online_promotions").get();

    snapshot.promotions = promoSnap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter(isPromotionLive)
      .map((data) => ({
        name: String(data.name || "Promotion"),
        description: data.description ? String(data.description) : undefined,
        productName: data.productName ? String(data.productName) : undefined,
        discount: formatDiscount(
          String(data.discountType || "percentage"),
          Number(data.discountValue || 0),
        ),
        endsAt: data.endDate ? String(data.endDate) : undefined,
      }));
  } catch (error) {
    console.error("Error loading promotions for chat:", error);
  }

  // --- Loyalty programme configuration ---
  let pointsForCoupon: number | null = null;
  let rewardPackages: Array<Record<string, unknown>> = [];

  try {
    const settings = await adminDb
      .collection("business_settings")
      .doc("main")
      .get();
    const loyalty = settings.data()?.loyaltySettings as
      | Record<string, unknown>
      | undefined;

    snapshot.loyaltyEnabled = loyalty?.enabled === true;
    pointsForCoupon =
      typeof loyalty?.pointsForCoupon === "number"
        ? loyalty.pointsForCoupon
        : null;
    rewardPackages = Array.isArray(loyalty?.couponPackages)
      ? (loyalty.couponPackages as Array<Record<string, unknown>>)
      : [];
  } catch (error) {
    console.error("Error loading loyalty settings for chat:", error);
  }

  if (!customerUid) return snapshot;

  // --- This customer's coupons and points ---
  try {
    const customerSnap = await adminDb
      .collection("customers")
      .doc(customerUid)
      .get();

    if (!customerSnap.exists) return snapshot;

    const customer = customerSnap.data() || {};
    const coupons = (
      (customer.coupons as Array<Record<string, unknown>>) || []
    ).filter(isCouponUsable);

    snapshot.coupons = coupons.map((coupon) => ({
      code: String(coupon.code || ""),
      discount: formatDiscount(
        String(coupon.discountType || "percentage"),
        Number(coupon.discountValue || 0),
      ),
      expiresAt: toIso(coupon.expiresAt),
      inUse: coupon.inUse === true,
      pointsCost:
        typeof coupon.pointsCost === "number" ? coupon.pointsCost : undefined,
      packageName: coupon.packageName
        ? String(coupon.packageName)
        : undefined,
    }));

    const loyaltyPoints = Number(customer.loyaltyPoints || 0);

    // Unused coupons still owe their points, so only the remainder can fund a
    // new redemption. Same rule as the membership page.
    const reserved = coupons.reduce(
      (sum, coupon) => sum + Number(coupon.pointsCost || 0),
      0,
    );
    const redeemablePoints = Math.max(0, loyaltyPoints - reserved);

    snapshot.loyaltyPoints = loyaltyPoints;
    snapshot.redeemablePoints = redeemablePoints;

    const tiers =
      rewardPackages.length > 0
        ? rewardPackages
            .filter(
              (pkg) =>
                pkg.enabled !== false && Number(pkg.pointsRequired) > 0,
            )
            .map((pkg) => ({
              name: String(pkg.name || "Reward"),
              pointsRequired: Number(pkg.pointsRequired),
              discount: formatDiscount(
                String(pkg.discountType || "percentage"),
                Number(pkg.discountValue || 0),
              ),
              affordable: redeemablePoints >= Number(pkg.pointsRequired),
            }))
            .sort((a, b) => a.pointsRequired - b.pointsRequired)
        : pointsForCoupon
          ? [
              {
                name: "Reward Coupon",
                pointsRequired: pointsForCoupon,
                discount: "see membership page",
                affordable: redeemablePoints >= pointsForCoupon,
              },
            ]
          : [];

    snapshot.rewardTiers = tiers;
  } catch (error) {
    console.error("Error loading customer coupons for chat:", error);
  }

  return snapshot;
}
