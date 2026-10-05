/**
 * What happens to a MyanMyanPay order once it is paid and its stock is taken:
 * the sales transaction, the coupon, the loyalty points and the saved cart.
 *
 * Shared by the live callback (`api/mmpay/webhook`) and the sandbox shortcut
 * (`api/mmpay/test-complete`) so both produce the same records. Every step is
 * idempotent, so the webhook can re-run them when MyanMyanPay repeats a
 * SUCCESS whose first delivery stopped half way:
 *
 * - the transaction is created with `create()` (one per order:
 *   `TXN-<orderId>`, see transactionDocIdFor);
 * - the coupon is consumed through CouponService.useCouponAdmin, which skips a
 *   coupon already marked used;
 * - points go through awardPointsForOnlinePayment, which writes the
 *   `loyaltyAward` marker in the same Firestore transaction as the credit and
 *   never awards when the marker exists;
 * - the cart clean-up stamps `cartCleanedAt` on the order in the same
 *   transaction that edits the cart.
 *
 * Server only: Admin SDK.
 */

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizeDeliveryFee } from "./deliveryFee";
import { awardPointsForOnlinePayment } from "./loyaltyService";

export type PaidOrderPayload = {
  orderId: string;
  amount: number;
  method?: string;
  vendor?: string;
  status: string;
  condition?: string;
  transactionRefId?: string;
};

/**
 * Id (document id and `transactionId`) of the sales transaction a paid QR
 * order creates: `TXN-` + our order id, e.g. `TXN-ONL-1790263939253-QY5O0V`.
 *
 * Derived from the order, not the gateway, so the live callback and the
 * sandbox shortcut name the sale the same way, and every SUCCESS delivery for
 * one order maps to one sale. MyanMyanPay's own reference is still kept on the
 * sale as `paymentMeta.transactionRefId`.
 */
export function transactionDocIdFor(payload: { orderId: string }): string {
  return `TXN-${payload.orderId}`;
}

/**
 * Id the sale was stored under before `transactionDocIdFor` existed:
 * MyanMyanPay's reference (sandbox: `TEST-<orderId>`), else the order id.
 */
function legacyTransactionDocIdFor(payload: {
  orderId: string;
  transactionRefId?: string;
}): string {
  const ref = payload.transactionRefId;
  return typeof ref === "string" && ref && !ref.includes("/")
    ? ref
    : payload.orderId;
}

/**
 * The sale document a SUCCESS callback refers to. Orders paid before the id
 * change already have their sale under the legacy id; a repeated delivery for
 * one of those must find it there rather than create a second sale under the
 * new id. No new legacy ids are ever written, so this read can sit outside the
 * callback's transaction.
 *
 * The legacy document only counts when it is this order's sale. Gateway
 * references are not unique per order (a manually confirmed payment arrived
 * as `MMPAY_MANUAL`), so under the old scheme a second order with the same
 * reference found the first order's sale and was never recorded.
 */
export async function resolveTransactionDocId(
  db: Firestore,
  payload: { orderId: string; transactionRefId?: string },
): Promise<string> {
  const current = transactionDocIdFor(payload);
  const legacy = legacyTransactionDocIdFor(payload);
  if (legacy === current) return current;

  const legacySnap = await db.collection("transactions").doc(legacy).get();
  const isThisOrdersSale =
    legacySnap.exists && legacySnap.get("onlineOrderId") === payload.orderId;
  return isThisOrdersSale ? legacy : current;
}

/**
 * Write the sales transaction for a paid online order.
 *
 * `create` fails if the document already exists: MyanMyanPay can deliver the
 * same SUCCESS twice at once, and with a get-then-set both copies could write.
 */
export async function recordOnlineSale(
  db: Firestore,
  payload: PaidOrderPayload,
  options: { transactionDocId: string; paymentMetaExtra?: Record<string, unknown> },
): Promise<"created" | "exists" | "no_order"> {
  const orderSnap = await db.collection("onlineOrders").doc(payload.orderId).get();
  if (!orderSnap.exists) return "no_order";

  const order = orderSnap.data() as Record<string, unknown>;
  const transactionId = options.transactionDocId;
  const transactionDocRef = db.collection("transactions").doc(transactionId);
  const existing = await transactionDocRef.get();
  if (existing.exists) return "exists";

  const product = (order.product || {}) as Record<string, unknown>;
  const cartItems = Array.isArray(order.cartItems)
    ? (order.cartItems as Array<Record<string, unknown>>)
    : [];

  const txItems =
    cartItems.length > 0
      ? cartItems.map((item, index) => ({
          id:
            (item.productId as string | undefined) ||
            `${payload.orderId}-${index + 1}`,
          stockId:
            (item.productId as string | undefined) ||
            `${payload.orderId}-${index + 1}`,
          groupName:
            (item.productName as string | undefined) || "Online Product",
          unitPrice: Number(item.priceTHB || 0),
          // The catalogue price when the line carries one. Older orders only
          // stored the charged price, so fall back to it rather than reporting
          // a saving that was never recorded.
          originalPrice: Number(item.originalPriceTHB || item.priceTHB || 0),
          lineDiscount: Number(item.lineDiscountTHB || 0),
          promotionId: (item.promotionId as string | undefined) || "",
          promotionName: (item.promotionName as string | undefined) || "",
          quantity: Number(item.quantity || 1),
          selectedColor: (item.color as string | undefined) || "",
          selectedSize: (item.size as string | undefined) || "",
          image: (item.image as string | undefined) || "",
          shop: "online",
        }))
      : [
          {
            id: (product.productId as string | undefined) || payload.orderId,
            stockId:
              (product.productId as string | undefined) || payload.orderId,
            groupName:
              (product.productName as string | undefined) || "Online Product",
            unitPrice: Number(product.priceTHB || 0),
            originalPrice: Number(
              product.originalPriceTHB || product.priceTHB || 0,
            ),
            lineDiscount: Number(product.lineDiscountTHB || 0),
            promotionId: (product.promotionId as string | undefined) || "",
            promotionName: (product.promotionName as string | undefined) || "",
            quantity: Number(product.quantity || 1),
            selectedColor: (product.color as string | undefined) || "",
            selectedSize: (product.size as string | undefined) || "",
            image: (product.image as string | undefined) || "",
            shop: "online",
          },
        ];

  // Use stored values from onlineOrders document (calculated at checkout)
  const subtotal =
    Number(order.subtotal || 0) ||
    txItems.reduce(
      (sum, item) =>
        sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
      0,
    );
  const tax = Number(order.tax || 0);
  const discount = Number(order.discount || 0);
  const couponDiscountTHB = Number(order.couponDiscountTHB || 0);
  const taxRate = Number(order.taxRate || 0);
  // Orders placed before delivery fees existed have none, which is 0.
  const deliveryFee = normalizeDeliveryFee(order.deliveryFee);
  const total =
    Number(order.total || 0) ||
    Math.max(0, subtotal - discount - couponDiscountTHB) + tax + deliveryFee;

  const orderExchangeRate = Number(order.exchangeRate || 0);
  const envExchangeRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
  const exchangeRate =
    orderExchangeRate > 0
      ? orderExchangeRate
      : Number.isFinite(envExchangeRate) && envExchangeRate > 0
        ? envExchangeRate
        : 0;

  const customer = (order.customer || {}) as Record<string, unknown>;

  try {
    await transactionDocRef.create({
      transactionId,
      source: "online",
      onlineOrderId: payload.orderId,
      customer: {
        uid: customer.uid ?? "",
        email: customer.email ?? "",
        displayName: (customer.displayName as string | undefined) || "Online Customer",
        phone: (customer.phone as string | undefined) || "",
        address: (customer.address as string | undefined) || "",
        customerType: "individual",
      },
      items: txItems,
      subtotal,
      tax,
      taxRate,
      discount,
      deliveryFee,
      // Named promotions, copied from the order so the invoice can report
      // which promotion applied rather than just a smaller number.
      appliedPromotions: Array.isArray(order.appliedPromotions)
        ? order.appliedPromotions
        : [],
      total,
      amountPaid: total,
      change: 0,
      paymentMethod: (order.paymentMethod as string | undefined) || "scan",
      timestamp: new Date().toISOString(),
      createdAt: new Date(),
      status: "completed",
      // The POS refund/sales reports group by branch, so online orders have
      // to carry one too. COD checkout already writes "Online Store"; match
      // it, but prefer a real branch if the order ever starts recording one.
      branchName: (order.branchName as string | undefined) || "Online Store",
      ...(order.shopId ? { shopId: order.shopId as string } : {}),
      sellingCurrency: "THB",
      ...(exchangeRate > 0 ? { exchangeRate } : {}),
      amountMmk: Number(order.amountMmk || payload.amount || 0),
      sellingTotal: Number(order.amountMmk || payload.amount || 0),
      paymentProvider: "MMPAY",
      orderSource: "web_storefront",
      customerUid: customer.uid ?? "",
      ...(order.couponCode
        ? {
            couponCode: order.couponCode,
            appliedCouponCode: order.couponCode,
            couponId: order.couponId ?? "",
            couponDiscountTHB,
          }
        : {}),
      // Optional in the callback; Firestore rejects `undefined`, which would
      // fail the callback on every retry.
      paymentMeta: {
        method: payload.method ?? "",
        vendor: payload.vendor ?? "",
        status: payload.status,
        condition: payload.condition ?? "",
        transactionRefId: payload.transactionRefId || "",
        ...(options.paymentMetaExtra || {}),
      },
    });
  } catch (error) {
    // gRPC ALREADY_EXISTS: another delivery of this callback recorded it.
    const code = (error as { code?: unknown })?.code;
    if (code === 6 || code === "already-exists") return "exists";
    throw error;
  }

  return "created";
}

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export type CartLine = Record<string, unknown>;

type PurchasedLine = {
  productId: string;
  variantId: string;
  color: string;
  size: string;
  quantity: number;
};

function purchasedLines(order: Record<string, unknown>): PurchasedLine[] {
  const raw = Array.isArray(order.cartItems)
    ? (order.cartItems as Array<Record<string, unknown>>)
    : order.product && typeof order.product === "object"
      ? [order.product as Record<string, unknown>]
      : [];

  return raw
    .map((line) => ({
      productId: String(line.productId || "").trim(),
      variantId: String(line.variantId || "").trim(),
      color: String(line.color || ""),
      size: String(line.size || ""),
      quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
    }))
    .filter((line) => line.productId && line.quantity > 0);
}

/** Is this saved-cart line the garment that was bought? */
function isSameGarment(cartLine: CartLine, bought: PurchasedLine): boolean {
  if (String(cartLine.productId || "").trim() !== bought.productId) return false;
  if (norm(cartLine.size) !== norm(bought.size)) return false;

  const cartVariant = String(cartLine.variantId || "").trim();
  if (cartVariant && bought.variantId) return cartVariant === bought.variantId;

  // A line without a variant id (legacy) matches on colour.
  const cartColor = norm(cartLine.color);
  return !!cartColor && cartColor === norm(bought.color);
}

/**
 * The saved cart with what an order bought taken out: each bought line takes
 * its quantity off the matching cart lines, and lines that reach 0 go.
 * Anything not bought, or added on top, stays. Pure, for testing.
 */
export function subtractPurchasedLines(
  cart: CartLine[],
  bought: PurchasedLine[],
): { cart: CartLine[]; removedUnits: number } {
  const next = cart.map((line) => ({ ...line }));
  let removedUnits = 0;

  for (const line of bought) {
    let remaining = line.quantity;
    for (const cartLine of next) {
      if (remaining <= 0) break;
      if (!isSameGarment(cartLine, line)) continue;
      const have = Math.max(0, Math.floor(Number(cartLine.quantity) || 0));
      const take = Math.min(have, remaining);
      cartLine.quantity = have - take;
      remaining -= take;
      removedUnits += take;
    }
  }

  return {
    cart: next.filter((line) => Number(line.quantity) > 0),
    removedUnits,
  };
}

/**
 * Take a paid order's lines out of the customer's saved cart
 * (`customers/{uid}.cartItems`, the field the storefront's CartContext and the
 * Telegram bot share), so the cart is right even when the checkout tab was
 * closed before the payment landed. The browser still clears it too when it
 * sees the payment; that is just quicker on screen.
 *
 * Once per order (`cartCleanedAt`), in its own transaction, separate from the
 * money: a failure here never affects the sale.
 */
export async function removePurchasedLinesFromCart(
  db: Firestore,
  orderId: string,
): Promise<{ removedUnits: number; reason?: string }> {
  const orderRef = db.collection("onlineOrders").doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return { removedUnits: 0, reason: "order_not_found" };

    const order = (orderSnap.data() || {}) as Record<string, unknown>;
    if (order.cartCleanedAt) return { removedUnits: 0, reason: "already_cleaned" };

    const uid = (order.customer as { uid?: unknown } | undefined)?.uid;
    if (typeof uid !== "string" || !uid || uid.includes("/")) {
      return { removedUnits: 0, reason: "no_customer" };
    }

    const customerRef = db.collection("customers").doc(uid);
    const customerSnap = await tx.get(customerRef);
    const saved = customerSnap.exists ? customerSnap.data()?.cartItems : null;
    const cart = Array.isArray(saved) ? (saved as CartLine[]) : [];

    const result = subtractPurchasedLines(cart, purchasedLines(order));
    if (result.removedUnits > 0) {
      tx.update(customerRef, {
        cartItems: result.cart,
        cartUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(orderRef, { cartCleanedAt: new Date().toISOString() }, { merge: true });

    return { removedUnits: result.removedUnits };
  });
}

/**
 * Coupon, points and cart for a paid order whose sale is recorded. Safe to
 * call again: each step is idempotent (see the module comment). Best-effort:
 * failures are logged, never thrown, so the callback still answers 200.
 */
export async function completePaidOrderExtras(
  db: Firestore,
  params: { orderId: string; transactionDocId: string },
): Promise<void> {
  const { orderId, transactionDocId } = params;

  let order: Record<string, unknown>;
  try {
    const snap = await db.collection("onlineOrders").doc(orderId).get();
    if (!snap.exists) return;
    order = (snap.data() || {}) as Record<string, unknown>;
  } catch (error) {
    console.error(`Could not load paid order ${orderId}:`, error);
    return;
  }

  // Refunded (or otherwise no longer paid) since: no coupon use or points.
  if (String(order.paymentStatus || "").toUpperCase() !== "SUCCESS") return;

  const customerUid = (order.customer as { uid?: unknown } | undefined)?.uid;
  const couponId = order.couponId as string | undefined;

  if (typeof customerUid === "string" && customerUid && couponId && order.couponCode) {
    try {
      const { CouponService } = await import("./couponService");
      // eslint-disable-next-line react-hooks/rules-of-hooks -- not a React hook; the `use` prefix only looks like one
      await CouponService.useCouponAdmin(db, customerUid, couponId, transactionDocId);
    } catch (error) {
      console.error(`Error marking coupon as used for ${orderId}:`, error);
    }
  }

  try {
    const award = await awardPointsForOnlinePayment(db, {
      transactionDocId,
      description: `Online payment for order ${orderId}`,
    });
    if (award.outcome === "awarded") {
      console.log(`Loyalty points awarded for ${orderId}:`, award);
    }
  } catch (error) {
    // The marker is only written with the credit, so a later retry of the
    // callback awards them.
    console.error(`Error awarding loyalty points for ${orderId}:`, error);
  }

  try {
    await removePurchasedLinesFromCart(db, orderId);
  } catch (error) {
    console.error(`Could not remove paid items from the cart for ${orderId}:`, error);
  }
}
