import { NextRequest, NextResponse } from "next/server";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../../lib/firebase";

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

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    // Branch (shop) id to scope the carousel to. `stocks.shop` holds the shop
    // document id, which is what the storefront passes around in ?branch=.
    const branch = url.searchParams.get("branch") || "";
    const take = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || 4, 1),
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
      return NextResponse.json(
        { items: fallback },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        },
      );
    }
    // Query recent stock groups (owner app stores items in 'stocks').
    //
    // Ordering happens in Firestore but the branch filter is applied in memory
    // on purpose: combining where("shop") with orderBy("createdAt") needs a
    // composite index, and the collection is small enough that filtering here
    // avoids that operational dependency.
    const q = query(collection(db, "stocks"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const NEW_DAYS = Number(process.env.NEXT_PUBLIC_NEW_ITEM_DAYS || 7);
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const scopedDocs = branch
      ? snapshot.docs.filter(
          (doc) => String((doc.data() as StockData).shop || "") === branch,
        )
      : snapshot.docs;

    const items = scopedDocs.slice(0, take).map((doc) => {
      const data = doc.data() as StockData;
      // prefer: groupImage -> color variant image -> product image
      const image =
        data?.groupImage ||
        data?.colorVariants?.[0]?.image ||
        data?.image ||
        "";

      // compute isNew based on createdAt (supports Firestore Timestamp)
      let createdMs = Date.now();
      try {
        const created: StockData["createdAt"] = data?.createdAt;
        if (created) {
          if (
            typeof (created as { toMillis?: unknown }).toMillis === "function"
          )
            createdMs = (created as { toMillis: () => number }).toMillis();
          else if (typeof created === "number") createdMs = created;
          else createdMs = new Date(created as string | Date).getTime();
        }
      } catch (e) {
        createdMs = Date.now();
      }

      const isNew = Date.now() - createdMs <= NEW_DAYS * MS_PER_DAY;

      return {
        id: doc.id,
        name: data.groupName || data.name || "",
        image,
        groupImage: data.groupImage || "",
        isNew,
      };
    });

    // If the catalogue itself is empty in development, return fallback samples.
    // This deliberately does NOT apply when a branch was requested: showing
    // placeholder products for a branch that simply has no stock would be
    // misleading.
    if (!items.length && !branch && process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        { items: fallback },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        },
      );
    }

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { items: [], error: msg || "Failed to fetch new items" },
      { status: 500 },
    );
  }
}
