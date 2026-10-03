import { NextRequest, NextResponse } from "next/server";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { createTtlCache } from "../../../lib/server/ttlCache";

// The response varies by the `branch` query parameter, so it must be evaluated
// per request. Without this the handler (which previously took no arguments)
// can be treated as a static route and serve one branch's items to everyone.
export const dynamic = "force-dynamic";

interface StockData {
  groupImage?: string;
  colorVariants?: Array<{ image?: string }>;
  image?: string;
  createdAt?: { toMillis?: () => number } | number | string | Date;
  groupName?: string;
  name?: string;
  shop?: string;
}

interface NewItem {
  id: string;
  name: string;
  image: string;
  groupImage: string;
  isNew: boolean;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

/**
 * Bounded reads.
 *
 * Without a branch this is a single `limit(take)` query. With a branch the
 * stock documents are paged newest-first and filtered by `shop` in memory,
 * stopping as soon as enough matches are found or MAX_SCANNED documents have
 * been read. A `where("shop")` + `orderBy("createdAt")` query would need a
 * composite index, which this route deliberately does not depend on.
 *
 * Trade-off: a branch whose newest products are older than the MAX_SCANNED
 * newest products store-wide shows fewer (or no) items in this carousel.
 */
const PAGE_SIZE = 50;
const MAX_SCANNED = 500;
const MAX_BRANCH_LENGTH = 128;

/**
 * Results are cached per branch+limit for a minute, and concurrent requests
 * for the same key share one Firestore read. Per server instance; see
 * lib/server/ttlCache.ts.
 */
const newItemsCache = createTtlCache<string, NewItem[]>({
  ttlMs: 60 * 1000,
  maxEntries: 200,
});

function createdAtMillis(created: StockData["createdAt"]): number {
  try {
    if (created) {
      if (typeof (created as { toMillis?: unknown }).toMillis === "function")
        return (created as { toMillis: () => number }).toMillis();
      if (typeof created === "number") return created;
      return new Date(created as string | Date).getTime();
    }
  } catch {
    // fall through
  }
  return Date.now();
}

function toNewItem(doc: QueryDocumentSnapshot<DocumentData>): NewItem {
  const NEW_DAYS = Number(process.env.NEXT_PUBLIC_NEW_ITEM_DAYS || 7);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const data = doc.data() as StockData;

  // prefer: groupImage -> color variant image -> product image
  const image =
    data?.groupImage || data?.colorVariants?.[0]?.image || data?.image || "";

  const isNew = Date.now() - createdAtMillis(data?.createdAt) <= NEW_DAYS * MS_PER_DAY;

  return {
    id: doc.id,
    name: data.groupName || data.name || "",
    image,
    groupImage: data.groupImage || "",
    isNew,
  };
}

async function loadNewItems(branch: string, take: number): Promise<NewItem[]> {
  if (!db) return [];
  const stocks = collection(db, "stocks");

  if (!branch) {
    const snapshot = await getDocs(
      query(stocks, orderBy("createdAt", "desc"), limit(take)),
    );
    return snapshot.docs.map(toNewItem);
  }

  // `stocks.shop` holds the shop document id, which is what the storefront
  // passes around in ?branch=.
  const matches: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let scanned = 0;

  while (matches.length < take && scanned < MAX_SCANNED) {
    const pageSize = Math.min(PAGE_SIZE, MAX_SCANNED - scanned);
    const page: Query<DocumentData> = cursor
      ? query(stocks, orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize))
      : query(stocks, orderBy("createdAt", "desc"), limit(pageSize));
    const snapshot: QuerySnapshot<DocumentData> = await getDocs(page);
    scanned += snapshot.size;

    for (const doc of snapshot.docs) {
      if (String((doc.data() as StockData).shop || "") === branch) {
        matches.push(doc);
        if (matches.length >= take) break;
      }
    }

    if (snapshot.size < pageSize) break; // reached the end of the collection
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  return matches.map(toNewItem);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    // Branch (shop) id to scope the carousel to. `stocks.shop` holds the shop
    // document id, which is what the storefront passes around in ?branch=.
    const branch = (url.searchParams.get("branch") || "").trim();
    if (branch.length > MAX_BRANCH_LENGTH || branch.includes("/")) {
      return NextResponse.json(
        { items: [], error: "Invalid branch" },
        { status: 400 },
      );
    }
    const take = Math.min(
      Math.max(Math.floor(Number(url.searchParams.get("limit"))) || 4, 1),
      20,
    );
    const fallback = [
      {
        id: "fallback-1",
        name: "Sample Tee — Ocean",
        image: "https://via.placeholder.com/800x360.png?text=Sample+1",
      },
      {
        id: "fallback-2",
        name: "Sample Shirt — Sand",
        image: "https://via.placeholder.com/800x360.png?text=Sample+2",
      },
      {
        id: "fallback-3",
        name: "New Jacket — Slate",
        image: "https://via.placeholder.com/800x360.png?text=Sample+3",
      },
      {
        id: "fallback-4",
        name: "Limited Hoody — Charcoal",
        image: "https://via.placeholder.com/800x360.png?text=Sample+4",
      },
    ];

    if (!db) {
      // Firestore not configured locally — return development fallback items
      return NextResponse.json({ items: fallback }, { headers: CACHE_HEADERS });
    }

    const items = await newItemsCache.get(`${branch}|${take}`, () =>
      loadNewItems(branch, take),
    );

    // If the catalogue itself is empty in development, return fallback samples.
    // This deliberately does NOT apply when a branch was requested: showing
    // placeholder products for a branch that simply has no stock would be
    // misleading.
    if (!items.length && !branch && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ items: fallback }, { headers: CACHE_HEADERS });
    }

    return NextResponse.json({ items }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Failed to fetch new items:", error);
    return NextResponse.json(
      { items: [], error: "Failed to fetch new items" },
      { status: 500 },
    );
  }
}
