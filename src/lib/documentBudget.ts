/**
 * Guards against exceeding Firestore's 1 MiB per-document limit.
 *
 * Cancellation and refund requests embed base64 images on the transaction
 * document, and a single order can accumulate both (a cancellation request
 * pre-delivery, then a return request later). Checking only the incoming
 * payload is therefore not enough — what is already stored has to be counted
 * too, otherwise the write fails inside the SDK with the unhelpful
 * "contains an invalid nested entity".
 */

/**
 * Ceiling used for the projected document size.
 *
 * Firestore's hard limit is 1,048,576 bytes. JSON length is a close but not
 * exact stand-in for Firestore's internal encoding, so this leaves ~124 KB of
 * headroom rather than sitting on the boundary.
 */
export const FIRESTORE_DOC_SAFE_BYTES = 900 * 1024;

function jsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    // Circular or otherwise unserialisable: treat as too big rather than
    // letting it through.
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Approximate size of `existing` once `field` is replaced by `nextValue`.
 *
 * The field being overwritten is excluded from the existing total, since the new
 * value replaces rather than adds to it.
 */
export function projectedDocBytes(
  existing: Record<string, unknown> | undefined,
  field: string,
  nextValue: unknown,
): number {
  const rest: Record<string, unknown> = { ...(existing || {}) };
  delete rest[field];
  return jsonByteLength(rest) + jsonByteLength(nextValue);
}

/**
 * True when writing `nextValue` to `field` would risk the document limit.
 */
export function exceedsDocBudget(
  existing: Record<string, unknown> | undefined,
  field: string,
  nextValue: unknown,
): boolean {
  return (
    projectedDocBytes(existing, field, nextValue) > FIRESTORE_DOC_SAFE_BYTES
  );
}
