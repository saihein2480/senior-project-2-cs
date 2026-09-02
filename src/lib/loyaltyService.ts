import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const CUSTOMERS_COLLECTION = "customers";
const SETTINGS_COLLECTION = "business_settings";

export interface LoyaltyCoupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  usedInTransaction?: string;
  status: 'active' | 'used' | 'expired';
  /** Points spent to earn this coupon; deducted from the balance when used. */
  pointsCost?: number;
  /** Reward package that issued this coupon. */
  packageId?: string;
  /** Package label captured at issue time, so renames don't rewrite history. */
  packageName?: string;
  /** True while the customer has reserved this coupon for a pending checkout. */
  inUse?: boolean;
}

export interface LoyaltyPointsHistory {
  id: string;
  pointsEarned: number;
  transactionId: string;
  transactionAmount: number;
  earnedAt: Date;
  source: 'pos' | 'online';
  description?: string;
}

/**
 * A reward tier the owner configures in the POS. Mirrors `CouponPackage` in
 * pos-clothing-store/clothing-store/src/services/settingsService.ts.
 */
export interface CouponPackage {
  id: string;
  name: string;
  pointsRequired: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  validityDays: number;
  enabled: boolean;
}

export interface LoyaltySettings {
  enabled: boolean;
  minimumSpendAmount: number;
  pointsPerPurchase: number;
  /** Reward tiers. When empty, the legacy single-coupon fields below are used. */
  couponPackages?: CouponPackage[];
  // Legacy single-coupon configuration, kept for backward compatibility.
  pointsForCoupon: number;
  couponDiscountType: 'percentage' | 'fixed';
  couponDiscountValue: number;
  couponValidityDays: number;
}

export const LEGACY_COUPON_PACKAGE_ID = "legacy-default";

/**
 * Normalise loyalty settings into a list of usable reward tiers, surfacing the
 * legacy single-coupon fields as one implicit package when none are configured.
 * Sorted ascending by cost.
 */
export function resolveCouponPackages(
  loyaltySettings?: LoyaltySettings | null,
): CouponPackage[] {
  if (!loyaltySettings) return [];

  const configured = (loyaltySettings.couponPackages || []).filter(
    (pkg) => pkg && pkg.enabled !== false && Number(pkg.pointsRequired) > 0,
  );

  if (configured.length > 0) {
    return [...configured].sort(
      (a, b) => Number(a.pointsRequired) - Number(b.pointsRequired),
    );
  }

  if (Number(loyaltySettings.pointsForCoupon) > 0) {
    return [
      {
        id: LEGACY_COUPON_PACKAGE_ID,
        name: "Reward Coupon",
        pointsRequired: Number(loyaltySettings.pointsForCoupon),
        discountType: loyaltySettings.couponDiscountType || "percentage",
        discountValue: Number(loyaltySettings.couponDiscountValue) || 0,
        validityDays: Number(loyaltySettings.couponValidityDays) || 30,
        enabled: true,
      },
    ];
  }

  return [];
}

/**
 * Pick the reward tier a purchase just unlocked. When several tiers are crossed
 * at once the most valuable one wins, so bigger milestones reward more.
 */
export function selectEarnedCouponPackage(
  packages: CouponPackage[],
  oldPoints: number,
  newPoints: number,
): { pkg: CouponPackage; times: number } | null {
  let best: { pkg: CouponPackage; times: number } | null = null;

  for (const pkg of packages) {
    const cost = Number(pkg.pointsRequired);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const times = Math.floor(newPoints / cost) - Math.floor(oldPoints / cost);
    if (times <= 0) continue;

    if (!best || cost > Number(best.pkg.pointsRequired)) {
      best = { pkg, times };
    }
  }

  return best;
}

/**
 * Points already promised to coupons the customer is holding.
 *
 * A coupon's cost is only deducted when it is used, so an unused coupon has a
 * claim on the balance. Counting that claim keeps a customer from redeeming more
 * coupon value than they have points to pay for.
 */
export function getReservedPoints(coupons: LoyaltyCoupon[]): number {
  const now = Date.now();

  return coupons
    .filter((coupon) => {
      if (coupon.status !== "active") return false;

      // An expired coupon can never be used, so it holds no claim on points.
      // Accepts both Firestore Timestamps and already-converted dates.
      const raw = coupon.expiresAt as unknown;
      const expiresAt =
        raw && typeof (raw as { toDate?: () => Date }).toDate === "function"
          ? (raw as { toDate: () => Date }).toDate()
          : new Date(raw as string | number | Date);

      // Unparseable dates stay reserved rather than freeing points wrongly.
      return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() > now;
    })
    .reduce((sum, coupon) => sum + Number(coupon.pointsCost || 0), 0);
}

/** A reward tier plus whether the customer can redeem it right now. */
export interface CouponPackageAvailability extends CouponPackage {
  affordable: boolean;
  pointsShort: number;
}

/**
 * Every configured tier, annotated against the customer's spendable points.
 */
export function getPackageAvailability(
  packages: CouponPackage[],
  availablePoints: number,
): CouponPackageAvailability[] {
  return packages.map((pkg) => {
    const cost = Number(pkg.pointsRequired);
    return {
      ...pkg,
      affordable: availablePoints >= cost,
      pointsShort: Math.max(0, cost - availablePoints),
    };
  });
}

/** Points still needed before the soonest coupon across all tiers. */
export function getPointsUntilNextCoupon(
  packages: CouponPackage[],
  currentPoints: number,
): number {
  let soonest: number | null = null;

  for (const pkg of packages) {
    const cost = Number(pkg.pointsRequired);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    const remaining = cost - (currentPoints % cost);
    if (soonest === null || remaining < soonest) {
      soonest = remaining;
    }
  }

  return soonest ?? 0;
}

export interface AwardPointsParams {
  customerId: string;
  transactionId: string;
  transactionAmount: number;
  source: 'pos' | 'online';
  description?: string;
}

export class LoyaltyService {
  /**
   * Get loyalty settings
   */
  static async getLoyaltySettings(): Promise<LoyaltySettings | null> {
    if (!adminDb) return null;

    try {
      const settingsDoc = await adminDb
        .collection(SETTINGS_COLLECTION)
        .doc("main")
        .get();

      if (!settingsDoc.exists) return null;

      const data = settingsDoc.data();
      return data?.loyaltySettings || null;
    } catch (error) {
      console.error("Error fetching loyalty settings:", error);
      return null;
    }
  }

  /**
   * Check if loyalty program is enabled
   */
  static async isLoyaltyEnabled(): Promise<boolean> {
    const settings = await this.getLoyaltySettings();
    return settings?.enabled ?? false;
  }

  /**
   * Generate a unique coupon code
   */
  private static generateCouponCode(): string {
    const prefix = "LOYAL";
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomPart}`;
  }

  /**
   * Create a new loyalty coupon from a reward package.
   *
   * The package's cost and identity are copied onto the coupon so using it later
   * deducts exactly what it cost, even if the owner edits the package after.
   */
  private static createCoupon(pkg: CouponPackage): LoyaltyCoupon {
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(pkg.validityDays || 30));

    return {
      id: `coupon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      code: this.generateCouponCode(),
      discountType: pkg.discountType,
      discountValue: Number(pkg.discountValue),
      pointsCost: Number(pkg.pointsRequired),
      packageId: pkg.id,
      packageName: pkg.name,
      issuedAt: now,
      expiresAt: expiresAt,
      status: 'active',
    };
  }

  /**
   * Check if transaction amount qualifies for points
   */
  static doesQualifyForPoints(
    transactionAmount: number,
    loyaltySettings: LoyaltySettings
  ): boolean {
    return transactionAmount >= loyaltySettings.minimumSpendAmount;
  }

  /**
   * Award loyalty points to a customer for a purchase
   */
  static async awardPoints(params: AwardPointsParams): Promise<{
    success: boolean;
    pointsAwarded: number;
    newTotalPoints: number;
    couponsGenerated: LoyaltyCoupon[];
    message?: string;
    error?: string;
  }> {
    if (!adminDb) {
      return {
        success: false,
        pointsAwarded: 0,
        newTotalPoints: 0,
        couponsGenerated: [],
        error: "Firebase Admin is not configured",
      };
    }

    try {
      // Check if loyalty is enabled
      const loyaltySettings = await this.getLoyaltySettings();
      if (!loyaltySettings || !loyaltySettings.enabled) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotalPoints: 0,
          couponsGenerated: [],
          message: "Loyalty program is not enabled",
        };
      }

      // Check if transaction qualifies for points
      if (!this.doesQualifyForPoints(params.transactionAmount, loyaltySettings)) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotalPoints: 0,
          couponsGenerated: [],
          message: `Transaction amount must be at least ${loyaltySettings.minimumSpendAmount} to earn points`,
        };
      }

      const customerRef = adminDb.collection(CUSTOMERS_COLLECTION).doc(params.customerId);
      const customerDoc = await customerRef.get();

      if (!customerDoc.exists) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotalPoints: 0,
          couponsGenerated: [],
          error: "Customer not found",
        };
      }

      const customerData = customerDoc.data();
      const currentPoints = customerData?.loyaltyPoints || 0;
      const pointsToAward = loyaltySettings.pointsPerPurchase;

      // Create points history entry
      const pointsHistory: LoyaltyPointsHistory = {
        id: `points_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        pointsEarned: pointsToAward,
        transactionId: params.transactionId,
        transactionAmount: params.transactionAmount,
        earnedAt: new Date(),
        source: params.source,
        description: params.description || `Earned ${pointsToAward} point(s) from purchase`,
      };

      // Calculate new total points
      const newTotalPoints = currentPoints + pointsToAward;

      // Coupons are no longer auto-issued. The customer chooses which reward
      // package to redeem from their membership page, so a purchase only adds
      // points. Auto-issuing would reserve those points against a tier the
      // customer never picked, leaving nothing to redeem with.
      const couponsToGenerate: LoyaltyCoupon[] = [];

      // Update customer document
      const updateData: any = {
        loyaltyPoints: FieldValue.increment(pointsToAward),
        totalPointsEarned: FieldValue.increment(pointsToAward),
        pointsHistory: FieldValue.arrayUnion(pointsHistory),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Add coupons if any were generated
      if (couponsToGenerate.length > 0) {
        updateData.coupons = FieldValue.arrayUnion(...couponsToGenerate);
        updateData.activeCouponsCount = FieldValue.increment(couponsToGenerate.length);
      }

      await customerRef.update(updateData);

      return {
        success: true,
        pointsAwarded: pointsToAward,
        newTotalPoints,
        couponsGenerated: couponsToGenerate,
        message: `Successfully awarded ${pointsToAward} point(s)${couponsToGenerate.length > 0 ? ` and ${couponsToGenerate.length} coupon(s)` : ''}`,
      };
    } catch (error) {
      console.error("Error awarding loyalty points:", error);
      return {
        success: false,
        pointsAwarded: 0,
        newTotalPoints: 0,
        couponsGenerated: [],
        error: error instanceof Error ? error.message : "Failed to award loyalty points",
      };
    }
  }

  /**
   * Get customer's active coupons
   */
  static async getActiveCoupons(customerId: string): Promise<LoyaltyCoupon[]> {
    if (!adminDb) {
      return [];
    }

    try {
      const customerRef = adminDb.collection(CUSTOMERS_COLLECTION).doc(customerId);
      const customerDoc = await customerRef.get();

      if (!customerDoc.exists) {
        return [];
      }

      const customerData = customerDoc.data();
      const coupons = customerData?.coupons || [];
      const now = new Date();

      // Filter for active coupons that haven't expired
      return coupons
        .map((coupon: any) => ({
          ...coupon,
          issuedAt: coupon.issuedAt?.toDate?.() || new Date(coupon.issuedAt),
          expiresAt: coupon.expiresAt?.toDate?.() || new Date(coupon.expiresAt),
          usedAt: coupon.usedAt?.toDate?.() || (coupon.usedAt ? new Date(coupon.usedAt) : undefined),
        }))
        .filter((coupon: LoyaltyCoupon) => {
          return coupon.status === 'active' && new Date(coupon.expiresAt) > now;
        });
    } catch (error) {
      console.error("Error fetching active coupons:", error);
      return [];
    }
  }

  /**
   * Get customer's loyalty points summary
   */
  static async getLoyaltySummary(customerId: string): Promise<{
    success: boolean;
    data?: {
      isMember: boolean;
      memberId?: string;
      memberSince?: Date;
      currentPoints: number;
      totalPointsEarned: number;
      activeCoupons: LoyaltyCoupon[];
      pointsHistory: LoyaltyPointsHistory[];
      pointsUntilNextCoupon: number;
      couponPackages: CouponPackageAvailability[];
      /** Points already claimed by unused coupons. */
      reservedPoints: number;
      /** Points free to redeem another package with. */
      availablePoints: number;
    };
    error?: string;
  }> {
    if (!adminDb) {
      return {
        success: false,
        error: "Firebase Admin is not configured",
      };
    }

    try {
      const customerRef = adminDb.collection(CUSTOMERS_COLLECTION).doc(customerId);
      const customerDoc = await customerRef.get();

      if (!customerDoc.exists) {
        return {
          success: false,
          error: "Customer not found",
        };
      }

      const loyaltySettings = await this.getLoyaltySettings();
      const customerData = customerDoc.data();
      
      // Check if customer is a member
      const isMember = customerData?.isMember || false;
      const memberId = customerData?.memberId;
      const memberSince = customerData?.memberSince?.toDate?.() || customerData?.memberSince;
      
      const currentPoints = customerData?.loyaltyPoints || 0;
      const totalPointsEarned = customerData?.totalPointsEarned || 0;
      const pointsHistory = (customerData?.pointsHistory || []).map((ph: any) => ({
        ...ph,
        earnedAt: ph.earnedAt?.toDate?.() || new Date(ph.earnedAt),
      }));

      const activeCoupons = await this.getActiveCoupons(customerId);

      // Points until the soonest coupon across all reward tiers
      const couponPackages = resolveCouponPackages(loyaltySettings);
      const pointsUntilNextCoupon = getPointsUntilNextCoupon(
        couponPackages,
        currentPoints,
      );

      // Unused coupons still owe their points, so only the remainder can fund a
      // new redemption.
      const reservedPoints = getReservedPoints(activeCoupons);
      const availablePoints = Math.max(0, currentPoints - reservedPoints);

      return {
        success: true,
        data: {
          isMember,
          memberId,
          memberSince,
          currentPoints,
          totalPointsEarned,
          activeCoupons,
          pointsHistory: pointsHistory.sort((a: any, b: any) => 
            new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime()
          ),
          pointsUntilNextCoupon,
          couponPackages: getPackageAvailability(couponPackages, availablePoints),
          reservedPoints,
          availablePoints,
        },
      };
    } catch (error) {
      console.error("Error fetching loyalty summary:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch loyalty summary",
      };
    }
  }

  /**
   * Redeem a reward package into a coupon the customer can use at checkout.
   *
   * Points are not taken here: they are deducted when the coupon is actually
   * used. To keep that honest, redemption is only allowed while the customer has
   * enough *unreserved* points to cover this tier on top of any coupons they are
   * already holding.
   */
  static async redeemPackage(params: {
    customerId: string;
    packageId: string;
  }): Promise<{
    success: boolean;
    coupon?: LoyaltyCoupon;
    error?: string;
  }> {
    if (!adminDb) {
      return { success: false, error: "Firebase Admin is not configured" };
    }

    try {
      const loyaltySettings = await this.getLoyaltySettings();
      if (!loyaltySettings || !loyaltySettings.enabled) {
        return { success: false, error: "Loyalty program is not enabled" };
      }

      const pkg = resolveCouponPackages(loyaltySettings).find(
        (candidate) => candidate.id === params.packageId,
      );

      if (!pkg) {
        return { success: false, error: "Reward package not found" };
      }

      const customerRef = adminDb
        .collection(CUSTOMERS_COLLECTION)
        .doc(params.customerId);

      const coupon = this.createCoupon(pkg);

      // Read and write in one transaction so two rapid redemptions cannot both
      // pass the affordability check.
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(customerRef);
        if (!snap.exists) {
          throw new Error("Customer not found");
        }

        const data = snap.data() || {};
        const coupons = (data.coupons || []) as LoyaltyCoupon[];
        const currentPoints = Number(data.loyaltyPoints || 0);
        const reserved = getReservedPoints(coupons);
        const available = currentPoints - reserved;
        const cost = Number(pkg.pointsRequired);

        if (available < cost) {
          throw new Error(
            `Not enough points. This reward needs ${cost} and you have ${Math.max(0, available)} available` +
              (reserved > 0
                ? ` (${reserved} reserved by coupons you already hold).`
                : "."),
          );
        }

        tx.update(customerRef, {
          coupons: [...coupons, coupon],
          activeCouponsCount:
            coupons.filter((c) => c.status === "active").length + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return { success: true, coupon };
    } catch (error) {
      console.error("Error redeeming reward package:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to redeem reward",
      };
    }
  }

  /**
   * Calculate discount amount from a coupon
   */
  static calculateCouponDiscount(
    coupon: LoyaltyCoupon,
    subtotal: number
  ): number {
    if (coupon.discountType === 'percentage') {
      return Math.round((subtotal * coupon.discountValue) / 100);
    } else {
      // Fixed discount
      return Math.min(coupon.discountValue, subtotal);
    }
  }
}
