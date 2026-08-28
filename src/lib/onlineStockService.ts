import { FieldValue, Firestore } from "firebase-admin/firestore";

type StockRequestLine = {
  stockId: string;
  variantId?: string;
  color?: string;
  size?: string;
  quantity: number;
  itemLabel?: string;
};

type StockVariant = {
  id?: string;
  color?: string;
  sizeQuantities?: Array<{ size?: string; quantity?: number }>;
};

function normalize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function buildOrderLines(input: Record<string, unknown>): StockRequestLine[] {
  const lines: StockRequestLine[] = [];

  const cartItems = Array.isArray(input.cartItems)
    ? (input.cartItems as Array<Record<string, unknown>>)
    : [];

  for (const item of cartItems) {
    const stockId = String(item.productId || "").trim();
    const quantity = Math.max(0, Number(item.quantity || 0));
    if (!stockId || quantity <= 0) continue;

    lines.push({
      stockId,
      variantId: String(item.variantId || "").trim() || undefined,
      color: String(item.color || "").trim() || undefined,
      size: String(item.size || "").trim() || undefined,
      quantity,
      itemLabel: String(item.productName || stockId),
    });
  }

  if (lines.length > 0) {
    return lines;
  }

  const product =
    input.product && typeof input.product === "object"
      ? (input.product as Record<string, unknown>)
      : null;

  if (!product) return [];

  const stockId = String(product.productId || "").trim();
  const quantity = Math.max(0, Number(product.quantity || 0));
  if (!stockId || quantity <= 0) return [];

  return [
    {
      stockId,
      variantId: String(product.variantId || "").trim() || undefined,
      color: String(product.color || "").trim() || undefined,
      size: String(product.size || "").trim() || undefined,
      quantity,
      itemLabel: String(product.productName || stockId),
    },
  ];
}

function mergeLines(lines: StockRequestLine[]): StockRequestLine[] {
  const merged = new Map<string, StockRequestLine>();

  for (const line of lines) {
    const key = [
      line.stockId,
      normalize(line.variantId),
      normalize(line.color),
      normalize(line.size),
    ].join("|");

    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(key, { ...line });
    }
  }

  return Array.from(merged.values());
}

function resolveVariantIndex(
  variants: StockVariant[],
  line: StockRequestLine,
): number {
  const variantHint = normalize(line.variantId);
  const colorHint = normalize(line.color);
  const sizeHint = normalize(line.size);

  // Try matching by variant ID first (could be index like "0", "1", etc.)
  if (variantHint) {
    // Try exact ID match
    const idx = variants.findIndex((v) => normalize(v.id) === variantHint);
    if (idx >= 0) return idx;
    
    // Try matching variant ID as array index
    const asIndex = parseInt(variantHint, 10);
    if (!isNaN(asIndex) && asIndex >= 0 && asIndex < variants.length) {
      return asIndex;
    }
  }

  // Try matching by color
  if (colorHint) {
    const idx = variants.findIndex((v) => normalize(v.color) === colorHint);
    if (idx >= 0) return idx;
  }

  // Try matching by color AND size combination for better accuracy
  if (colorHint && sizeHint) {
    const idx = variants.findIndex((v) => {
      const colorMatch = normalize(v.color) === colorHint;
      const hasSize = (v.sizeQuantities || []).some(
        (sq) => normalize(sq.size) === sizeHint,
      );
      return colorMatch && hasSize;
    });
    if (idx >= 0) return idx;
  }

  // Try matching by size only (if only one variant has this size)
  if (sizeHint) {
    const matching = variants
      .map((v, idx) => ({
        idx,
        hasSize: (v.sizeQuantities || []).some(
          (sq) => normalize(sq.size) === sizeHint,
        ),
      }))
      .filter((x) => x.hasSize);

    if (matching.length === 1) return matching[0].idx;
    
    // If multiple variants have this size but only one has stock, use that one
    if (matching.length > 1) {
      const withStock = matching.filter((m) => {
        const variant = variants[m.idx];
        const sizeQty = (variant.sizeQuantities || []).find(
          (sq) => normalize(sq.size) === sizeHint,
        );
        return (sizeQty?.quantity || 0) > 0;
      });
      if (withStock.length === 1) return withStock[0].idx;
    }
  }

  // If only one variant exists, use it as default
  if (variants.length === 1) return 0;

  return -1;
}

function resolveSizeIndex(
  sizeQuantities: Array<{ size?: string; quantity?: number }>,
  line: StockRequestLine,
): number {
  const sizeHint = normalize(line.size);

  if (sizeHint) {
    return sizeQuantities.findIndex((sq) => normalize(sq.size) === sizeHint);
  }

  if (sizeQuantities.length === 1) return 0;

  return -1;
}

function describeLine(line: StockRequestLine): string {
  const parts = [line.itemLabel || line.stockId];
  if (line.color) parts.push(`color:${line.color}`);
  if (line.size) parts.push(`size:${line.size}`);
  return parts.join(" ");
}

function getStockVariants(data: Record<string, unknown>): StockVariant[] {
  if (!Array.isArray(data.colorVariants)) return [];
  return data.colorVariants as StockVariant[];
}

function assertStockAvailable(
  stockData: Record<string, unknown>,
  line: StockRequestLine,
): void {
  const variants = getStockVariants(stockData);
  if (variants.length === 0) {
    throw new Error(`Stock variants missing for ${describeLine(line)}`);
  }

  const variantIndex = resolveVariantIndex(variants, line);
  if (variantIndex < 0) {
    // Provide detailed error message with available variants
    const availableVariants = variants
      .map((v, idx) => {
        const sizes = (v.sizeQuantities || [])
          .map((sq) => sq.size)
          .filter(Boolean)
          .join(", ");
        return `Variant ${idx}: color=${v.color || "N/A"}, id=${v.id || "N/A"}, sizes=[${sizes}]`;
      })
      .join("; ");
    
    throw new Error(
      `Variant not found for ${describeLine(line)}. Available variants: ${availableVariants}`
    );
  }

  const variant = variants[variantIndex];
  const sizeQuantities = Array.isArray(variant.sizeQuantities)
    ? variant.sizeQuantities
    : [];

  const sizeIndex = resolveSizeIndex(sizeQuantities, line);
  if (sizeIndex < 0) {
    // Provide detailed error message with available sizes
    const availableSizes = sizeQuantities
      .map((sq) => `${sq.size}(qty:${sq.quantity || 0})`)
      .join(", ");
    
    throw new Error(
      `Size not found for ${describeLine(line)}. Available sizes: ${availableSizes}`
    );
  }

  const available = Number(sizeQuantities[sizeIndex]?.quantity || 0);
  if (available < line.quantity) {
    throw new Error(
      `Insufficient stock for ${describeLine(line)}. Requested ${line.quantity}, available ${available}`,
    );
  }
}

function decreaseStock(
  stockData: Record<string, unknown>,
  line: StockRequestLine,
): Record<string, unknown> {
  const variants = JSON.parse(
    JSON.stringify(getStockVariants(stockData)),
  ) as StockVariant[];

  const variantIndex = resolveVariantIndex(variants, line);
  if (variantIndex < 0) {
    throw new Error(`Variant not found for ${describeLine(line)}`);
  }

  const variant = variants[variantIndex];
  const sizeQuantities = Array.isArray(variant.sizeQuantities)
    ? variant.sizeQuantities
    : [];
  const sizeIndex = resolveSizeIndex(sizeQuantities, line);
  if (sizeIndex < 0) {
    throw new Error(`Size not found for ${describeLine(line)}`);
  }

  const available = Number(sizeQuantities[sizeIndex]?.quantity || 0);
  if (available < line.quantity) {
    throw new Error(
      `Insufficient stock for ${describeLine(line)}. Requested ${line.quantity}, available ${available}`,
    );
  }

  sizeQuantities[sizeIndex] = {
    ...sizeQuantities[sizeIndex],
    quantity: available - line.quantity,
  };

  variants[variantIndex] = {
    ...variant,
    sizeQuantities,
  };

  return {
    ...stockData,
    colorVariants: variants,
  };
}

export async function ensureStockAvailableForOrderInput(
  db: Firestore,
  input: Record<string, unknown>,
): Promise<void> {
  const lines = mergeLines(buildOrderLines(input));
  if (lines.length === 0) return;

  for (const line of lines) {
    const stockRef = db.collection("stocks").doc(line.stockId);
    const stockSnap = await stockRef.get();
    if (!stockSnap.exists) {
      throw new Error(`Stock item not found for ${describeLine(line)}`);
    }

    const stockData = (stockSnap.data() || {}) as Record<string, unknown>;
    assertStockAvailable(stockData, line);
  }
}

export async function deductStockForPaidOnlineOrder(
  db: Firestore,
  orderId: string,
): Promise<{ applied: boolean; reason?: string }> {
  const orderRef = db.collection("onlineOrders").doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error("Order not found");
    }

    const orderData = (orderSnap.data() || {}) as Record<string, unknown>;
    const paymentStatus = String(orderData.paymentStatus || "").toUpperCase();

    if (paymentStatus !== "SUCCESS") {
      return { applied: false, reason: "payment_not_success" };
    }

    if (orderData.stockDeductedAt) {
      return { applied: false, reason: "already_applied" };
    }

    const lines = mergeLines(buildOrderLines(orderData));
    if (lines.length === 0) {
      tx.set(
        orderRef,
        {
          stockDeductedAt: new Date().toISOString(),
          stockDeductionStatus: "skipped",
          stockDeductionReason: "no_items",
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { applied: false, reason: "no_items" };
    }

    const stockCache = new Map<string, Record<string, unknown>>();

    for (const line of lines) {
      if (!stockCache.has(line.stockId)) {
        const stockRef = db.collection("stocks").doc(line.stockId);
        const stockSnap = await tx.get(stockRef);
        if (!stockSnap.exists) {
          throw new Error(`Stock item not found for ${describeLine(line)}`);
        }
        stockCache.set(
          line.stockId,
          (stockSnap.data() || {}) as Record<string, unknown>,
        );
      }

      const current = stockCache.get(line.stockId) as Record<string, unknown>;
      const next = decreaseStock(current, line);
      stockCache.set(line.stockId, next);
    }

    for (const [stockId, nextStockData] of stockCache.entries()) {
      const stockRef = db.collection("stocks").doc(stockId);
      tx.update(stockRef, {
        colorVariants: nextStockData.colorVariants,
        updatedAt: new Date().toISOString(),
      });
    }

    tx.set(
      orderRef,
      {
        stockDeductedAt: new Date().toISOString(),
        stockDeductionStatus: "applied",
        stockDeductionError: FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return { applied: true };
  });
}
