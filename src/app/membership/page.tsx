"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import Link from "next/link";

type CouponTier = {
  id: string;
  name: string;
  pointsRequired: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  validityDays: number;
};

/** A reward package annotated by the summary API with affordability. */
type AvailablePackage = CouponTier & {
  affordable: boolean;
  pointsShort: number;
};

/** Loosely typed shape of what /api/loyalty/settings returns. */
type RawLoyaltySettings = {
  couponPackages?: Array<Partial<CouponTier> & { enabled?: boolean }>;
  pointsForCoupon?: number;
  couponDiscountType?: "percentage" | "fixed";
  couponDiscountValue?: number;
  couponValidityDays?: number;
} | null;

/**
 * Reward tiers to display, cheapest first. Owners who only configured the older
 * single-coupon fields still get one tier so the page never looks empty.
 */
function resolveCouponTiers(
  loyaltySettings: RawLoyaltySettings,
): CouponTier[] {
  if (!loyaltySettings) return [];

  const configured = (loyaltySettings.couponPackages || [])
    .filter((pkg) => pkg && pkg.enabled !== false && Number(pkg.pointsRequired) > 0)
    .map((pkg, index) => ({
      id: pkg.id || `tier-${index}`,
      name: pkg.name || `Reward ${index + 1}`,
      pointsRequired: Number(pkg.pointsRequired),
      discountType: pkg.discountType || "percentage",
      discountValue: Number(pkg.discountValue) || 0,
      validityDays: Number(pkg.validityDays) || 30,
    }));

  if (configured.length > 0) {
    return configured.sort((a, b) => a.pointsRequired - b.pointsRequired);
  }

  if (Number(loyaltySettings.pointsForCoupon) > 0) {
    return [
      {
        id: "legacy-default",
        name: "Reward Coupon",
        pointsRequired: Number(loyaltySettings.pointsForCoupon),
        discountType: loyaltySettings.couponDiscountType || "percentage",
        discountValue: Number(loyaltySettings.couponDiscountValue) || 0,
        validityDays: Number(loyaltySettings.couponValidityDays) || 30,
      },
    ];
  }

  return [];
}

function formatTierDiscount(tier: CouponTier): string {
  return tier.discountType === "percentage"
    ? `${tier.discountValue}% off`
    : `฿${tier.discountValue} off`;
}

export default function MembershipPage() {
  const router = useRouter();
  const { user, loading } = useCustomerAuth();
  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [isLoadingLoyalty, setIsLoadingLoyalty] = useState(false);
  const [loyaltySettings, setLoyaltySettings] = useState<any>(null);
  const [isMember, setIsMember] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [usingCouponId, setUsingCouponId] = useState<string | null>(null);
  const [cancelingCouponId, setCancelingCouponId] = useState<string | null>(null);
  const [redeemingPackageId, setRedeemingPackageId] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState("");

  // Load loyalty settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/loyalty/settings");
        const data = await response.json();
        if (data.success) {
          setLoyaltySettings(data.settings);
        }
      } catch (error) {
        console.error("Error loading loyalty settings:", error);
      }
    };
    loadSettings();
  }, []);

  // Load customer loyalty data if logged in
  useEffect(() => {
    if (user) {
      loadLoyaltyData();
    }
  }, [user]);

  const loadLoyaltyData = async () => {
    if (!user) return;
    
    setIsLoadingLoyalty(true);
    try {
      const response = await fetch(`/api/loyalty/summary?customerId=${user.uid}`);
      const data = await response.json();
      if (data.success) {
        setLoyaltyData(data.data);
        setIsMember(data.data?.isMember || false);
      } else {
        // Customer exists but no loyalty data - not a member yet
        setIsMember(false);
      }
    } catch (error) {
      console.error("Error loading loyalty data:", error);
      setIsMember(false);
    } finally {
      setIsLoadingLoyalty(false);
    }
  };

  const handleJoinMembership = async () => {
    if (!user) return;

    setIsJoining(true);
    setJoinError("");
    setJoinSuccess(false);

    try {
      const response = await fetch("/api/loyalty/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId: user.uid,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setJoinSuccess(true);
        setIsMember(true);
        
        // Notify other components (like NavBar) that membership status changed
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("app:membership-updated"));
        }
        
        // Reload loyalty data to show the member dashboard
        setTimeout(() => {
          loadLoyaltyData();
        }, 1500);
      } else {
        setJoinError(data.error || "Failed to join membership program");
      }
    } catch (error) {
      console.error("Error joining membership:", error);
      setJoinError("An error occurred. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleRedeemPackage = async (packageId: string) => {
    if (!user) return;

    setRedeemingPackageId(packageId);
    setRedeemError("");

    try {
      const response = await fetch("/api/loyalty/redeem-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: user.uid, packageId }),
      });

      const data = await response.json();

      if (!data.success) {
        setRedeemError(data.error || "Failed to redeem this reward");
        return;
      }

      await loadLoyaltyData();
    } catch (error) {
      console.error("Error redeeming reward package:", error);
      setRedeemError("An error occurred. Please try again.");
    } finally {
      setRedeemingPackageId(null);
    }
  };

  const handleUseCoupon = async (couponId: string) => {
    if (!user) return;

    setUsingCouponId(couponId);

    try {
      const response = await fetch("/api/loyalty/use-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId: user.uid,
          couponId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Reload loyalty data to show updated coupon status
        await loadLoyaltyData();
        alert("Coupon activated! It will be applied at checkout.");
      } else {
        alert(data.error || "Failed to activate coupon");
      }
    } catch (error) {
      console.error("Error activating coupon:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setUsingCouponId(null);
    }
  };

  const handleCancelCoupon = async (couponId: string) => {
    if (!user) return;

    setCancelingCouponId(couponId);

    try {
      const response = await fetch(
        `/api/loyalty/use-coupon?customerId=${user.uid}&couponId=${couponId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        // Reload loyalty data to show updated coupon status
        await loadLoyaltyData();
      } else {
        alert(data.error || "Failed to cancel coupon");
      }
    } catch (error) {
      console.error("Error canceling coupon:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setCancelingCouponId(null);
    }
  };

  const couponTiers = resolveCouponTiers(loyaltySettings);

  // Cheapest package the customer cannot afford yet. Packages arrive sorted by
  // cost, so the first locked one is the nearest goal to show them.
  const nextLockedPackage: AvailablePackage | undefined = (
    loyaltyData?.couponPackages || []
  ).find((pkg: AvailablePackage) => !pkg.affordable);

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    try {
      const d = new Date(date);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  // Not logged in - Show registration/login prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-purple-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            {/* <div className="inline-block p-4 bg-gradient-to-br from-rose-500 to-purple-600 rounded-full mb-6">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div> */}
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Membership & Rewards
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Join our loyalty program to earn points with every purchase and get exclusive discount coupons!
            </p>
          </div>

          {/* Program Benefits */}
          {loyaltySettings?.enabled && (
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border-2 border-rose-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                Program Benefits
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Earn Points</h3>
                  <p className="text-sm text-gray-600">
                    Earn {loyaltySettings.pointsPerPurchase} point for every purchase over{" "}
                    {loyaltySettings.minimumSpendAmount} THB
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Get Coupons</h3>
                  <p className="text-sm text-gray-600">
                    {couponTiers.length > 1
                      ? `Reach ${couponTiers[0].pointsRequired} points for your first coupon, with ${couponTiers.length} reward tiers available`
                      : couponTiers.length === 1
                        ? `Collect ${couponTiers[0].pointsRequired} points to receive a discount coupon`
                        : "Collect points to receive discount coupons"}
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Redeem Rewards</h3>
                  <p className="text-sm text-gray-600">
                    {couponTiers.length > 0
                      ? `Use your coupons to get ${couponTiers
                          .map(formatTierDiscount)
                          .join(" or ")}`
                      : "Use your coupons for a discount on your next purchase"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Call to Action */}
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-purple-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to Start Earning Rewards?
            </h2>
            <p className="text-gray-600 mb-6">
              Create an account or log in to start collecting points and redeeming rewards today!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/auth/register"
                className="px-8 py-3 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:from-rose-600 hover:to-purple-700 transition-all shadow-md"
              >
                Register Now
              </Link>
              <Link
                href="/auth/login"
                className="px-8 py-3 border-2 border-rose-500 text-rose-600 font-semibold rounded-lg hover:bg-rose-50 transition-all"
              >
                Log In
              </Link>
            </div>
          </div>

          {/* How It Works */}
          <div className="mt-12 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-6">How It Works</h3>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  1
                </div>
                <p className="text-sm text-gray-600">Create your account with email verification</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  2
                </div>
                <p className="text-sm text-gray-600">Shop and automatically earn points</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  3
                </div>
                <p className="text-sm text-gray-600">Collect points to get discount coupons</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  4
                </div>
                <p className="text-sm text-gray-600">Redeem coupons on your next purchase</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in but not a member - Show join membership option
  if (user && !isMember && !isLoadingLoyalty) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-purple-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Success Message */}
          {joinSuccess && (
            <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
              <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-2xl font-bold text-green-800 mb-2">Welcome to Our Membership Program!</h3>
              <p className="text-green-700 mb-3">Your membership has been activated. Loading your dashboard...</p>
              <div className="inline-block bg-white border-2 border-green-300 rounded-lg px-6 py-3">
                <p className="text-sm text-gray-600 mb-1">Your Member ID:</p>
                <p className="text-xl font-mono font-bold text-rose-600">{user.uid.substring(0, 12).toUpperCase()}</p>
              </div>
            </div>
          )}

          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-block p-4 bg-gradient-to-br from-rose-500 to-purple-600 rounded-full mb-6">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Join Our Membership Program
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-2">
              Welcome back, {user.displayName || user.email}!
            </p>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              You're just one click away from earning rewards with every purchase!
            </p>
          </div>

          {/* Member Benefits */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border-2 border-rose-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Your Account is Ready!
            </h2>
            <p className="text-gray-600 text-center mb-6">
              We'll use your existing account information to create your membership profile
            </p>

            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Account Information:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium text-gray-900">{user.displayName || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-900">{user.email}</span>
                </div>
              </div>
            </div>

            {loyaltySettings?.enabled && (
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Earn Points</h3>
                  <p className="text-sm text-gray-600">
                    {loyaltySettings.pointsPerPurchase} point for every purchase over{" "}
                    ฿{loyaltySettings.minimumSpendAmount}
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Get Coupons</h3>
                  <p className="text-sm text-gray-600">
                    {couponTiers.length > 1
                      ? `Reach ${couponTiers[0].pointsRequired} points for your first coupon, with ${couponTiers.length} reward tiers available`
                      : couponTiers.length === 1
                        ? `Collect ${couponTiers[0].pointsRequired} points to receive a discount coupon`
                        : "Collect points to receive discount coupons"}
                  </p>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Redeem Rewards</h3>
                  <p className="text-sm text-gray-600">
                    {couponTiers.length > 0
                      ? `Use your coupons to get ${couponTiers
                          .map(formatTierDiscount)
                          .join(" or ")}`
                      : "Use your coupons for a discount on your next purchase"}
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {joinError && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-red-700 text-sm">{joinError}</p>
              </div>
            )}

            {/* Join Button */}
            <div className="text-center">
              <button
                onClick={handleJoinMembership}
                disabled={isJoining || joinSuccess}
                className="px-12 py-4 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-bold text-lg rounded-xl hover:from-rose-600 hover:to-purple-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoining ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Joining...
                  </span>
                ) : joinSuccess ? (
                  "✓ Joined Successfully!"
                ) : (
                  "Join Membership Program"
                )}
              </button>
              <p className="text-sm text-gray-500 mt-3">
                Free to join • Start earning points immediately
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">What Happens Next?</h3>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  1
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Account Activated</h4>
                <p className="text-sm text-gray-600">Your membership will be activated instantly with 0 points</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  2
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Shop & Earn</h4>
                <p className="text-sm text-gray-600">Make purchases and automatically earn loyalty points</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  3
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Collect Points</h4>
                <p className="text-sm text-gray-600">Reach the points threshold to receive discount coupons</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-3">
                  4
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Redeem Rewards</h4>
                <p className="text-sm text-gray-600">Use your coupons on your next purchase for instant savings</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in and is a member - Show loyalty dashboard
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header - Only show if actually a member with loyalty data */}
        {isMember && loyaltyData && (
          <div className="bg-gradient-to-r from-rose-500 to-purple-600 rounded-2xl shadow-xl p-8 mb-8 text-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">Welcome, {user.displayName || "Member"}!</h1>
                <p className="text-rose-100">Member ID: {loyaltyData.memberId || user.uid.substring(0, 12).toUpperCase()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-rose-100 mb-1">Membership Status</p>
                <span className="inline-block px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-semibold">
                  Active
                </span>
              </div>
            </div>
          </div>
        )}

        {isLoadingLoyalty ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading your rewards...</p>
          </div>
        ) : loyaltyData ? (
          <>
            {/* Points Summary */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* Total balance the customer has accumulated */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border-2 border-rose-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 font-medium">Total Points</span>
                  <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-4xl font-bold text-gray-900">{loyaltyData.currentPoints}</p>
                <p className="text-sm text-gray-500 mt-2">Your point balance</p>
              </div>

              {/* Points not already promised to a coupon the customer holds */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border-2 border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 font-medium">
                    Points for Redeem
                  </span>
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <p className="text-4xl font-bold text-purple-700">
                  {loyaltyData.availablePoints ?? loyaltyData.currentPoints}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {loyaltyData.reservedPoints > 0
                    ? `${loyaltyData.reservedPoints} reserved by your active coupon${loyaltyData.reservedPoints === 1 ? "" : "s"}`
                    : nextLockedPackage
                      ? `${nextLockedPackage.pointsShort} more for ${nextLockedPackage.name}`
                      : "Ready to redeem"}
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-6 border-2 border-green-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 font-medium">Active Coupons</span>
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <p className="text-4xl font-bold text-gray-900">{loyaltyData.activeCoupons.length}</p>
                <p className="text-sm text-gray-500 mt-2">Ready to use</p>
              </div>
            </div>

            {/* Reward packages available for the customer's points */}
            {(loyaltyData.couponPackages?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="bg-purple-50 border-b border-purple-100 px-6 py-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    Available Rewards
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Redeem with your{" "}
                    <span className="font-semibold text-purple-700">
                      {loyaltyData.availablePoints ?? loyaltyData.currentPoints}{" "}
                      redeemable point
                      {(loyaltyData.availablePoints ??
                        loyaltyData.currentPoints) === 1
                        ? ""
                        : "s"}
                    </span>
                    , then use the coupon at checkout.
                  </p>
                </div>

                {redeemError && (
                  <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{redeemError}</p>
                  </div>
                )}

                <div className="p-6 grid md:grid-cols-2 gap-4">
                  {loyaltyData.couponPackages.map((pkg: AvailablePackage) => (
                    <div
                      key={pkg.id}
                      className={`rounded-xl border p-4 flex flex-col ${
                        pkg.affordable
                          ? "border-purple-300 bg-purple-50"
                          : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-900">
                          {pkg.name}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                            pkg.affordable
                              ? "bg-purple-500 text-white"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {pkg.pointsRequired} pts
                        </span>
                      </div>

                      <p className="text-lg font-semibold text-purple-700">
                        {pkg.discountType === "percentage"
                          ? `${pkg.discountValue}% off`
                          : `฿${pkg.discountValue} off`}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Valid {pkg.validityDays} days once redeemed
                      </p>

                      <div className="mt-3 pt-3 border-t border-purple-200/60">
                        {pkg.affordable ? (
                          <button
                            onClick={() => handleRedeemPackage(pkg.id)}
                            disabled={redeemingPackageId === pkg.id}
                            className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-rose-600 text-white font-bold rounded-lg hover:from-purple-600 hover:to-rose-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {redeemingPackageId === pkg.id
                              ? "Redeeming..."
                              : "Redeem This Reward"}
                          </button>
                        ) : (
                          <p className="text-sm text-gray-500 text-center">
                            {pkg.pointsShort} more point
                            {pkg.pointsShort === 1 ? "" : "s"} needed
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Coupons */}
            {loyaltyData.activeCoupons.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="bg-green-50 border-b border-green-100 px-6 py-4">
                  <h2 className="text-xl font-bold text-gray-900">Your Active Coupons</h2>
                  <p className="text-sm text-gray-600 mt-1">Click "Use" to activate a coupon for your next purchase</p>
                </div>
                <div className="p-6 grid md:grid-cols-2 gap-4">
                  {loyaltyData.activeCoupons.map((coupon: any) => (
                    <div
                      key={coupon.id}
                      className={`border-2 border-dashed rounded-xl p-4 transition-all ${
                        coupon.inUse
                          ? "border-purple-400 bg-purple-50"
                          : "border-green-300 bg-green-50 hover:bg-green-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold text-gray-900">{coupon.code}</span>
                        <span
                          className={`px-3 py-1 text-xs font-bold rounded-full ${
                            coupon.inUse
                              ? "bg-purple-500 text-white"
                              : "bg-green-500 text-white"
                          }`}
                        >
                          {coupon.inUse ? "IN USE" : "ACTIVE"}
                        </span>
                      </div>
                      {coupon.packageName && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                          {coupon.packageName}
                        </p>
                      )}
                      <p className="text-lg font-semibold text-green-700 mb-2">
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}% OFF`
                          : `฿${coupon.discountValue} OFF`}
                      </p>
                      <p className="text-sm text-gray-600">
                        Expires: {formatDate(coupon.expiresAt)}
                      </p>
                      <p className="text-sm text-gray-600 mb-3">
                        {typeof coupon.pointsCost === "number"
                          ? `Costs ${coupon.pointsCost} point${coupon.pointsCost === 1 ? "" : "s"} when used`
                          : "Points cost not recorded"}
                      </p>
                      
                      {coupon.inUse ? (
                        <div className="space-y-2">
                          <div className="bg-purple-100 border border-purple-300 rounded-lg p-3">
                            <p className="text-xs text-purple-800 font-medium">
                              ✓ This coupon will be applied at checkout
                            </p>
                          </div>
                          <button
                            onClick={() => handleCancelCoupon(coupon.id)}
                            disabled={cancelingCouponId === coupon.id}
                            className="w-full px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            {cancelingCouponId === coupon.id ? "Canceling..." : "Cancel"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUseCoupon(coupon.id)}
                          disabled={usingCouponId === coupon.id}
                          className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {usingCouponId === coupon.id ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Activating...
                            </span>
                          ) : (
                            "Use This Coupon"
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Points History */}
            {loyaltyData.pointsHistory.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
                  <h2 className="text-xl font-bold text-gray-900">Points History</h2>
                  <p className="text-sm text-gray-600 mt-1">Track how you earned your points</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Points</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Description</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loyaltyData.pointsHistory.slice(0, 10).map((history: any) => (
                        <tr key={history.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(history.earnedAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-purple-100 text-purple-800">
                              +{history.pointsEarned}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            ฿{history.transactionAmount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {history.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Start Earning Points!</h3>
            <p className="text-gray-600 mb-6">Make your first purchase to start collecting loyalty points.</p>
            <Link
              href="/view-all"
              className="inline-block px-6 py-3 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:from-rose-600 hover:to-purple-700 transition-all"
            >
              Shop Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
