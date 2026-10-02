/**
 * The `online_promotions` document shape, shared by the browser and the server.
 *
 * Kept free of any Firebase or React import so the order routes can price an
 * order with exactly the same promotion data the checkout page displays.
 */

export type OnlinePromotion = {
  id: string;
  name: string;
  description?: string;
  scope: "group" | "variant";
  productId: string;
  productName?: string;
  variantId?: string;
  variantName?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountTHB?: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeDate(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (
    typeof input === "object" &&
    input !== null &&
    "toDate" in (input as Record<string, unknown>)
  ) {
    try {
      return (input as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

/** Map a raw Firestore promotion document (client or Admin SDK). */
export function mapPromotionDoc(
  id: string,
  data: Record<string, unknown>,
): OnlinePromotion {
  return {
    id,
    name: String(data.name || ""),
    description: String(data.description || ""),
    scope: data.scope === "variant" ? "variant" : "group",
    productId: String(data.productId || ""),
    productName: String(data.productName || ""),
    variantId: String(data.variantId || ""),
    variantName: String(data.variantName || ""),
    discountType: data.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: Number(data.discountValue || 0),
    maxDiscountTHB: Number(data.maxDiscountTHB || 0),
    startDate: String(data.startDate || ""),
    endDate: String(data.endDate || ""),
    isActive: Boolean(data.isActive),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  };
}
