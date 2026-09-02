import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase-admin/firestore";

export interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  status: "active" | "used" | "expired";
  inUse?: boolean;
  expiresAt: any;
}

/** `db` is nullable when Firebase env vars are absent; fail loudly instead. */
function requireDb() {
  if (!db) {
    throw new Error("Firestore is not configured");
  }
  return db;
}

export class CouponService {
  /**
   * Get the customer's active (in-use) coupon
   */
  static async getActiveCoupon(customerId: string): Promise<Coupon | null> {
    try {
      const customerRef = doc(requireDb(), "customers", customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) {
        return null;
      }

      const customerData = customerSnap.data();
      const coupons = customerData.coupons || [];

      // Find the "in use" coupon
      const activeCoupon = coupons.find(
        (c: any) => c.inUse === true && c.status === "active"
      );

      if (!activeCoupon) {
        return null;
      }

      // Check if expired
      const now = new Date();
      const expiresAt = activeCoupon.expiresAt?.toDate
        ? activeCoupon.expiresAt.toDate()
        : new Date(activeCoupon.expiresAt);

      if (expiresAt < now) {
        return null;
      }

      return activeCoupon;
    } catch (error) {
      console.error("Error getting active coupon:", error);
      return null;
    }
  }

  /**
   * Get the coupons a customer owns that are still usable but have not been
   * activated yet, so checkout can offer them instead of forcing a detour to
   * the membership page.
   */
  static async getAvailableCoupons(customerId: string): Promise<Coupon[]> {
    try {
      const customerSnap = await getDoc(doc(requireDb(), "customers", customerId));
      if (!customerSnap.exists()) return [];

      const coupons = (customerSnap.data().coupons || []) as Coupon[];
      const now = new Date();

      return coupons.filter((c) => {
        if (c.status !== "active" || c.inUse === true) return false;

        const expiresAt = c.expiresAt?.toDate
          ? c.expiresAt.toDate()
          : new Date(c.expiresAt);

        return !(expiresAt < now);
      });
    } catch (error) {
      console.error("Error getting available coupons:", error);
      return [];
    }
  }

  /**
   * Calculate discount amount based on coupon
   */
  static calculateDiscount(
    totalAmount: number,
    coupon: Coupon
  ): { discountAmount: number; finalAmount: number } {
    let discountAmount = 0;

    if (coupon.discountType === "percentage") {
      discountAmount = (totalAmount * coupon.discountValue) / 100;
    } else if (coupon.discountType === "fixed") {
      discountAmount = Math.min(coupon.discountValue, totalAmount);
    }

    const finalAmount = Math.max(totalAmount - discountAmount, 0);

    return {
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100,
    };
  }

  /**
   * Mark coupon as used after successful checkout (Admin SDK version for API routes)
   * This will deduct the points that were used to generate the coupon
   */
  static async useCouponAdmin(
    adminDb: Firestore,
    customerId: string,
    couponId: string,
    transactionId: string
  ): Promise<boolean> {
    try {
      // Fallback cost lookup for coupons issued before pointsCost was recorded.
      // Never fall back to a hardcoded guess: an over-deduction silently steals
      // points from the customer.
      let loyaltySettings:
        | {
            pointsForCoupon?: number;
            couponPackages?: Array<{ id?: string; pointsRequired?: number }>;
          }
        | undefined;
      try {
        const settingsSnap = await adminDb
          .collection("business_settings")
          .doc("main")
          .get();
        loyaltySettings = settingsSnap.data()?.loyaltySettings;
      } catch {
        // Fall through; handled below.
      }

      /**
       * Resolve what a coupon cost, preferring the value stamped on it, then the
       * package that issued it, then the legacy global setting.
       */
      const resolvePointsCost = (coupon: {
        pointsCost?: unknown;
        packageId?: unknown;
      }): number => {
        if (typeof coupon.pointsCost === "number") {
          return coupon.pointsCost;
        }

        if (typeof coupon.packageId === "string") {
          const pkg = (loyaltySettings?.couponPackages || []).find(
            (p) => p?.id === coupon.packageId,
          );
          if (pkg && typeof pkg.pointsRequired === "number") {
            return pkg.pointsRequired;
          }
        }

        return typeof loyaltySettings?.pointsForCoupon === "number"
          ? loyaltySettings.pointsForCoupon
          : 0;
      };

      const customerRef = adminDb.collection("customers").doc(customerId);

      // A transaction keeps the read-modify-write of both the coupons array and
      // the points balance atomic, so a concurrent points award cannot clobber
      // it (and vice versa).
      const result = await adminDb.runTransaction(async (tx) => {
        const customerSnap = await tx.get(customerRef);
        if (!customerSnap.exists) {
          throw new Error("Customer not found");
        }

        const customerData = customerSnap.data();
        if (!customerData) {
          throw new Error("Customer data is empty");
        }

        const coupons = [...(customerData.coupons || [])];
        const couponIndex = coupons.findIndex((c: any) => c.id === couponId);

        if (couponIndex === -1) {
          throw new Error("Coupon not found");
        }

        const coupon = coupons[couponIndex];

        // Idempotency guard: a webhook retry or a duplicate call must not
        // deduct the points a second time.
        if (coupon.status === "used") {
          return {
            alreadyUsed: true,
            pointsCost: 0,
            newPoints: Number(customerData.loyaltyPoints || 0),
          };
        }

        const pointsCost = resolvePointsCost(coupon);

        coupons[couponIndex] = {
          ...coupon,
          status: "used",
          usedAt: new Date(),
          usedInTransaction: transactionId,
          inUse: false,
        };

        const currentPoints = Number(customerData.loyaltyPoints || 0);
        const newPoints = Math.max(0, currentPoints - pointsCost);

        const activeCouponsCount = coupons.filter(
          (c: any) => c.status === "active"
        ).length;

        tx.update(customerRef, {
          coupons,
          activeCouponsCount,
          loyaltyPoints: newPoints,
          updatedAt: new Date(),
        });

        return { alreadyUsed: false, pointsCost, newPoints };
      });

      if (result.alreadyUsed) {
        console.log(
          `Coupon ${couponId} was already used; skipped points deduction.`
        );
      } else {
        console.log(
          `Coupon used: Deducted ${result.pointsCost} points. New balance: ${result.newPoints}`
        );
      }

      return true;
    } catch (error) {
      console.error("Error marking coupon as used (admin):", error);
      return false;
    }
  }

  /**
   * Mark coupon as used after successful checkout
   * This will deduct the points that were used to generate the coupon
   */
  static async useCoupon(
    customerId: string,
    couponId: string,
    transactionId: string
  ): Promise<boolean> {
    try {
      const customerRef = doc(requireDb(), "customers", customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) {
        throw new Error("Customer not found");
      }

      const customerData = customerSnap.data();
      const coupons = customerData.coupons || [];
      const currentPoints = customerData.loyaltyPoints || 0;

      // Find and update the coupon
      const couponIndex = coupons.findIndex((c: any) => c.id === couponId);

      if (couponIndex === -1) {
        throw new Error("Coupon not found");
      }

      const coupon = coupons[couponIndex];

      // Idempotency guard: never deduct points twice for the same coupon.
      if (coupon.status === "used") {
        console.log(`Coupon ${couponId} was already used; no points deducted.`);
        return true;
      }

      // Points this coupon cost. Coupons issued before pointsCost existed
      // deduct nothing rather than an invented amount.
      const pointsCost =
        typeof coupon.pointsCost === "number" ? coupon.pointsCost : 0;

      // Mark as used
      coupons[couponIndex] = {
        ...coupon,
        status: "used",
        usedAt: new Date(),
        usedInTransaction: transactionId,
        inUse: false,
      };

      // Deduct the points that were used to generate this coupon
      const newPoints = Math.max(0, currentPoints - pointsCost);

      // Update active coupons count
      const activeCouponsCount = coupons.filter(
        (c: any) => c.status === "active"
      ).length;

      await updateDoc(customerRef, {
        coupons,
        activeCouponsCount,
        loyaltyPoints: newPoints, // Deduct points
        updatedAt: new Date(),
      });

      console.log(`Coupon used: Deducted ${pointsCost} points. New balance: ${newPoints}`);

      return true;
    } catch (error) {
      console.error("Error marking coupon as used:", error);
      return false;
    }
  }

  /**
   * Release a coupon (remove "in use" flag) if checkout fails or is cancelled
   */
  static async releaseCoupon(
    customerId: string,
    couponId: string
  ): Promise<boolean> {
    try {
      const customerRef = doc(requireDb(), "customers", customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) {
        return false;
      }

      const customerData = customerSnap.data();
      const coupons = customerData.coupons || [];

      // Find and update the coupon
      const couponIndex = coupons.findIndex((c: any) => c.id === couponId);

      if (couponIndex === -1) {
        return false;
      }

      // Remove "in use" flag
      delete coupons[couponIndex].inUse;
      delete coupons[couponIndex].markedForUseAt;

      await updateDoc(customerRef, {
        coupons,
        updatedAt: new Date(),
      });

      return true;
    } catch (error) {
      console.error("Error releasing coupon:", error);
      return false;
    }
  }
}
