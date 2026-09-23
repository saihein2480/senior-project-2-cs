import type { SyntheticEvent } from "react";

/**
 * Product image resolution with automatic failover.
 *
 * Three separate problems this solves:
 *
 *  1. A handful of catalogue records point at R2 objects that no longer exist,
 *     so the URL is a perfectly valid non-empty string that returns 404.
 *  2. A plain `a || b || c` chain cannot help with that: it stops at the first
 *     non-empty string, which may be the dead one, and never reaches the URL
 *     that would have worked.
 *  3. The previous fallbacks were themselves dead — `via.placeholder.com` is
 *     unreachable and `/fallback.png` is not in `public/`.
 *
 * So instead of picking one URL we build an ordered candidate list and let the
 * browser walk it: each `onError` advances to the next candidate, and only when
 * every candidate has failed do we show the inline placeholder.
 */

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
  <rect width="400" height="500" fill="#fdf2f8"/>
  <g fill="none" stroke="#f9a8d4" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
    <path d="M150 170 L120 185 L105 260 L135 270 L140 350 L260 350 L265 270 L295 260 L280 185 L250 170"/>
    <path d="M150 170 Q200 215 250 170"/>
  </g>
  <circle cx="200" cy="400" r="4" fill="#f9a8d4"/>
</svg>`;

/** Inline placeholder: cannot 404, needs no network, works offline. */
export const PRODUCT_IMAGE_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  FALLBACK_SVG,
)}`;

/** Attribute holding the remaining candidates for a given <img>. */
const CANDIDATES_ATTR = "data-img-candidates";

type ImageBearingProduct = {
  groupImage?: string;
  image?: string;
  colorVariants?: Array<{ id?: string; image?: string }>;
};

/**
 * Every URL worth trying for a product, best first.
 *
 * `preferredUrl` is for callers that have already resolved a specific colour
 * variant the shopper picked; it goes first so an explicit choice wins.
 *
 * Note `Product.image` is itself derived as
 * `colorVariants[0].image || image || groupImage` by the Firestore mapper, which
 * is exactly why `groupImage` is tried before it — when a variant photo is the
 * broken one, the group shot is usually intact.
 */
export function productImageCandidates(
  product: ImageBearingProduct,
  preferredUrl?: string,
): string[] {
  const raw = [
    preferredUrl,
    product.groupImage,
    product.image,
    ...(product.colorVariants || []).map((variant) => variant?.image),
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];
  raw.forEach((url) => {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  });

  return candidates;
}

/** First candidate, or the placeholder when a product has no image at all. */
export function productImageSrc(
  product: ImageBearingProduct,
  preferredUrl?: string,
): string {
  return productImageCandidates(product, preferredUrl)[0] || PRODUCT_IMAGE_FALLBACK;
}

/**
 * Advance to the next candidate when the current one fails, ending at the
 * inline placeholder.
 *
 * Reads and rewrites the remaining list on the element itself, so the component
 * needs no per-image state.
 */
export function handleProductImageError(
  event: SyntheticEvent<HTMLImageElement>,
) {
  const img = event.currentTarget;

  let remaining: string[] = [];
  try {
    remaining = JSON.parse(img.getAttribute(CANDIDATES_ATTR) || "[]");
  } catch {
    remaining = [];
  }

  const next = Array.isArray(remaining) ? remaining.shift() : undefined;

  if (next) {
    img.setAttribute(CANDIDATES_ATTR, JSON.stringify(remaining));
    img.src = next;
    return;
  }

  // Nothing left to try. Clear the attribute so a failing placeholder cannot
  // re-enter this handler forever.
  img.removeAttribute(CANDIDATES_ATTR);
  if (img.src !== PRODUCT_IMAGE_FALLBACK) {
    img.src = PRODUCT_IMAGE_FALLBACK;
  }
}

/**
 * Spread onto an `<img>` to get failover for free:
 *
 *   <img {...productImageProps(product)} alt={product.name} className="..." />
 */
export function productImageProps(
  product: ImageBearingProduct,
  preferredUrl?: string,
) {
  const [first, ...rest] = productImageCandidates(product, preferredUrl);

  return {
    src: first || PRODUCT_IMAGE_FALLBACK,
    [CANDIDATES_ATTR]: JSON.stringify(rest),
    onError: handleProductImageError,
  };
}
