/**
 * In-memory sliding-window rate limiter.
 *
 * PER SERVER INSTANCE. State lives in this process's memory, so:
 * - on a single `next start` server the limit is exact;
 * - on a horizontally scaled or serverless deployment every instance counts
 *   separately, so a caller spread across N instances can get up to N times
 *   the limit, and a cold start begins with an empty window.
 * A shared store (Redis, Firestore counters, the platform's own rate limiting)
 * is needed for a hard global limit. This is a cheap first line of defence.
 *
 * Each key keeps the timestamps of its accepted requests inside the window.
 * Rejected requests are not recorded, so a client that backs off recovers as
 * soon as its oldest request leaves the window. Idle keys are pruned once per
 * window, and at most `maxKeys` keys are tracked (least recently used evicted
 * first) so the map cannot be grown without bound.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests still allowed in the current window after this one. */
  remaining: number;
  /** Whole seconds until another request would be accepted; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  /** Number of keys currently tracked (for tests and diagnostics). */
  size(): number;
  reset(): void;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1, options.windowMs);
  const maxKeys = Math.max(1, options.maxKeys ?? 10_000);
  const hits = new Map<string, number[]>();
  let lastPrunedAt = 0;

  function prune(now: number) {
    const cutoff = now - windowMs;
    for (const [key, stamps] of hits) {
      const live = stamps.filter((t) => t > cutoff);
      if (live.length === 0) hits.delete(key);
      else if (live.length !== stamps.length) hits.set(key, live);
    }
    lastPrunedAt = now;
  }

  return {
    check(key, now = Date.now()) {
      if (now - lastPrunedAt >= windowMs) prune(now);

      const cutoff = now - windowMs;
      const stamps = (hits.get(key) || []).filter((t) => t > cutoff);

      if (stamps.length >= limit) {
        hits.set(key, stamps);
        const retryAfterMs = stamps[0] + windowMs - now;
        return {
          allowed: false,
          limit,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      stamps.push(now);
      // Re-insert so iteration order tracks recency for eviction.
      hits.delete(key);
      hits.set(key, stamps);

      while (hits.size > maxKeys) {
        const oldest = hits.keys().next();
        if (oldest.done) break;
        hits.delete(oldest.value);
      }

      return {
        allowed: true,
        limit,
        remaining: limit - stamps.length,
        retryAfterSeconds: 0,
      };
    },

    size() {
      return hits.size;
    },

    reset() {
      hits.clear();
      lastPrunedAt = 0;
    },
  };
}

/**
 * Best-effort client IP: the first `x-forwarded-for` entry, then `x-real-ip`.
 *
 * Only as trustworthy as the proxy in front of the app. Platforms such as
 * Vercel set these headers themselves; a bare `next start` exposed directly to
 * the internet lets the client choose them. Returns null when neither is set.
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);

  return null;
}
