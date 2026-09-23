/**
 * On-device signal store.
 *
 * This is the store for **guests**, who have no account document to write to,
 * and the staging area whose contents get merged into an account the first time
 * that guest signs in. Signed-in shoppers are served by `remote.ts` instead so
 * their taste follows them between devices.
 *
 * Purchase history is deliberately absent here — it already lives in Firestore
 * and is read back through the authenticated purchases API.
 */

const VIEWS_KEY = "recentlyViewed";
const SEARCHES_KEY = "searchHistory";
const MIGRATED_KEY = "signalsMerged";

/** Enough history to personalise without letting stale taste dominate. */
export const MAX_VIEWS = 20;
export const MAX_SEARCHES = 10;

/** Shortest query worth remembering; 1-2 chars match almost everything. */
export const MIN_SEARCH_LENGTH = 3;

/** Fired after a local write so open tabs can re-rank without a reload. */
export const SIGNALS_EVENT = "app:shopper-signals";

/** Bucket used for shoppers who are not signed in. */
export const GUEST_SCOPE = "guest";

export type ViewedProduct = {
  productId: string;
  name?: string;
  /** Product category. Note the catalogue keeps this in `Product.description`. */
  category?: string;
  viewedAt: number;
};

export type SearchedTerm = {
  term: string;
  searchedAt: number;
};

export type StoredSignals = {
  views: ViewedProduct[];
  searches: SearchedTerm[];
};

export const EMPTY_SIGNALS: StoredSignals = { views: [], searches: [] };

function keyFor(base: string, scope: string) {
  return `${base}:${scope}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readList<T>(key: string): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Corrupt history is not worth surfacing — treat it as empty.
    return [];
  }
}

function writeList<T>(key: string, list: T[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage blocked (private mode). Personalisation is a
    // nice-to-have, so fail silently rather than breaking the page.
  }
}

export function announceLocalChange() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(SIGNALS_EVENT));
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------- */
/* useSyncExternalStore adapters                                              */
/*                                                                            */
/* localStorage is an external store, so React should read it through          */
/* useSyncExternalStore rather than a useEffect that calls setState. That      */
/* keeps the server render and hydration consistent and avoids cascading       */
/* renders. getSnapshot must be referentially stable between changes, hence    */
/* the raw-string cache below.                                                */
/* -------------------------------------------------------------------------- */

let cacheKey: string | null = null;
let cachedSnapshot: StoredSignals = EMPTY_SIGNALS;

/** Stable empty value for the server/hydration snapshot. */
export function getEmptySignalsSnapshot(): StoredSignals {
  return EMPTY_SIGNALS;
}

export function getLocalSignalsSnapshot(
  scope: string = GUEST_SCOPE,
): StoredSignals {
  if (!canUseStorage()) return EMPTY_SIGNALS;

  let rawViews = "";
  let rawSearches = "";
  try {
    rawViews = window.localStorage.getItem(keyFor(VIEWS_KEY, scope)) || "";
    rawSearches = window.localStorage.getItem(keyFor(SEARCHES_KEY, scope)) || "";
  } catch {
    return EMPTY_SIGNALS;
  }

  const key = `${scope}\u0000${rawViews}\u0000${rawSearches}`;
  if (key === cacheKey) return cachedSnapshot;

  cacheKey = key;
  cachedSnapshot = readLocalSignals(scope);
  return cachedSnapshot;
}

export function subscribeToLocalSignals(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(SIGNALS_EVENT, onChange);
  // `storage` fires for writes from other tabs, so a product viewed in a second
  // tab still influences this one.
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(SIGNALS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Read the signals held on this device for a scope, most recent first. */
export function readLocalSignals(scope: string = GUEST_SCOPE): StoredSignals {
  return {
    views: readList<ViewedProduct>(keyFor(VIEWS_KEY, scope)),
    searches: readList<SearchedTerm>(keyFor(SEARCHES_KEY, scope)),
  };
}

export function writeLocalSignals(scope: string, signals: StoredSignals) {
  writeList(keyFor(VIEWS_KEY, scope), signals.views.slice(0, MAX_VIEWS));
  writeList(
    keyFor(SEARCHES_KEY, scope),
    signals.searches.slice(0, MAX_SEARCHES),
  );
  announceLocalChange();
}

/**
 * Add a view to a list, newest first.
 *
 * Re-viewing a product moves it to the front rather than appending a duplicate,
 * so one obsessively revisited item cannot crowd out the rest of the history.
 */
export function withView(
  views: ViewedProduct[],
  entry: ViewedProduct,
): ViewedProduct[] {
  return [entry, ...views.filter((v) => v.productId !== entry.productId)].slice(
    0,
    MAX_VIEWS,
  );
}

export function withSearch(
  searches: SearchedTerm[],
  entry: SearchedTerm,
): SearchedTerm[] {
  return [entry, ...searches.filter((s) => s.term !== entry.term)].slice(
    0,
    MAX_SEARCHES,
  );
}

/** Normalise a raw query, or null when it is too short to be a signal. */
export function normaliseSearchTerm(rawTerm: string): string | null {
  const term = String(rawTerm || "")
    .trim()
    .toLowerCase();
  return term.length >= MIN_SEARCH_LENGTH ? term : null;
}

export function recordLocalView(
  scope: string,
  product: { id: string; name?: string; category?: string },
) {
  if (!product?.id || !canUseStorage()) return;
  const current = readLocalSignals(scope);
  writeLocalSignals(scope, {
    ...current,
    views: withView(current.views, {
      productId: product.id,
      name: product.name,
      category: product.category,
      viewedAt: Date.now(),
    }),
  });
}

export function recordLocalSearch(scope: string, rawTerm: string) {
  const term = normaliseSearchTerm(rawTerm);
  if (!term || !canUseStorage()) return;
  const current = readLocalSignals(scope);
  writeLocalSignals(scope, {
    ...current,
    searches: withSearch(current.searches, { term, searchedAt: Date.now() }),
  });
}

export function clearLocalSignals(scope: string = GUEST_SCOPE) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(keyFor(VIEWS_KEY, scope));
    window.localStorage.removeItem(keyFor(SEARCHES_KEY, scope));
  } catch {
    // ignore
  }
  announceLocalChange();
}

/**
 * Combine two signal sets, keeping the most recent timestamp per item.
 *
 * Used when a guest signs in: whatever they browsed beforehand should not be
 * thrown away, but it must not overwrite richer history already on the account.
 */
export function mergeSignals(
  a: StoredSignals,
  b: StoredSignals,
): StoredSignals {
  const views = new Map<string, ViewedProduct>();
  [...a.views, ...b.views].forEach((view) => {
    const existing = views.get(view.productId);
    if (!existing || view.viewedAt > existing.viewedAt) {
      views.set(view.productId, view);
    }
  });

  const searches = new Map<string, SearchedTerm>();
  [...a.searches, ...b.searches].forEach((search) => {
    const existing = searches.get(search.term);
    if (!existing || search.searchedAt > existing.searchedAt) {
      searches.set(search.term, search);
    }
  });

  return {
    views: [...views.values()]
      .sort((x, y) => y.viewedAt - x.viewedAt)
      .slice(0, MAX_VIEWS),
    searches: [...searches.values()]
      .sort((x, y) => y.searchedAt - x.searchedAt)
      .slice(0, MAX_SEARCHES),
  };
}

export function hasAnySignal(signals: StoredSignals) {
  return signals.views.length > 0 || signals.searches.length > 0;
}

/**
 * One-shot guard so a guest's history is folded into an account only once.
 * Without it, every page load would resurrect items the shopper had cleared.
 */
export function wasMergedInto(uid: string) {
  if (!canUseStorage()) return true;
  try {
    return window.localStorage.getItem(keyFor(MIGRATED_KEY, uid)) === "1";
  } catch {
    return true;
  }
}

export function markMergedInto(uid: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(keyFor(MIGRATED_KEY, uid), "1");
  } catch {
    // ignore
  }
}
