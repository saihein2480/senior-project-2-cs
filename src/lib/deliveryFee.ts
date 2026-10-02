/**
 * Delivery fee helpers shared by checkout (browser) and the order routes
 * (server).
 *
 * The fee is configured by the owner in POS Settings and stored as THB in
 * `business_settings/main.deliveryFee`. It is a flat charge per order: it is
 * not taxed, promotions and coupons do not reduce it, and it does not earn
 * loyalty points. 0 (or missing) means free delivery.
 *
 * Kept free of any Firebase import so client components can use it.
 */

/** Coerce a stored or submitted fee into a safe THB amount (2 decimals). */
export function normalizeDeliveryFee(value: unknown): number {
  const fee = Number(value);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  return Math.round(fee * 100) / 100;
}

/** True when two fees are the same once normalised (to the satang). */
export function isSameDeliveryFee(a: unknown, b: unknown): boolean {
  return Math.abs(normalizeDeliveryFee(a) - normalizeDeliveryFee(b)) < 0.005;
}

/** Shown when the owner changed the fee while the customer was checking out. */
export function deliveryFeeChangedMessage(currentFeeTHB: number): string {
  return currentFeeTHB > 0
    ? `The delivery fee has changed to ฿${currentFeeTHB.toFixed(2)}. Please review your order total and try again.`
    : "Delivery is now free. Please review your order total and try again.";
}
