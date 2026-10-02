import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison for shared secrets (webhook tokens and the like).
 *
 * Fails closed: an empty or missing value on either side is never a match, so
 * an unset environment variable cannot be "matched" by an absent header.
 * `timingSafeEqual` needs equal-length buffers, so a length mismatch returns
 * false up front; that reveals only the length, not the content.
 */
export function safeEqual(
  supplied: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!supplied || !expected) return false;

  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
