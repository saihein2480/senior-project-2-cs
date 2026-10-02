import { FieldValue, Firestore, Transaction } from "firebase-admin/firestore";
import { isSettledPaymentStatus } from "./mmpayCallback";

/**
 * Stock bookkeeping for online orders.
 *
 * Lifecycle of a MyanMyanPay (QR) order's stock:
 *
 *   create-order  -> reserved   stock taken off the shelf in the same
 *                               transaction that creates the order
 *   SUCCESS       -> committed  the reservation becomes the sale
 *   FAILED/EXPIRED, QR abandoned, gateway error
 *                 -> released   stock put back (stockRestoredAt set)
 *
 * The reservation is what stops two buyers paying for the last unit: the
 * second checkout fails at create-order, before anyone is charged, instead of
 * at the payment callback after the money has moved.
 *
 * Every write here runs in a transaction that reads the stock documents first
 * and applies changes to what is stored at that moment, so it cannot erase a
 * concurrent POS sale or owner restock (the POS does the same on its side).
 */

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

/** How long a generated QR stays scannable; matches the checkout countdown. */
const QR_WINDOW_MS = 180 * 1000;

/**
 * How long an unpaid reservation holds stock before anyone may release it.
 *
 * Longer than the QR window so a payment made in the last seconds, whose
 * callback is still in flight, is not released out from under the customer.
 */
function reservationTtlMs(): number {
  const seconds = Number(process.env.STOCK_RESERVATION_TTL_SECONDS || 0);
  const configured =
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5 * 60 * 1000;
  return Math.max(configured, QR_WINDOW_MS);
}

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

function describeAvailableVariants(variants: StockVariant[]): string {
  return variants
    .map((v, idx) => {
      const sizes = (v.sizeQuantities || [])
        .map((sq) => `${sq.size}(qty:${sq.quantity || 0})`)
        .filter(Boolean)
        .join(", ");
      return `Variant ${idx}: color=${v.color || "N/A"}, id=${v.id || "N/A"}, sizes=[${sizes}]`;
    })
    .join("; ");
}

/** Take `line.quantity` off the shelf. Throws when there is not enough. */
function decreaseStock(
  stockData: Record<string, unknown>,
  line: StockRequestLine,
): Record<string, unknown> {
  const variants = JSON.parse(
    JSON.stringify(getStockVariants(stockData)),
  ) as StockVariant[];

  if (variants.length === 0) {
    throw new Error(`Stock variants missing for ${describeLine(line)}`);
  }

  const variantIndex = resolveVariantIndex(variants, line);
  if (variantIndex < 0) {
    throw new Error(
      `Variant not found for ${describeLine(line)}. Available variants: ${describeAvailableVariants(variants)}`,
    );
  }

  const variant = variants[variantIndex];
  const sizeQuantities = Array.isArray(variant.sizeQuantities)
    ? variant.sizeQuantities
    : [];
  const sizeIndex = resolveSizeIndex(sizeQuantities, line);
  if (sizeIndex < 0) {
    const availableSizes = sizeQuantities
      .map((sq) => `${sq.size}(qty:${sq.quantity || 0})`)
      .join(", ");
    throw new Error(
      `Size not found for ${describeLine(line)}. Available sizes: ${availableSizes}`,
    );
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

/**
 * Put `line.quantity` back. Returns null when the variant no longer exists
 * (the owner deleted it), since there is nowhere to put it.
 */
function increaseStock(
  stockData: Record<string, unknown>,
  line: StockRequestLine,
): Record<string, unknown> | null {
  const variants = JSON.parse(
    JSON.stringify(getStockVariants(stockData)),
  ) as StockVariant[];

  const variantIndex = resolveVariantIndex(variants, line);
  if (variantIndex < 0) return null;

  const variant = variants[variantIndex];
  const sizeQuantities = Array.isArray(variant.sizeQuantities)
    ? variant.sizeQuantities
    : [];
  const sizeIndex = resolveSizeIndex(sizeQuantities, line);

  if (sizeIndex < 0) {
    if (!line.size) return null;
    sizeQuantities.push({ size: line.size, quantity: line.quantity });
  } else {
    sizeQuantities[sizeIndex] = {
      ...sizeQuantities[sizeIndex],
      quantity:
        Number(sizeQuantities[sizeIndex]?.quantity || 0) + line.quantity,
    };
  }

  variants[variantIndex] = { ...variant, sizeQuantities };
  return { ...stockData, colorVariants: variants };
}

/**
 * Read every stock document the lines touch. Transactions must do all their
 * reads before their first write, so this runs up front.
 */
async function readStockDocs(
  tx: Transaction,
  db: Firestore,
  lines: StockRequestLine[],
  options: { requireAll: boolean },
): Promise<Map<string, Record<string, unknown>>> {
  const stockIds = Array.from(new Set(lines.map((line) => line.stockId)));
  const snaps = await Promise.all(
    stockIds.map((stockId) => tx.get(db.collection("stocks").doc(stockId))),
  );

  const stocks = new Map<string, Record<string, unknown>>();
  snaps.forEach((snap, index) => {
    if (snap.exists) {
      stocks.set(stockIds[index], (snap.data() || {}) as Record<string, unknown>);
      return;
    }
    if (options.requireAll) {
      const line = lines.find((l) => l.stockId === stockIds[index]);
      throw new Error(
        `Stock item not found for ${line ? describeLine(line) : stockIds[index]}`,
      );
    }
  });

  return stocks;
}

function writeStockDocs(
  tx: Transaction,
  db: Firestore,
  stocks: Map<string, Record<string, unknown>>,
  changed: Set<string>,
): void {
  for (const stockId of changed) {
    const data = stocks.get(stockId);
    if (!data) continue;
    tx.update(db.collection("stocks").doc(stockId), {
      colorVariants: data.colorVariants,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Create an online order and reserve its stock in one transaction.
 *
 * Throws (and writes nothing) if any line is short, so the caller can reject
 * the checkout before a payment is requested.
 */
export async function createOrderWithStockReservation(
  db: Firestore,
  orderId: string,
  orderData: Record<string, unknown>,
): Promise<{ reserved: boolean; expiresAt: string | null }> {
  const orderRef = db.collection("onlineOrders").doc(orderId);
  const lines = mergeLines(buildOrderLines(orderData));

  return db.runTransaction(async (tx) => {
    const stocks = await readStockDocs(tx, db, lines, { requireAll: true });
    const changed = new Set<string>();

    for (const line of lines) {
      const current = stocks.get(line.stockId) as Record<string, unknown>;
      stocks.set(line.stockId, decreaseStock(current, line));
      changed.add(line.stockId);
    }

    writeStockDocs(tx, db, stocks, changed);

    const now = new Date();
    const expiresAt =
      lines.length > 0
        ? new Date(now.getTime() + reservationTtlMs()).toISOString()
        : null;

    tx.set(orderRef, {
      ...orderData,
      ...(lines.length > 0
        ? {
            // `stockDeductedAt` is what the POS checks before putting stock
            // back on cancellation, so a cancelled reservation is restored too.
            stockDeductedAt: now.toISOString(),
            stockReservedAt: now.toISOString(),
            stockReservationExpiresAt: expiresAt,
            stockReservationStatus: "reserved",
          }
        : {}),
    });

    return { reserved: lines.length > 0, expiresAt };
  });
}

/**
 * Create a cash-on-delivery order, its POS transaction and take its stock,
 * all in one transaction.
 *
 * COD orders are committed sales from the moment they are placed (there is no
 * payment step that could fail), so the stock is deducted outright rather
 * than reserved. Both documents get `stockDeductedAt`, which is what the POS
 * checks before putting stock back when the order is cancelled, rejected or
 * returned. Throws, writing nothing, if any line is short.
 */
export async function createCodOrderWithStock(
  db: Firestore,
  params: {
    orderId: string;
    orderData: Record<string, unknown>;
    transactionData: Record<string, unknown>;
  },
): Promise<{ transactionDocId: string }> {
  const orderRef = db.collection("onlineOrders").doc(params.orderId);
  // Created outside the transaction so a retry reuses the same id.
  const transactionRef = db.collection("transactions").doc();
  const lines = mergeLines(buildOrderLines(params.orderData));

  await db.runTransaction(async (tx) => {
    const stocks = await readStockDocs(tx, db, lines, { requireAll: true });
    const changed = new Set<string>();

    for (const line of lines) {
      const current = stocks.get(line.stockId) as Record<string, unknown>;
      stocks.set(line.stockId, decreaseStock(current, line));
      changed.add(line.stockId);
    }

    writeStockDocs(tx, db, stocks, changed);

    const stockFields =
      lines.length > 0
        ? {
            stockDeductedAt: new Date().toISOString(),
            stockDeductionStatus: "applied",
          }
        : {};

    tx.set(transactionRef, { ...params.transactionData, ...stockFields });
    tx.set(orderRef, { ...params.orderData, ...stockFields });
  });

  return { transactionDocId: transactionRef.id };
}

/**
 * Put an unpaid order's reserved stock back. Safe to call repeatedly and from
 * several places at once: only the first call that finds the reservation
 * still held does anything.
 */
export async function releaseStockReservation(
  db: Firestore,
  orderId: string,
  reason: string,
): Promise<{ released: boolean; reason?: string }> {
  const orderRef = db.collection("onlineOrders").doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return { released: false, reason: "order_not_found" };

    const order = (orderSnap.data() || {}) as Record<string, unknown>;
    if (order.stockReservationStatus !== "reserved") {
      return { released: false, reason: "not_reserved" };
    }
    if (!order.stockDeductedAt || order.stockRestoredAt) {
      return { released: false, reason: "not_held" };
    }
    // Money has moved, so this stock belongs to a sale now.
    if (isSettledPaymentStatus(order.paymentStatus)) {
      return { released: false, reason: "payment_settled" };
    }

    const lines = mergeLines(buildOrderLines(order));
    const stocks = await readStockDocs(tx, db, lines, { requireAll: false });
    const changed = new Set<string>();

    for (const line of lines) {
      const current = stocks.get(line.stockId);
      if (!current) {
        console.warn(`Release ${orderId}: stock ${line.stockId} no longer exists`);
        continue;
      }
      const next = increaseStock(current, line);
      if (!next) {
        console.warn(`Release ${orderId}: no variant to return ${describeLine(line)} to`);
        continue;
      }
      stocks.set(line.stockId, next);
      changed.add(line.stockId);
    }

    writeStockDocs(tx, db, stocks, changed);

    // `updatedAt` is left alone on purpose: it drives the owner's ordering of
    // online orders, and an abandoned checkout tidying up is not news.
    tx.set(
      orderRef,
      {
        stockReservationStatus: "released",
        stockRestoredAt: new Date().toISOString(),
        stockReleaseReason: reason,
      },
      { merge: true },
    );

    return { released: true };
  });
}

/**
 * Release reservations nobody is going to pay for.
 *
 * - Any reservation past `stockReservationExpiresAt`.
 * - When `customerUid` is given, that customer's own reservations whose QR
 *   window has closed. A customer whose QR expired and who asks for a new one
 *   would otherwise be blocked by their own earlier reservation on the last
 *   unit.
 *
 * Called at the start of every create-order and by the release-expired cron
 * route. Best-effort: failures are logged, never thrown.
 */
export async function releaseStaleReservations(
  db: Firestore,
  options: { customerUid?: string } = {},
): Promise<{ checked: number; released: number }> {
  // Single-field equality query, so no composite index is needed. Live
  // reservations only exist for a few minutes, so this set stays small.
  const snap = await db
    .collection("onlineOrders")
    .where("stockReservationStatus", "==", "reserved")
    .limit(200)
    .get();

  const now = Date.now();
  let released = 0;

  for (const docSnap of snap.docs) {
    const order = docSnap.data() as Record<string, unknown>;
    if (isSettledPaymentStatus(order.paymentStatus)) continue;

    const expiresAt = Date.parse(String(order.stockReservationExpiresAt || ""));
    const reservedAt = Date.parse(String(order.stockReservedAt || ""));
    const customer = (order.customer || {}) as Record<string, unknown>;

    const hardExpired = Number.isFinite(expiresAt) && expiresAt <= now;
    const ownQrLapsed =
      !!options.customerUid &&
      customer.uid === options.customerUid &&
      Number.isFinite(reservedAt) &&
      reservedAt + QR_WINDOW_MS <= now;

    if (!hardExpired && !ownQrLapsed) continue;

    try {
      const result = await releaseStockReservation(
        db,
        docSnap.id,
        hardExpired ? "reservation_expired" : "replaced_by_new_checkout",
      );
      if (result.released) released += 1;
    } catch (error) {
      console.error(`Failed to release reservation for ${docSnap.id}:`, error);
    }
  }

  return { checked: snap.size, released };
}

/**
 * Settle a paid order's stock.
 *
 * - Reserved and still held: the reservation simply becomes the sale.
 * - Released before the payment arrived (late payment, or cancelled in the
 *   POS while unpaid): take the stock again now, which can fail if it has
 *   since sold — the caller marks the order `stock_conflict`.
 * - Older orders created before reservations existed: deduct as before.
 *
 * Idempotent: a repeated SUCCESS callback finds the order committed and does
 * nothing.
 */
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

    const reservationStatus = orderData.stockReservationStatus;
    const isHeld = !!orderData.stockDeductedAt && !orderData.stockRestoredAt;
    const nowIso = new Date().toISOString();

    if (reservationStatus === "reserved" && isHeld) {
      tx.set(
        orderRef,
        {
          stockReservationStatus: "committed",
          stockCommittedAt: nowIso,
          stockDeductionStatus: "applied",
          stockDeductionError: FieldValue.delete(),
          updatedAt: nowIso,
        },
        { merge: true },
      );
      return { applied: true, reason: "reservation_committed" };
    }

    const mustTakeAgain =
      reservationStatus === "released" ||
      (reservationStatus === "reserved" && !isHeld);

    // Committed orders, and legacy orders already deducted, are done. A
    // committed order that was later cancelled or refunded in the POS also
    // lands here, so a repeated callback cannot take its stock a second time.
    if (!mustTakeAgain && orderData.stockDeductedAt) {
      return { applied: false, reason: "already_applied" };
    }

    const lines = mergeLines(buildOrderLines(orderData));
    if (lines.length === 0) {
      tx.set(
        orderRef,
        {
          stockDeductedAt: nowIso,
          stockDeductionStatus: "skipped",
          stockDeductionReason: "no_items",
          updatedAt: nowIso,
        },
        { merge: true },
      );
      return { applied: false, reason: "no_items" };
    }

    const stocks = await readStockDocs(tx, db, lines, { requireAll: true });
    const changed = new Set<string>();

    for (const line of lines) {
      const current = stocks.get(line.stockId) as Record<string, unknown>;
      stocks.set(line.stockId, decreaseStock(current, line));
      changed.add(line.stockId);
    }

    writeStockDocs(tx, db, stocks, changed);

    tx.set(
      orderRef,
      {
        stockDeductedAt: nowIso,
        stockRestoredAt: FieldValue.delete(),
        // The POS returns ledger described the stock taken before; this is a
        // fresh deduction, so start it again.
        stockReturnLedger: FieldValue.delete(),
        ...(reservationStatus
          ? { stockReservationStatus: "committed", stockCommittedAt: nowIso }
          : {}),
        stockDeductionStatus: "applied",
        stockDeductionError: FieldValue.delete(),
        updatedAt: nowIso,
      },
      { merge: true },
    );

    return { applied: true };
  });
}
