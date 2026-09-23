import crypto from "crypto";
import { adminAuth, adminDb } from "../firebase-admin";

/**
 * Email verification codes for customers who registered with email + password.
 *
 * Follows the same shape as telegram/auth-service.ts (one doc per credential,
 * `expiresAt` + `used`, functions return result objects rather than throwing)
 * with three additions appropriate to a short numeric secret:
 *
 *  - only a SHA-256 hash of the code is stored, so a Firestore read cannot
 *    reveal a live code;
 *  - attempts are counted and capped, so a 6-digit code cannot be brute forced;
 *  - resends are throttled, so the endpoint cannot be used to spam an inbox.
 */

const COLLECTION = "emailVerificationCodes";

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 15;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_ATTEMPTS = 5;

type VerificationDoc = {
  uid: string;
  email: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
  attempts: number;
  usedAt?: Date;
};

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Cryptographically random 6-digit code.
 *
 * `randomInt` is used rather than `Math.random()` because this value is a
 * credential. The range keeps the leading zero possible (000000-999999).
 */
function generateCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(
    CODE_LENGTH,
    "0",
  );
}

/** Firestore may hand back a Timestamp or a Date depending on write path. */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate();
  }
  return new Date(value as string);
}

/** Compare digests without leaking match position through timing. */
function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Create (or replace) the pending code for a customer.
 *
 * Returns the plaintext code so the caller can email it; it is never persisted
 * and must never be returned to the browser.
 */
export async function issueVerificationCode(
  uid: string,
  email: string,
): Promise<IssueResult> {
  if (!adminDb) {
    return { ok: false, error: "Server database is not configured" };
  }

  const docRef = adminDb.collection(COLLECTION).doc(uid);
  const existing = await docRef.get();

  // Throttle resends against the previous issue time.
  if (existing.exists) {
    const data = existing.data() as VerificationDoc;
    const ageMs = Date.now() - toDate(data.createdAt).getTime();
    const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
    if (!data.used && ageMs < cooldownMs) {
      return {
        ok: false,
        error: "A code was just sent. Please wait before requesting another.",
        retryAfterSeconds: Math.ceil((cooldownMs - ageMs) / 1000),
      };
    }
  }

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  const payload: VerificationDoc = {
    uid,
    email,
    codeHash: hashCode(code),
    createdAt: now,
    expiresAt,
    used: false,
    attempts: 0,
  };

  // Overwrite rather than merge so a resend invalidates the previous code and
  // resets the attempt counter.
  await docRef.set(payload);

  return { ok: true, code, expiresAt };
}

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/**
 * Check a submitted code and, on success, mark the account verified.
 *
 * Verification is recorded in three places so every reader agrees: Firebase
 * Auth (`emailVerified`, which our own emails would otherwise never set) plus
 * the `customers` and `users` documents the storefront and POS read.
 */
export async function confirmVerificationCode(
  uid: string,
  code: string,
): Promise<ConfirmResult> {
  if (!adminDb) {
    return { ok: false, error: "Server database is not configured" };
  }

  const submitted = String(code || "").trim();
  if (!/^\d{6}$/.test(submitted)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const docRef = adminDb.collection(COLLECTION).doc(uid);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return { ok: false, error: "No verification code found. Request a new one." };
  }

  const data = snapshot.data() as VerificationDoc;

  if (data.used) {
    return { ok: false, error: "This code has already been used." };
  }

  if (new Date() > toDate(data.expiresAt)) {
    return { ok: false, error: "This code has expired. Request a new one." };
  }

  if (Number(data.attempts || 0) >= MAX_ATTEMPTS) {
    return {
      ok: false,
      error: "Too many incorrect attempts. Request a new code.",
    };
  }

  if (!safeEqual(hashCode(submitted), data.codeHash)) {
    await docRef.update({ attempts: Number(data.attempts || 0) + 1 });
    const remaining = MAX_ATTEMPTS - (Number(data.attempts || 0) + 1);
    return {
      ok: false,
      error:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Request a new code.",
    };
  }

  const verifiedAt = new Date();
  await docRef.update({ used: true, usedAt: verifiedAt });

  if (adminAuth) {
    try {
      await adminAuth.updateUser(uid, { emailVerified: true });
    } catch (error) {
      // Non-fatal: the Firestore flag below is what the storefront gates on.
      console.error("Failed to set emailVerified on the auth user:", error);
    }
  }

  const verifiedFields = {
    emailVerified: true,
    emailVerifiedAt: verifiedAt,
    updatedAt: verifiedAt,
  };

  await Promise.all([
    adminDb.collection("customers").doc(uid).set(verifiedFields, { merge: true }),
    adminDb.collection("users").doc(uid).set(verifiedFields, { merge: true }),
  ]);

  return { ok: true };
}
