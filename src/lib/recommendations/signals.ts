import {
  GUEST_SCOPE,
  clearLocalSignals,
  hasAnySignal,
  markMergedInto,
  mergeSignals,
  readLocalSignals,
  recordLocalSearch,
  recordLocalView,
  wasMergedInto,
  type StoredSignals,
} from "./history";
import {
  clearRemoteSignals,
  readRemoteSignals,
  recordRemoteSearch,
  recordRemoteView,
  replaceRemoteSignals,
} from "./remote";

/**
 * Single entry point for recording shopper signals.
 *
 * Routing rule: signed-in shoppers write to Firestore, so their history follows
 * the account across devices and streams live into every open tab. Guests write
 * to this device only, because there is no account to attach the data to.
 *
 * Every function is fire-and-forget and swallows its own failures —
 * personalisation must never interrupt browsing or buying.
 */

export function recordProductView(
  uid: string | null | undefined,
  product: { id: string; name?: string; category?: string },
) {
  if (!product?.id) return;

  if (uid) {
    void recordRemoteView(uid, product);
    return;
  }
  recordLocalView(GUEST_SCOPE, product);
}

export function recordSearch(
  uid: string | null | undefined,
  rawTerm: string,
) {
  if (uid) {
    void recordRemoteSearch(uid, rawTerm);
    return;
  }
  recordLocalSearch(GUEST_SCOPE, rawTerm);
}

export async function clearSignals(uid: string | null | undefined) {
  if (uid) {
    await clearRemoteSignals(uid);
    return;
  }
  clearLocalSignals(GUEST_SCOPE);
}

/**
 * Fold anything browsed before signing in into the account, once.
 *
 * Without this, a shopper who browses and then registers would land on a
 * homepage with no recommendations despite having just looked at products.
 * The guest bucket is cleared afterwards so the next visitor to this device
 * does not inherit it.
 */
export async function mergeGuestSignalsInto(uid: string): Promise<boolean> {
  if (!uid || wasMergedInto(uid)) return false;

  const guest = readLocalSignals(GUEST_SCOPE);

  // Nothing to fold in, but still mark it so we stop checking on every mount.
  if (!hasAnySignal(guest)) {
    markMergedInto(uid);
    return false;
  }

  const remote = await readRemoteSignals(uid);
  const merged: StoredSignals = mergeSignals(remote, guest);

  await replaceRemoteSignals(uid, merged);
  markMergedInto(uid);
  clearLocalSignals(GUEST_SCOPE);

  return true;
}
