/**
 * Shared, short-lived copy of the `stocks` catalogue for server-side readers.
 *
 * Web search, the AI chat tools, outfit suggestions and the Telegram bot all
 * used to read the ENTIRE `stocks` collection on every call. They now share one
 * read per minute per server instance:
 *
 * - Admin SDK when it is configured (no security rules, no client-SDK
 *   connection on the server), otherwise the client SDK read used before.
 * - TTL of 60s, so stock counts shown by search can be up to a minute old.
 *   Anything that must be exact (cart, checkout, stock deduction) reads the
 *   document directly and is not affected.
 * - Single-flight: concurrent callers during a miss share one read.
 *
 * Callers must treat the returned documents as read-only: they are shared
 * between every request served from the same snapshot.
 */

import { collection, getDocs } from "firebase/firestore";
import { adminDb } from "../firebase-admin";
import { db } from "../firebase";
import { createTtlCache } from "./ttlCache";

export interface CatalogDoc {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

export interface CatalogSnapshot {
  /** Every stock document, in document-id order (as `getDocs(collection)`). */
  readonly docs: readonly CatalogDoc[];
  /**
   * Documents as `orderBy("createdAt", "desc")` would return them: only those
   * that have a `createdAt` field, newest first.
   */
  readonly byNewest: readonly CatalogDoc[];
  readonly loadedAt: number;
}

const CATALOG_TTL_MS = 60 * 1000;
const catalogCache = createTtlCache<"stocks", CatalogSnapshot>({
  ttlMs: CATALOG_TTL_MS,
  maxEntries: 1,
});

/** True when either SDK can read the catalogue. */
export function isCatalogConfigured(): boolean {
  return !!adminDb || !!db;
}

/** Firestore's cross-type ordering, for the types `createdAt` can hold. */
function typeRank(value: unknown): number {
  if (value === null) return 0;
  if (typeof value === "boolean") return 1;
  if (typeof value === "number") return 2;
  if (isTimestampLike(value) || value instanceof Date) return 3;
  if (typeof value === "string") return 4;
  return 5;
}

function isTimestampLike(
  value: unknown,
): value is { seconds: number; nanoseconds: number } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { seconds?: unknown }).seconds === "number" &&
    typeof (value as { nanoseconds?: unknown }).nanoseconds === "number"
  );
}

function timeParts(value: unknown): [number, number] {
  if (isTimestampLike(value)) return [value.seconds, value.nanoseconds];
  if (value instanceof Date) {
    const ms = value.getTime();
    return [Math.floor(ms / 1000), (ms % 1000) * 1e6];
  }
  return [0, 0];
}

/** Ascending comparison of two `createdAt` values the way Firestore orders them. */
function compareCreatedAt(a: unknown, b: unknown): number {
  const rankDiff = typeRank(a) - typeRank(b);
  if (rankDiff !== 0) return rankDiff;

  switch (typeRank(a)) {
    case 1:
    case 2:
      return Number(a) - Number(b);
    case 3: {
      const [as, an] = timeParts(a);
      const [bs, bn] = timeParts(b);
      return as !== bs ? as - bs : an - bn;
    }
    case 4:
      return a === b ? 0 : (a as string) < (b as string) ? -1 : 1;
    default:
      return 0;
  }
}

function compareIds(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Mirror `orderBy("createdAt", "desc")`: documents without the field are
 * excluded, and ties fall back to document id in the same (descending)
 * direction, as Firestore's implicit `__name__` ordering does.
 */
function sortByNewest(docs: readonly CatalogDoc[]): CatalogDoc[] {
  return docs
    .filter((doc) => doc.data.createdAt !== undefined)
    .sort(
      (x, y) =>
        compareCreatedAt(y.data.createdAt, x.data.createdAt) ||
        compareIds(y.id, x.id),
    );
}

async function loadCatalog(): Promise<CatalogSnapshot> {
  let docs: CatalogDoc[];

  if (adminDb) {
    const snapshot = await adminDb.collection("stocks").get();
    docs = snapshot.docs.map((d) =>
      Object.freeze({ id: d.id, data: (d.data() || {}) as Record<string, unknown> }),
    );
  } else if (db) {
    const snapshot = await getDocs(collection(db, "stocks"));
    docs = snapshot.docs.map((d) =>
      Object.freeze({ id: d.id, data: (d.data() || {}) as Record<string, unknown> }),
    );
  } else {
    throw new Error("Firebase not configured");
  }

  return Object.freeze({
    docs: Object.freeze(docs),
    byNewest: Object.freeze(sortByNewest(docs)),
    loadedAt: Date.now(),
  });
}

/** The cached catalogue, loading it if it is missing or older than the TTL. */
export function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  return catalogCache.get("stocks", loadCatalog);
}

/** Every stock document in document-id order. */
export async function getCatalogDocs(): Promise<readonly CatalogDoc[]> {
  return (await getCatalogSnapshot()).docs;
}

/** Stock documents newest first, as `orderBy("createdAt", "desc")`. */
export async function getCatalogDocsByNewest(): Promise<readonly CatalogDoc[]> {
  return (await getCatalogSnapshot()).byNewest;
}
