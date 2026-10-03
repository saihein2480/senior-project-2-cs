import { FieldValue, Firestore, Transaction } from "firebase-admin/firestore";
import { isSettledPaymentStatus, orderStatusFor } from "./mmpayCallback";

/**
 * Stock bookkeeping for online orders.
 *
 * Lifecycle of a MyanMyanPay (QR) order's stock:
 *
 *   create-order  -> reserved   stock taken off the shelf, and the coupon and
 *                               the customer's one open-checkout slot held,
 *                               in the same transaction that creates the order
 *   SUCCESS       -> committed  the reservation becomes the sale
 *   FAILED/EXPIRED callback, reservation past its expiry (order-status poll,
 *   next checkout, cron), replaced by a newer checkout, gateway error
 *                 -> released   stock put back (stockRestoredAt set), coupon
 *                               and slot freed; expiry marks it EXPIRED
 *
 * The reservation is what stops two buyers paying for the last unit: the
 * second checkout fails at create-order, before anyone is charged, instead of
 * at the payment callback after the money has moved.
 *
 * Every write here runs in a transaction that reads the stock documents first
 * and applies changes to what is stored at that moment, so it cannot erase a
 * concurrent POS sale or owner restock (the POS does the same on its side).
 */

/**
 * The order cannot be satisfied from the stock on file: an item, variant or
 * size is missing, or there is not enough of it.
 *
 * Distinguishes "the shelf is short" (a business outcome the caller reports)
 * from infrastructure failures such as a Firestore timeout, which surface as
 * the SDK's own errors and are worth retrying. Messages are unchanged from
 * when these were plain `Error`s.
 */
export class StockShortageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockShortageError";
  }
}

export function isStockShortageError(error: unknown): error is StockShortageError {
  return error instanceof StockShortageError;
}

export type StockRequestLine = {
  stockId: string;
  variantId?: string;
  color?: string;
  size?: string;
  quantity: number;
  itemLabel?: string;
};

export type StockVariant = {
  id?: string;
  color?: string;
  image?: string;
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

/** A variant's own id, trimmed; "" when it has none (legacy documents). */
function variantIdOf(variant: StockVariant): string {
  const raw = (variant as { id?: unknown }).id;
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

function variantHasLineSize(variant: StockVariant, line: StockRequestLine): boolean {
  const sizes = Array.isArray(variant.sizeQuantities) ? variant.sizeQuantities : [];
  return resolveSizeIndex(sizes, line) >= 0;
}

/**
 * Which variant of a stock document an order line means, or -1 when that
 * cannot be said for certain. Exported so order pricing resolves the same
 * variant the stock reservation will deduct from.
 *
 * Strict on purpose: a guess takes stock from (or returns it to) a garment the
 * customer did not buy, and the count is then wrong on two variants. In order:
 *
 * 1. The line's variant id equals a variant's id. The id is authoritative; the
 *    colour label may have been renamed since.
 * 2. Legacy lines and documents, by colour name (trimmed, case-insensitive) on
 *    a variant that has the line's size, and only when exactly one qualifies:
 *    - a line with no variant id may match any variant;
 *    - a line whose variant id matches no id may only match a variant that has
 *      no id itself. Older stock documents have id-less variants, for which the
 *      storefront sends the colour name or the array index in place of an id
 *      (`v.id ?? v.color ?? index`). A variant that has an id is reachable only
 *      through that id.
 *    An array index is honoured only for such an id-less variant whose colour
 *    matches too.
 *
 * Never "size only", "first colour match" or "the only variant": those used to
 * deduct from the wrong colour.
 */
export function resolveVariantIndex(
  variants: StockVariant[],
  line: StockRequestLine,
): number {
  const wantedId = String(line.variantId ?? "").trim();
  const colorHint = normalize(line.color);

  if (wantedId) {
    const byId = variants
      .map((variant, index) => (variantIdOf(variant) === wantedId ? index : -1))
      .filter((index) => index >= 0);

    if (byId.length === 1) return byId[0];
    if (byId.length > 1) {
      // Duplicate ids: only the colour can tell them apart.
      const byColor = byId.filter(
        (index) => normalize(variants[index].color) === colorHint,
      );
      return byColor.length === 1 ? byColor[0] : -1;
    }
  }

  const candidates = variants
    .map((_, index) => index)
    .filter((index) => {
      const variant = variants[index];
      if (wantedId && variantIdOf(variant)) return false;
      return (
        normalize(variant.color) === colorHint &&
        variantHasLineSize(variant, line)
      );
    });

  // An in-range number is a claim about one position: that variant or none.
  if (wantedId && /^\d+$/.test(wantedId) && Number(wantedId) < variants.length) {
    const asIndex = Number(wantedId);
    return candidates.includes(asIndex) ? asIndex : -1;
  }

  return candidates.length === 1 ? candidates[0] : -1;
}

export function resolveSizeIndex(
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

/** "Name (Colour / Size)", for messages the customer reads. */
function customerLabel(line: StockRequestLine): string {
  const detail = [line.color, line.size].filter(Boolean).join(" / ");
  return `${line.itemLabel || "An item in your order"}${detail ? ` (${detail})` : ""}`;
}

/** The order names a variant or size this product does not (or no longer) have. */
function unmatchedVariantError(line: StockRequestLine): StockShortageError {
  return new StockShortageError(
    `${customerLabel(line)} is no longer available in that colour and size. Please remove it from your cart and add it again.`,
  );
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
    console.warn(`Stock variants missing for ${describeLine(line)}`);
    throw unmatchedVariantError(line);
  }

  // No guessing (see resolveVariantIndex): an unmatched line fails the whole
  // order instead of taking stock from a different colour. The stock detail
  // goes to the log; the customer gets the item's name.
  const variantIndex = resolveVariantIndex(variants, line);
  if (variantIndex < 0) {
    console.warn(
      `Variant not matched for ${describeLine(line)} (variantId=${line.variantId || "-"}). Available: ${describeAvailableVariants(variants)}`,
    );
    throw unmatchedVariantError(line);
  }

  const variant = variants[variantIndex];
  const sizeQuantities = Array.isArray(variant.sizeQuantities)
    ? variant.sizeQuantities
    : [];
  const sizeIndex = resolveSizeIndex(sizeQuantities, line);
  if (sizeIndex < 0) {
    console.warn(
      `Size not matched for ${describeLine(line)}. Available: ${describeAvailableVariants([variant])}`,
    );
    throw unmatchedVariantError(line);
  }

  const available = Number(sizeQuantities[sizeIndex]?.quantity || 0);
  if (available < line.quantity) {
    throw new StockShortageError(
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
 * Put `line.quantity` back. Returns null when the variant cannot be matched
 * exactly (the owner deleted or re-made it), since there is nowhere certain to
 * put it; the caller skips the line rather than restock a different colour.
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
      throw new StockShortageError(
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
 * The checkout cannot go ahead for a reason other than stock: the customer
 * already has a QR payment open, or the coupon is held by one. A 409 for the
 * customer, like a stock shortage.
 */
export class CheckoutConflictError extends Error {
  constructor(
    message: string,
    readonly code: "checkout_in_progress" | "coupon_unavailable",
  ) {
    super(message);
    this.name = "CheckoutConflictError";
  }
}

export function isCheckoutConflictError(
  error: unknown,
): error is CheckoutConflictError {
  return error instanceof CheckoutConflictError;
}

function toMillis(value: unknown): number {
  if (!value) return NaN;
  if (typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  return Date.parse(String(value));
}

/** A MyanMyanPay (QR) order, as opposed to cash on delivery. */
function isQrOrder(order: Record<string, unknown>): boolean {
  const method = String(order.paymentMethod || "").toLowerCase();
  if (method === "cod") return false;
  return String(order.provider || "").toUpperCase() === "MMPAY" || method === "scan";
}

/**
 * When an unpaid QR order's reservation runs out: `stockReservationExpiresAt`,
 * or for orders written without it, `createdAt` plus the configured TTL.
 */
function reservationExpiryMs(order: Record<string, unknown>): number {
  const explicit = toMillis(order.stockReservationExpiresAt);
  if (Number.isFinite(explicit)) return explicit;
  const created = toMillis(order.createdAt);
  return Number.isFinite(created) ? created + reservationTtlMs() : NaN;
}

/**
 * True for an unpaid QR order whose reservation has run out. Never true for
 * COD orders, paid or refunded orders, or orders parked for the owner.
 */
export function isPastReservationExpiry(
  order: Record<string, unknown>,
  now: number = Date.now(),
): boolean {
  if (!isQrOrder(order)) return false;
  if (isSettledPaymentStatus(order.paymentStatus)) return false;
  if (order.status === "payment_review" || order.status === "stock_conflict") {
    return false;
  }
  const expiresAt = reservationExpiryMs(order);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

/** The order still has stock off the shelf for itself. */
function holdsReservedStock(order: Record<string, unknown>): boolean {
  return (
    order.stockReservationStatus === "reserved" &&
    !!order.stockDeductedAt &&
    !order.stockRestoredAt &&
    // The POS has started returning lines through its ledger; it finishes
    // the job (and sets stockRestoredAt), so returning them here too would
    // count them twice.
    !order.stockReturnLedger
  );
}

/** An unpaid QR checkout that is still open: holding stock and not expired. */
function isOpenQrCheckout(
  order: Record<string, unknown> | null | undefined,
  now: number,
): boolean {
  if (!order || !holdsReservedStock(order)) return false;
  if (isSettledPaymentStatus(order.paymentStatus)) return false;
  if (order.status === "payment_review" || order.status === "stock_conflict") {
    return false;
  }
  const expiresAt = reservationExpiryMs(order);
  return !(Number.isFinite(expiresAt) && expiresAt <= now);
}

/**
 * Customer-document fields that tie a coupon and the customer's "one open QR
 * checkout" slot to an unpaid order. Written by create-order, cleared on
 * release, and the coupon's are cleared when it is used.
 *
 *   customers/{uid}.activeQrOrder              { orderId, expiresAt }
 *   customers/{uid}.coupons[i].reservedForOrderId, .reservedUntil
 *
 * Server-only fields: firestore.rules (customerSelfFields) does not let a
 * browser write them.
 */
function holdUpdatesOnRelease(
  customer: Record<string, unknown>,
  orderId: string,
): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};

  const active = customer.activeQrOrder as { orderId?: unknown } | undefined;
  if (active && typeof active === "object" && active.orderId === orderId) {
    update.activeQrOrder = FieldValue.delete();
  }

  if (Array.isArray(customer.coupons)) {
    let changed = false;
    const coupons = (customer.coupons as unknown[]).map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const coupon = entry as Record<string, unknown>;
      if (coupon.reservedForOrderId !== orderId) return entry;
      changed = true;
      const freed = { ...coupon };
      delete freed.reservedForOrderId;
      delete freed.reservedUntil;
      return freed;
    });
    if (changed) update.coupons = coupons;
  }

  return Object.keys(update).length > 0 ? update : null;
}

/** Who the QR order is for, and which of their coupons it applies. */
export type ReservationHolder = {
  customerUid: string;
  couponId?: string | null;
};

/**
 * Create an online order and reserve its stock in one transaction.
 *
 * With a `holder`, the same transaction also:
 * - refuses the order if the customer still has another QR checkout open (the
 *   route releases their previous one first, so this only trips on two
 *   create-order calls racing each other), and records this one as their
 *   open checkout;
 * - holds the coupon for this order, refusing it if it is no longer active or
 *   another open order holds it. Released with the stock; consumed on payment.
 *
 * Throws (and writes nothing) if any line is short (`StockShortageError`) or
 * on either conflict (`CheckoutConflictError`), so the caller can reject the
 * checkout before a payment is requested.
 */
export async function createOrderWithStockReservation(
  db: Firestore,
  orderId: string,
  orderData: Record<string, unknown>,
  holder?: ReservationHolder,
): Promise<{ reserved: boolean; expiresAt: string | null }> {
  const orderRef = db.collection("onlineOrders").doc(orderId);
  const customerRef = holder?.customerUid
    ? db.collection("customers").doc(holder.customerUid)
    : null;
  const couponId = holder?.couponId ? String(holder.couponId) : "";
  const lines = mergeLines(buildOrderLines(orderData));

  return db.runTransaction(async (tx) => {
    // Every read before the first write.
    const [stocks, customerSnap] = await Promise.all([
      readStockDocs(tx, db, lines, { requireAll: true }),
      customerRef ? tx.get(customerRef) : Promise.resolve(null),
    ]);
    const customer = customerSnap?.exists
      ? ((customerSnap.data() || {}) as Record<string, unknown>)
      : null;

    const nowDate = new Date();
    const now = nowDate.getTime();
    const expiresAt =
      lines.length > 0
        ? new Date(now + reservationTtlMs()).toISOString()
        : null;

    const coupons = Array.isArray(customer?.coupons)
      ? [...(customer.coupons as Array<Record<string, unknown>>)]
      : [];
    const couponIndex = couponId
      ? coupons.findIndex((c) => c && c.id === couponId)
      : -1;
    const coupon = couponIndex >= 0 ? coupons[couponIndex] : null;

    // The orders that may still be holding this customer's slot or coupon.
    const activeOrderId = String(
      (customer?.activeQrOrder as { orderId?: unknown } | undefined)?.orderId || "",
    );
    const couponHolderId = String(coupon?.reservedForOrderId || "");
    const otherIds = Array.from(
      new Set([activeOrderId, couponHolderId].filter((id) => id && id !== orderId)),
    );
    const otherSnaps = await Promise.all(
      otherIds.map((id) => tx.get(db.collection("onlineOrders").doc(id))),
    );
    const otherOrders = new Map(
      otherSnaps.map((snap, index) => [
        otherIds[index],
        snap.exists ? ((snap.data() || {}) as Record<string, unknown>) : null,
      ]),
    );

    if (
      activeOrderId &&
      activeOrderId !== orderId &&
      isOpenQrCheckout(otherOrders.get(activeOrderId), now)
    ) {
      throw new CheckoutConflictError(
        "You already have a QR payment open. Please finish it or wait a moment, then try again.",
        "checkout_in_progress",
      );
    }

    if (couponId) {
      const expiresAtMs = coupon ? toMillis(coupon.expiresAt) : NaN;
      const usable =
        !!coupon &&
        coupon.status === "active" &&
        !(Number.isFinite(expiresAtMs) && expiresAtMs < now);
      if (!usable) {
        throw new CheckoutConflictError(
          "This coupon can no longer be used. Please remove it and try again.",
          "coupon_unavailable",
        );
      }
      if (
        couponHolderId &&
        couponHolderId !== orderId &&
        isOpenQrCheckout(otherOrders.get(couponHolderId), now)
      ) {
        throw new CheckoutConflictError(
          "This coupon is held by another payment that is still open. Please finish that payment or wait a few minutes, then try again.",
          "coupon_unavailable",
        );
      }
    }

    const changed = new Set<string>();
    for (const line of lines) {
      const current = stocks.get(line.stockId) as Record<string, unknown>;
      stocks.set(line.stockId, decreaseStock(current, line));
      changed.add(line.stockId);
    }

    writeStockDocs(tx, db, stocks, changed);

    tx.set(orderRef, {
      ...orderData,
      ...(lines.length > 0
        ? {
            // `stockDeductedAt` is what the POS checks before putting stock
            // back on cancellation, so a cancelled reservation is restored too.
            stockDeductedAt: nowDate.toISOString(),
            stockReservedAt: nowDate.toISOString(),
            stockReservationExpiresAt: expiresAt,
            stockReservationStatus: "reserved",
          }
        : {}),
    });

    if (customerRef && customer) {
      const customerUpdate: Record<string, unknown> = {
        activeQrOrder: { orderId, expiresAt },
      };
      if (coupon && couponIndex >= 0) {
        coupons[couponIndex] = {
          ...coupon,
          reservedForOrderId: orderId,
          reservedUntil: expiresAt,
        };
        customerUpdate.coupons = coupons;
      }
      tx.update(customerRef, customerUpdate);
    }

    return { reserved: lines.length > 0, expiresAt };
  });
}

/** Receipt number format shared with the POS: `TXN-` + 13-digit counter. */
export function formatTransactionNumber(count: number): string {
  return `TXN-${count.toString().padStart(13, "0")}`;
}

/**
 * Create a cash-on-delivery order, its POS transaction and take its stock,
 * all in one transaction — including the receipt number.
 *
 * COD orders are committed sales from the moment they are placed (there is no
 * payment step that could fail), so the stock is deducted outright rather
 * than reserved. Both documents get `stockDeductedAt`, which is what the POS
 * checks before putting stock back when the order is cancelled, rejected or
 * returned.
 *
 * The sequential receipt number (`counters/transactionCounter`) is allocated
 * in the same transaction, so a checkout that fails on stock does not burn a
 * number, and there is no fallback id: if this throws, nothing was written.
 * The number is stored as `transactionId` on both documents.
 *
 * Throws `StockShortageError` if any line is short; any other error is an
 * infrastructure failure (e.g. contention on the counter) worth retrying.
 */
export async function createCodOrderWithStock(
  db: Firestore,
  params: {
    orderId: string;
    orderData: Record<string, unknown>;
    transactionData: Record<string, unknown>;
  },
): Promise<{ transactionDocId: string; transactionId: string }> {
  const orderRef = db.collection("onlineOrders").doc(params.orderId);
  const counterRef = db.collection("counters").doc("transactionCounter");
  // Created outside the transaction so a retry reuses the same id.
  const transactionRef = db.collection("transactions").doc();
  const lines = mergeLines(buildOrderLines(params.orderData));

  const transactionId = await db.runTransaction(async (tx) => {
    // Every read before the first write, as transactions require.
    const [counterSnap, stocks] = await Promise.all([
      tx.get(counterRef),
      readStockDocs(tx, db, lines, { requireAll: true }),
    ]);
    const changed = new Set<string>();

    for (const line of lines) {
      const current = stocks.get(line.stockId) as Record<string, unknown>;
      stocks.set(line.stockId, decreaseStock(current, line));
      changed.add(line.stockId);
    }

    const previousCount = counterSnap.exists
      ? Number(counterSnap.data()?.count || 0)
      : 0;
    if (!Number.isFinite(previousCount) || previousCount < 0) {
      throw new Error(`Invalid transaction counter value: ${previousCount}`);
    }
    const nextCount = Math.floor(previousCount) + 1;
    const receiptNumber = formatTransactionNumber(nextCount);

    tx.set(
      counterRef,
      { count: nextCount, lastUpdated: FieldValue.serverTimestamp() },
      { merge: true },
    );

    writeStockDocs(tx, db, stocks, changed);

    const stockFields =
      lines.length > 0
        ? {
            stockDeductedAt: new Date().toISOString(),
            stockDeductionStatus: "applied",
          }
        : {};

    tx.set(transactionRef, {
      ...params.transactionData,
      transactionId: receiptNumber,
      ...stockFields,
    });
    tx.set(orderRef, {
      ...params.orderData,
      transactionId: receiptNumber,
      ...stockFields,
    });

    return receiptNumber;
  });

  return { transactionDocId: transactionRef.id, transactionId };
}

export type ReleaseResult = {
  /** Stock was put back by this call. */
  released: boolean;
  /** This call marked the order's payment EXPIRED. */
  expired: boolean;
  reason?: string;
};

/**
 * Give up an unpaid QR order: put its reserved stock back and free the
 * customer's coupon and open-checkout slot, in one transaction.
 *
 * Safe to call repeatedly and from several places at once: the stock goes back
 * only while the order still holds it (`stockReservationStatus: "reserved"`,
 * `stockDeductedAt` without `stockRestoredAt`, no POS `stockReturnLedger`),
 * and nothing happens once money has moved or the order is parked for the
 * owner. Lines whose variant cannot be matched exactly are skipped, never
 * returned to a different variant.
 *
 * Options:
 * - `markExpired`: also record the payment as EXPIRED (as MyanMyanPay's own
 *   EXPIRED callback does) if it is still PENDING. A SUCCESS that arrives
 *   later is still applied: EXPIRED is not a settled state, and the paid order
 *   takes its stock again or is recorded as a stock conflict
 *   (deductStockForPaidOnlineOrder / the webhook).
 * - `onlyIfExpired`: do nothing unless the reservation has run out at `now`.
 */
export async function releaseStockReservation(
  db: Firestore,
  orderId: string,
  reason: string,
  options: { markExpired?: boolean; onlyIfExpired?: boolean; now?: number } = {},
): Promise<ReleaseResult> {
  const orderRef = db.collection("onlineOrders").doc(orderId);
  const skip = (why: string): ReleaseResult => ({
    released: false,
    expired: false,
    reason: why,
  });

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return skip("order_not_found");

    const order = (orderSnap.data() || {}) as Record<string, unknown>;
    const now = options.now ?? Date.now();

    if (!isQrOrder(order)) return skip("not_qr_order");
    // Money has moved, so this stock belongs to a sale now.
    if (isSettledPaymentStatus(order.paymentStatus)) return skip("payment_settled");
    // Money moved for the wrong amount, or a paid order is short of stock:
    // the owner decides what happens to it.
    if (order.status === "payment_review" || order.status === "stock_conflict") {
      return skip(String(order.status));
    }
    if (options.onlyIfExpired && !isPastReservationExpiry(order, now)) {
      return skip("not_expired");
    }

    const returnStock = holdsReservedStock(order);
    const lines = returnStock ? mergeLines(buildOrderLines(order)) : [];
    const customerUid = (order.customer as { uid?: unknown } | undefined)?.uid;
    const customerRef =
      typeof customerUid === "string" && customerUid && !customerUid.includes("/")
        ? db.collection("customers").doc(customerUid)
        : null;

    // Every read before the first write.
    const [stocks, customerSnap] = await Promise.all([
      returnStock
        ? readStockDocs(tx, db, lines, { requireAll: false })
        : Promise.resolve(new Map<string, Record<string, unknown>>()),
      customerRef ? tx.get(customerRef) : Promise.resolve(null),
    ]);

    if (returnStock) {
      const changed = new Set<string>();
      for (const line of lines) {
        const current = stocks.get(line.stockId);
        if (!current) {
          console.warn(`Release ${orderId}: stock ${line.stockId} no longer exists`);
          continue;
        }
        const next = increaseStock(current, line);
        if (!next) {
          console.warn(`Release ${orderId}: no exact variant to return ${describeLine(line)} to; skipped`);
          continue;
        }
        stocks.set(line.stockId, next);
        changed.add(line.stockId);
      }
      writeStockDocs(tx, db, stocks, changed);
    }

    // The coupon and the open-checkout slot go back with the stock.
    if (customerRef && customerSnap?.exists) {
      const holds = holdUpdatesOnRelease(
        (customerSnap.data() || {}) as Record<string, unknown>,
        orderId,
      );
      if (holds) tx.update(customerRef, holds);
    }

    const paymentStatus = String(order.paymentStatus || "PENDING").toUpperCase();
    const markExpired = !!options.markExpired && paymentStatus === "PENDING";
    const nowIso = new Date(now).toISOString();

    // `updatedAt` is left alone on purpose: it drives the owner's ordering of
    // online orders, and an abandoned checkout tidying up is not news.
    const orderUpdate: Record<string, unknown> = {
      ...(returnStock
        ? {
            stockReservationStatus: "released",
            stockRestoredAt: nowIso,
            stockReleaseReason: reason,
          }
        : {}),
      ...(markExpired
        ? {
            paymentStatus: "EXPIRED",
            status: orderStatusFor("EXPIRED"),
            paymentExpiredAt: nowIso,
            paymentExpiredReason: reason,
          }
        : {}),
    };
    if (Object.keys(orderUpdate).length > 0) {
      tx.set(orderRef, orderUpdate, { merge: true });
    }

    return {
      released: returnStock,
      expired: markExpired,
      ...(returnStock ? {} : { reason: "not_held" }),
    };
  });
}

/**
 * Expire an unpaid QR order whose reservation has run out: stock, coupon and
 * open-checkout slot back, payment marked EXPIRED. A no-op for anything else
 * (not yet expired, paid, COD, parked for the owner, already released).
 */
export async function expireUnpaidOrder(
  db: Firestore,
  orderId: string,
  now: number = Date.now(),
): Promise<ReleaseResult> {
  return releaseStockReservation(db, orderId, "reservation_expired", {
    markExpired: true,
    onlyIfExpired: true,
    now,
  });
}

/** gRPC FAILED_PRECONDITION: the query needs a composite index. */
function isMissingIndexError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 9 || code === "failed-precondition";
}

/**
 * Ids of reservations that have run out, oldest first.
 *
 * Needs the composite index onlineOrders (stockReservationStatus ASC,
 * stockReservationExpiresAt ASC). Until it is deployed the query fails with
 * FAILED_PRECONDITION and this falls back to an equality-only scan, which
 * needs no composite index but may miss some once many reservations are live.
 */
async function findExpiredReservationIds(
  db: Firestore,
  now: number,
  limit: number,
): Promise<string[]> {
  const orders = db.collection("onlineOrders");
  // Some "reserved" orders are not for release (paid, parked for the owner),
  // and being the oldest they would fill every batch; step past them, a few
  // pages at most.
  const releasable = (data: Record<string, unknown>) =>
    holdsReservedStock(data) && isPastReservationExpiry(data, now);
  try {
    const base = orders
      .where("stockReservationStatus", "==", "reserved")
      .where("stockReservationExpiresAt", "<=", new Date(now).toISOString())
      .orderBy("stockReservationExpiresAt")
      .limit(limit);
    const ids: string[] = [];
    let page = await base.get();
    for (let pages = 1; ; pages += 1) {
      for (const doc of page.docs) {
        if (ids.length < limit && releasable(doc.data() as Record<string, unknown>)) {
          ids.push(doc.id);
        }
      }
      if (ids.length >= limit || page.size < limit || pages >= 5) break;
      page = await base.startAfter(page.docs[page.docs.length - 1]).get();
    }
    return ids;
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn(
      "Expired-reservation sweep: composite index onlineOrders(stockReservationStatus, stockReservationExpiresAt) is missing; using a slower scan.",
    );
    const snap = await orders
      .where("stockReservationStatus", "==", "reserved")
      .limit(Math.max(limit, 100))
      .get();
    return snap.docs
      .filter((doc) => releasable(doc.data() as Record<string, unknown>))
      .slice(0, limit)
      .map((doc) => doc.id);
  }
}

/** Expired reservations a checkout releases on its way through. */
export const CHECKOUT_SWEEP_BATCH = 20;

/**
 * Release reservations nobody is going to pay for.
 *
 * - When `customerUid` is given, every unpaid QR order of that customer that
 *   still holds stock, expired or not. A customer has at most one open QR
 *   checkout: starting a new one (or placing a COD order) gives up the
 *   previous one, its stock and its coupon. A payment for the old QR that
 *   still arrives is applied as a late payment (stock taken again, or a stock
 *   conflict for the owner).
 * - Up to `globalLimit` (default CHECKOUT_SWEEP_BATCH) reservations of anyone
 *   that are past `stockReservationExpiresAt`, so stock comes back even when
 *   no scheduler calls /api/stock/release-expired.
 *
 * The customer query is equality-only (customer.uid, stockReservationStatus)
 * and needs no composite index; the global one does, see
 * findExpiredReservationIds. Everything released is marked EXPIRED.
 *
 * Called by create-order, create-cod and the release-expired cron route.
 * Best-effort: failures are logged, never thrown.
 */
export async function releaseStaleReservations(
  db: Firestore,
  options: { customerUid?: string; globalLimit?: number; now?: number } = {},
): Promise<{ checked: number; released: number }> {
  const now = options.now ?? Date.now();
  const seen = new Set<string>();
  let released = 0;

  const settle = async (orderId: string, run: () => Promise<ReleaseResult>) => {
    if (seen.has(orderId)) return;
    seen.add(orderId);
    try {
      const result = await run();
      if (result.released) released += 1;
    } catch (error) {
      console.error(`Failed to release reservation for ${orderId}:`, error);
    }
  };

  if (options.customerUid) {
    try {
      const own = await db
        .collection("onlineOrders")
        .where("customer.uid", "==", options.customerUid)
        .where("stockReservationStatus", "==", "reserved")
        .limit(CHECKOUT_SWEEP_BATCH)
        .get();
      for (const docSnap of own.docs) {
        const order = docSnap.data() as Record<string, unknown>;
        const reason = isPastReservationExpiry(order, now)
          ? "reservation_expired"
          : "replaced_by_new_checkout";
        await settle(docSnap.id, () =>
          releaseStockReservation(db, docSnap.id, reason, { markExpired: true, now }),
        );
      }
    } catch (error) {
      console.error("Failed to release the customer's open reservations:", error);
    }
  }

  const globalLimit = Math.max(
    0,
    Math.floor(options.globalLimit ?? CHECKOUT_SWEEP_BATCH),
  );
  if (globalLimit > 0) {
    let expiredIds: string[] = [];
    try {
      expiredIds = await findExpiredReservationIds(db, now, globalLimit);
    } catch (error) {
      console.error("Failed to look up expired reservations:", error);
    }
    for (const orderId of expiredIds) {
      await settle(orderId, () => expireUnpaidOrder(db, orderId, now));
    }
  }

  return { checked: seen.size, released };
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
