"use client";

/**
 * The "-25%" flag shown in the corner of a product image.
 *
 * Shared by the product grid, the recommendations strip and the product detail
 * page so a discount is advertised identically wherever a product appears.
 *
 * Renders nothing at 0%, which lets callers pass the percentage straight through
 * without guarding first.
 */
export default function SaleBadge({
  percent,
  promotionName,
  className = "",
}: {
  percent: number;
  /** Shown on hover, so a shopper can see which promotion is responsible. */
  promotionName?: string;
  /** Position/override classes; defaults to the image's top-right corner. */
  className?: string;
}) {
  if (!percent || percent <= 0) return null;

  return (
    <span
      title={promotionName || undefined}
      aria-label={`${percent}% off`}
      className={`pointer-events-none absolute top-2 right-2 z-10 rounded-full bg-gradient-to-r from-rose-600 to-pink-600 px-2 py-1 text-[10px] font-bold leading-none text-white shadow-md ${className}`}
    >
      -{percent}%
    </span>
  );
}
