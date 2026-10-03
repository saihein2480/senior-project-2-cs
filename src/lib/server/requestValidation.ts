/**
 * Small request validators for API routes (no schema library on purpose).
 *
 * Each returns either `{ ok: true, value }` or `{ ok: false, error }`, where
 * `error` is a short message safe to return to the client with a 400.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Validated<T> => ({ ok: true, value });
const fail = <T = never>(error: string): Validated<T> => ({ ok: false, error });

export const MAX_ID_LENGTH = 128;
export const MAX_REASON_LENGTH = 1000;

/** Most item photos a refund/return request may carry (matches the purchases page). */
export const MAX_REQUEST_PHOTOS = 5;

/** Largest decoded image accepted per data URL. */
export const MAX_IMAGE_DECODED_BYTES = Math.floor(1.5 * 1024 * 1024);

const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * A document-style id: a non-empty string without "/" (which would address a
 * different Firestore path) and of bounded length.
 */
export function validateId(value: unknown, label = "id"): Validated<string> {
  if (typeof value !== "string" || !value.trim()) {
    return fail(`${label} is required`);
  }
  if (value.length > MAX_ID_LENGTH || value.includes("/")) {
    return fail(`Invalid ${label}`);
  }
  return ok(value);
}

/**
 * A transaction reference as customers' orders carry it: normally a string
 * ("TXN-0000000000042"), but legacy records may hold a number, which the
 * routes have always accepted.
 */
export function validateTransactionRef(value: unknown): Validated<string | number> {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0
      ? ok(value)
      : fail("Invalid transactionId");
  }
  return validateId(value, "transactionId");
}

/** Optional free text: absent/empty is fine, otherwise a string up to `max`. */
export function validateOptionalText(
  value: unknown,
  label: string,
  max = MAX_REASON_LENGTH,
): Validated<string | undefined> {
  if (value === undefined || value === null || value === "") return ok(undefined);
  if (typeof value !== "string") return fail(`${label} must be text`);
  if (value.length > max) {
    return fail(`${label} must be ${max} characters or fewer`);
  }
  return ok(value);
}

/**
 * Hosts an uploaded-image URL may point at: the public host of the R2 bucket
 * the system stores images in (`R2_PUBLIC_URL`, as configured for the POS), if
 * the storefront has it configured. With none configured only data URLs are
 * accepted, which is what the purchases page sends today.
 */
export function allowedImageHosts(): string[] {
  const hosts = new Set<string>();
  for (const raw of [
    process.env.R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
  ]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") hosts.add(url.hostname.toLowerCase());
    } catch {
      // Misconfigured value: ignore rather than allow anything.
    }
  }
  return Array.from(hosts);
}

const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/;

/** Bytes a base64 payload decodes to. */
function decodedBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * One uploaded image: either a base64 data URL of a JPEG, PNG or WebP no
 * larger than MAX_IMAGE_DECODED_BYTES once decoded, or an https URL on one of
 * `allowedHosts`. Anything else (other schemes, SVG, other hosts) is refused.
 */
export function validateImage(
  value: unknown,
  label: string,
  allowedHosts: readonly string[] = allowedImageHosts(),
): Validated<string> {
  if (typeof value !== "string" || !value) return fail(`${label} is missing`);

  if (value.startsWith("data:")) {
    // Checked before the pattern so an oversized string is rejected without
    // running a regex over megabytes of text.
    const maxEncodedLength =
      Math.ceil((MAX_IMAGE_DECODED_BYTES * 4) / 3) + "data:image/jpeg;base64,".length + 4;
    if (value.length > maxEncodedLength) return fail(`${label} is too large`);

    const match = DATA_URL_PATTERN.exec(value);
    if (!match || !match[2] || match[2].length % 4 !== 0) {
      return fail(`${label} must be a JPEG, PNG or WebP image`);
    }
    if (decodedBase64Bytes(match[2]) > MAX_IMAGE_DECODED_BYTES) {
      return fail(`${label} is too large`);
    }
    return ok(value);
  }

  if (value.length > MAX_IMAGE_URL_LENGTH) return fail(`${label} is not a valid image`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(`${label} is not a valid image`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  ) {
    return fail(`${label} must be an uploaded image`);
  }

  return ok(value);
}

/** Optional single image: absent or "" means none. */
export function validateOptionalImage(
  value: unknown,
  label: string,
  allowedHosts?: readonly string[],
): Validated<string | undefined> {
  if (value === undefined || value === null || value === "") return ok(undefined);
  const result = validateImage(value, label, allowedHosts);
  return result.ok ? ok(result.value) : result;
}

/** Optional list of up to MAX_REQUEST_PHOTOS images; absent means none. */
export function validateImageList(
  value: unknown,
  label: string,
  allowedHosts?: readonly string[],
): Validated<string[]> {
  if (value === undefined || value === null) return ok([]);
  if (!Array.isArray(value)) return fail(`${label} must be a list of images`);
  if (value.length > MAX_REQUEST_PHOTOS) {
    return fail(`You can attach at most ${MAX_REQUEST_PHOTOS} photos`);
  }

  const images: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const result = validateImage(value[i], `Photo ${i + 1}`, allowedHosts);
    if (!result.ok) return result;
    images.push(result.value);
  }
  return ok(images);
}
