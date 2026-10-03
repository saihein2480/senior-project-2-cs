/**
 * A small in-process TTL cache with single-flight loading.
 *
 * - A value is reused until `ttlMs` has passed since it was loaded.
 * - Concurrent misses for the same key share ONE loader call instead of each
 *   issuing their own Firestore read ("single-flight").
 * - A failed load is never cached; every waiter sees the error and the next
 *   call tries again.
 * - At most `maxEntries` keys are kept (oldest evicted first), so a caller
 *   cannot grow memory without bound by inventing keys.
 *
 * Process-local by design: on a horizontally scaled or serverless deployment
 * each instance keeps its own copy, so the worst-case staleness is still the
 * TTL but the load may run once per instance.
 */

type Entry<V> = { value: V; loadedAt: number };

export interface TtlCache<K, V> {
  /** Cached value for `key`, loading it with `load` on a miss. */
  get(key: K, load: () => Promise<V>): Promise<V>;
  /** Drop every cached value (in-flight loads are left to finish). */
  clear(): void;
}

export function createTtlCache<K, V>(options: {
  ttlMs: number;
  maxEntries?: number;
}): TtlCache<K, V> {
  const { ttlMs } = options;
  const maxEntries = Math.max(1, options.maxEntries ?? 100);
  const entries = new Map<K, Entry<V>>();
  const inFlight = new Map<K, Promise<V>>();

  function store(key: K, value: V) {
    entries.delete(key);
    entries.set(key, { value, loadedAt: Date.now() });

    // Map iteration is insertion order, so the first keys are the oldest.
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  }

  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && Date.now() - hit.loadedAt < ttlMs) {
        return Promise.resolve(hit.value);
      }

      const pending = inFlight.get(key);
      if (pending) return pending;

      // `load` runs on a microtask, so the promise is registered as in flight
      // before it can settle, even if `load` throws synchronously.
      const promise: Promise<V> = Promise.resolve()
        .then(load)
        .then((value) => {
          store(key, value);
          return value;
        })
        .finally(() => {
          if (inFlight.get(key) === promise) inFlight.delete(key);
        });

      inFlight.set(key, promise);
      return promise;
    },

    clear() {
      entries.clear();
    },
  };
}
