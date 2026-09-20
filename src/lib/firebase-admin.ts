import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

const app = getApps()[0]
  ? getApps()[0]
  : serviceAccount
    ? initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
    : null;

export const adminDb = app ? getFirestore(app) : null;
export const isAdminDbConfigured = !!adminDb;

/**
 * Admin Auth, used to verify a caller's Firebase ID token.
 *
 * Needed wherever a route must know *which* customer is asking, rather than
 * trusting a uid supplied in the request body.
 */
export const adminAuth = app ? getAuth(app) : null;

/**
 * Resolve the customer uid from an `Authorization: Bearer <idToken>` header.
 * Returns null when the header is absent or the token cannot be trusted, so
 * callers can fall back to an anonymous (non-personalised) experience.
 */
export async function getUidFromAuthHeader(
  authorizationHeader: string | null,
): Promise<string | null> {
  if (!adminAuth || !authorizationHeader) return null;

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch (error) {
    console.error("Failed to verify customer ID token:", error);
    return null;
  }
}
