import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  EMPTY_SIGNALS,
  MAX_SEARCHES,
  MAX_VIEWS,
  normaliseSearchTerm,
  withSearch,
  withView,
  type StoredSignals,
  type SearchedTerm,
  type ViewedProduct,
} from "./history";

/**
 * Per-account signal store, so a shopper's taste follows them between devices
 * and updates live in every open tab.
 *
 * Kept in its own top-level collection rather than as fields on `customers/{uid}`
 * for two reasons: the POS app reads customer documents and should not have to
 * ignore behavioural arrays, and this collection can be locked down (and wiped)
 * independently of the customer record.
 *
 * SECURITY: `shopperSignals/{uid}` holds personal browsing history. The rules
 * must restrict each document to its owner — see
 * documents/SHOPPER_SIGNALS_SETUP.md.
 */
const COLLECTION = "shopperSignals";

/** Timestamps are plain epoch millis so local and remote entries merge cleanly. */
type RemoteSignalsDoc = {
  views?: ViewedProduct[];
  searches?: SearchedTerm[];
  updatedAt?: number;
};

function signalsRef(uid: string) {
  if (!db) return null;
  return doc(db, COLLECTION, uid);
}

/** Drop anything malformed so one bad write cannot break the whole section. */
function sanitise(data: RemoteSignalsDoc | undefined): StoredSignals {
  if (!data) return EMPTY_SIGNALS;

  const views = Array.isArray(data.views)
    ? data.views
        .filter(
          (view): view is ViewedProduct =>
            !!view &&
            typeof view.productId === "string" &&
            typeof view.viewedAt === "number",
        )
        .slice(0, MAX_VIEWS)
    : [];

  const searches = Array.isArray(data.searches)
    ? data.searches
        .filter(
          (search): search is SearchedTerm =>
            !!search &&
            typeof search.term === "string" &&
            typeof search.searchedAt === "number",
        )
        .slice(0, MAX_SEARCHES)
    : [];

  return { views, searches };
}

/**
 * Watch an account's signals.
 *
 * Returns an unsubscribe function. On error it reports empty signals rather
 * than throwing: a denied read (e.g. rules not yet deployed) should degrade to
 * "no recommendations", not a broken homepage.
 */
export function subscribeToRemoteSignals(
  uid: string,
  onChange: (signals: StoredSignals) => void,
): () => void {
  const ref = signalsRef(uid);
  if (!ref) {
    onChange(EMPTY_SIGNALS);
    return () => {};
  }

  return onSnapshot(
    ref,
    (snapshot) => {
      onChange(
        snapshot.exists()
          ? sanitise(snapshot.data() as RemoteSignalsDoc)
          : EMPTY_SIGNALS,
      );
    },
    (error) => {
      console.error("Could not read shopper signals:", error);
      onChange(EMPTY_SIGNALS);
    },
  );
}

/** Read once, for merges and read-modify-write updates. */
export async function readRemoteSignals(uid: string): Promise<StoredSignals> {
  const ref = signalsRef(uid);
  if (!ref) return EMPTY_SIGNALS;

  try {
    const snapshot = await getDoc(ref);
    return snapshot.exists()
      ? sanitise(snapshot.data() as RemoteSignalsDoc)
      : EMPTY_SIGNALS;
  } catch (error) {
    console.error("Could not read shopper signals:", error);
    return EMPTY_SIGNALS;
  }
}

async function writeRemoteSignals(uid: string, signals: StoredSignals) {
  const ref = signalsRef(uid);
  if (!ref) return;

  try {
    await setDoc(
      ref,
      {
        uid,
        views: signals.views.slice(0, MAX_VIEWS),
        searches: signals.searches.slice(0, MAX_SEARCHES),
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (error) {
    // Offline or rules-denied. Recommendations are non-essential, so never let
    // this surface to the shopper.
    console.error("Could not save shopper signals:", error);
  }
}

/**
 * Append a view for an account.
 *
 * Read-modify-write rather than `arrayUnion` because the list is ordered,
 * de-duplicated and capped — none of which array unions can express. Two tabs
 * racing means last-write-wins, which is acceptable for taste data.
 */
export async function recordRemoteView(
  uid: string,
  product: { id: string; name?: string; category?: string },
) {
  if (!product?.id) return;

  const current = await readRemoteSignals(uid);
  await writeRemoteSignals(uid, {
    ...current,
    views: withView(current.views, {
      productId: product.id,
      name: product.name,
      category: product.category,
      viewedAt: Date.now(),
    }),
  });
}

export async function recordRemoteSearch(uid: string, rawTerm: string) {
  const term = normaliseSearchTerm(rawTerm);
  if (!term) return;

  const current = await readRemoteSignals(uid);
  await writeRemoteSignals(uid, {
    ...current,
    searches: withSearch(current.searches, { term, searchedAt: Date.now() }),
  });
}

/** Overwrite an account's signals, used by the guest-history merge. */
export async function replaceRemoteSignals(
  uid: string,
  signals: StoredSignals,
) {
  await writeRemoteSignals(uid, signals);
}

/** Wipe an account's signals (for an explicit "clear history" action). */
export async function clearRemoteSignals(uid: string) {
  await writeRemoteSignals(uid, EMPTY_SIGNALS);
}
