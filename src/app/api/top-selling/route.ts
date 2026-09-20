import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

interface TopSellingProduct {
  productId: string;
  variantId: string;
  name: string;
  category: string;
  color: string;
  colorCode?: string;
  quantitySold: number;
  revenue: number;
  image?: string;
  price?: number;
}

interface ProductAggregate {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  price?: number;
  // best-selling variant for this product, used for display metadata
  topVariantId: string;
  topVariantQty: number;
  topVariantColor: string;
  topVariantColorCode?: string;
}

interface AggregationSnapshot {
  ranked: ProductAggregate[];
  stocksMap: Map<string, Record<string, unknown>>;
  uniqueProductsSold: number;
  computedAt: number;
}

/**
 * Computing the ranking requires reading the entire transaction history, which
 * is by far the most expensive part of this endpoint and is completely
 * branch-independent. It's cached briefly so that polling clients (and all
 * branches) share one scan instead of each triggering their own.
 *
 * NOTE: this is process-local. On a single server / `next start` it works as
 * intended; on a horizontally-scaled serverless platform each instance keeps
 * its own copy, so the effective staleness stays bounded by the TTL but the
 * scan may run once per instance. Moving to a maintained aggregate document
 * (updated when a sale is written) would remove the scan entirely.
 */
const AGGREGATION_TTL_MS = 20 * 1000;
let cachedAggregation: AggregationSnapshot | null = null;
let inFlight: Promise<AggregationSnapshot> | null = null;

async function computeAggregation(): Promise<AggregationSnapshot> {
  // Sales are aggregated across ALL transactions rather than filtering them
  // by branch. Transactions only record a branch by name (`branchName`), that
  // field is absent on roughly half of historical records, and the values in
  // use ("Main Shop", "Online Store") don't all map to a shop document — so
  // filtering transactions by branch silently discards most sales history.
  // Branch scoping is instead applied per product by the caller via
  // `stocks.shop`, which is authoritative: a product belongs to one branch.
  const transactionsSnapshot = await adminDb!
    .collection("transactions")
    .where("status", "in", ["completed", "partially_refunded", "refunded"])
    .get();

  // Aggregate sales per PRODUCT (summing across all of its colour/size
  // variants). Aggregating per variant would let a single product occupy
  // many slots in the ranking and crowd out other products.
  const productMap = new Map<string, ProductAggregate>();

  transactionsSnapshot.docs.forEach((doc) => {
    const transaction = doc.data();
    const items = transaction.items || [];

    items.forEach((item: Record<string, unknown>) => {
      // Transaction line items carry the product's stock document id on both
      // `stockId` and `productId`; `groupName` is only a legacy fallback.
      const productId = String(
        item.stockId || item.productId || item.groupName || "unknown"
      );
      if (productId === "unknown") return;

      const variantId = String(
        item.variantId || item.selectedColor || "default"
      );
      const quantity = Number(item.quantity) || 0;
      const itemRevenue = (Number(item.unitPrice) || 0) * quantity;

      const existing = productMap.get(productId);

      if (existing) {
        existing.quantity += quantity;
        existing.revenue += itemRevenue;
        if (quantity > existing.topVariantQty) {
          existing.topVariantQty = quantity;
          existing.topVariantId = variantId;
          existing.topVariantColor = String(item.selectedColor || "default");
          existing.topVariantColorCode = item.colorCode
            ? String(item.colorCode)
            : undefined;
        }
      } else {
        productMap.set(productId, {
          productId,
          name: String(item.groupName || item.productName || "Unknown Product"),
          category: String(item.category || "Uncategorized"),
          quantity,
          revenue: itemRevenue,
          price: item.unitPrice ? Number(item.unitPrice) : undefined,
          topVariantId: variantId,
          topVariantQty: quantity,
          topVariantColor: String(item.selectedColor || "default"),
          topVariantColorCode: item.colorCode
            ? String(item.colorCode)
            : undefined,
        });
      }
    });
  });

  // Sort by units sold, then revenue as a tiebreaker
  const ranked = Array.from(productMap.values()).sort((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }
    return b.revenue - a.revenue;
  });

  // Resolve the catalogue entries for every ranked product. Firestore caps
  // `in` queries at 10 values, so ids are chunked and fetched concurrently.
  const stocksMap = new Map<string, Record<string, unknown>>();
  const candidateIds = ranked.map((p) => p.productId);
  const idChunks: string[][] = [];
  for (let i = 0; i < candidateIds.length; i += 10) {
    idChunks.push(candidateIds.slice(i, i + 10));
  }

  const chunkSnapshots = await Promise.all(
    idChunks.map((batch) =>
      adminDb!.collection("stocks").where("__name__", "in", batch).get()
    )
  );

  chunkSnapshots.forEach((snapshot) => {
    snapshot.docs.forEach((doc) => {
      stocksMap.set(doc.id, doc.data());
    });
  });

  return {
    ranked,
    stocksMap,
    uniqueProductsSold: productMap.size,
    computedAt: Date.now(),
  };
}

async function getAggregation(forceFresh: boolean): Promise<AggregationSnapshot> {
  const isFresh =
    cachedAggregation !== null &&
    Date.now() - cachedAggregation.computedAt < AGGREGATION_TTL_MS;

  if (!forceFresh && isFresh) {
    return cachedAggregation!;
  }

  // Collapse concurrent recomputes into a single scan.
  if (!inFlight) {
    inFlight = computeAggregation()
      .then((result) => {
        cachedAggregation = result;
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const branch = url.searchParams.get("branch") || "";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
    // Clients set `fresh=1` right after they detect a sale, so the ranking
    // updates immediately instead of waiting out the cache TTL.
    const forceFresh = url.searchParams.get("fresh") === "1";

    const { ranked, stocksMap, uniqueProductsSold, computedAt } =
      await getAggregation(forceFresh);

    // Only keep products that still exist in the catalogue — deleted products
    // can never be rendered on the storefront, and keeping them would silently
    // shrink the best-sellers list.
    const existingRanked = ranked.filter((p) => stocksMap.has(p.productId));

    // If a branch was requested, also restrict to products belonging to that
    // branch (`stocks.shop` holds the shop id).
    const branchScoped = branch
      ? existingRanked.filter(
          (p) => String(stocksMap.get(p.productId)?.shop || "") === branch
        )
      : existingRanked;

    const topProducts: TopSellingProduct[] = branchScoped
      .slice(0, limit)
      .map((product) => {
        const result: TopSellingProduct = {
          productId: product.productId,
          variantId: product.topVariantId,
          name: product.name,
          category: product.category,
          color: product.topVariantColor,
          colorCode: product.topVariantColorCode,
          quantitySold: product.quantity,
          revenue: product.revenue,
          price: product.price,
        };

        const stock = stocksMap.get(product.productId);
        if (stock) {
          const colorVariants = stock.colorVariants as unknown[];
          if (Array.isArray(colorVariants)) {
            const variant = colorVariants.find(
              (v: unknown): v is Record<string, unknown> => {
                if (typeof v !== "object" || !v) return false;
                const rec = v as Record<string, unknown>;
                return (
                  rec.id === result.variantId ||
                  rec.color === result.color ||
                  rec.colorCode === result.colorCode
                );
              }
            );

            const pickImage = (v: Record<string, unknown>): string | undefined => {
              if (Array.isArray(v.images) && v.images.length > 0) {
                return String(v.images[0]);
              }
              if (v.image) return String(v.image);
              return undefined;
            };

            if (variant) {
              result.image = pickImage(variant);
            }
            if (!result.image && colorVariants[0] && typeof colorVariants[0] === "object") {
              result.image = pickImage(colorVariants[0] as Record<string, unknown>);
            }
          }
          if (!result.image && stock.groupImage) {
            result.image = String(stock.groupImage);
          }

          if (typeof stock.category === "string" && stock.category) {
            result.category = stock.category;
          }
          if (typeof stock.groupName === "string" && stock.groupName) {
            result.name = stock.groupName;
          }
          if (!result.price && typeof stock.unitPrice === "number") {
            result.price = stock.unitPrice;
          }
        }

        return result;
      });

    return NextResponse.json({
      success: true,
      data: topProducts,
      meta: {
        uniqueProductsSold,
        stillInCatalogue: existingRanked.length,
        returned: topProducts.length,
        branch: branch || "all",
        computedAt,
        cached: !forceFresh && Date.now() - computedAt > 50,
      },
    });
  } catch (error) {
    console.error("Error fetching top-selling products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch top-selling products",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
