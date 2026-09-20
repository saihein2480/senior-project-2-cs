import type Groq from "groq-sdk";
import { searchProducts, SearchFilters } from "../productSearch";
import {
  getProductById,
  findProductByName,
  formatProductInfo,
  ProductInfo,
} from "../productInfo";
import { recommendSize } from "../storeInfo";
import { generateOutfitRecommendation } from "../outfitRecommendation";
import { getCustomerOrders, getCustomerOrderByRef } from "./orders";
import { getPromotionSnapshot } from "./promotions";
import { getStoreInfoSnapshot } from "./storeInfo";

/**
 * Tool definitions and dispatch for the storefront chatbot.
 *
 * The model decides which tool to call, which replaced a hand-written keyword
 * chain whose `else if` ordering made the promotions and store-info handlers
 * unreachable. Tool calling also handles compound questions ("do you have this
 * in XL and what's your return policy?") that a single-branch router cannot.
 */

export interface ToolContext {
  /** Verified from the caller's ID token; null for anonymous visitors. */
  customerUid: string | null;
  /** Product id when the customer is on a product page. */
  productContext?: string | null;
  branch?: string | null;
}

/** UI payload accumulated while tools run, for rendering cards. */
export interface ToolSideEffects {
  products: Array<Record<string, unknown>>;
  outfit: Record<string, unknown> | null;
  isOutfit: boolean;
}

/**
 * Optional parameters must accept null.
 *
 * Groq validates tool arguments server-side and rejects the WHOLE request with
 * HTTP 400 `tool_use_failed` when the model sends `null` for a parameter typed
 * as plain "string". These models do that routinely for optional fields, so a
 * strict schema turns a normal question into a hard failure. The runTool guards
 * below already ignore anything that is not the expected type.
 */
const nullableString = (description: string) => ({
  type: ["string", "null"],
  description,
});
const nullableNumber = (description: string) => ({
  type: ["number", "null"],
  description,
});
const nullableBoolean = (description: string) => ({
  type: ["boolean", "null"],
  description,
});

export const CHAT_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the store catalogue. Use for any request to browse or find products, e.g. 'show me black t-shirts', 'jeans under 50000', 'oversized shirts', 'new arrivals'.",
      parameters: {
        type: "object",
        properties: {
          keyword: nullableString("Free-text product keyword"),
          category: nullableString(
            "Product type, e.g. t-shirt, shirt, jeans, pants, dress, jacket, hoodie, shorts, shoes",
          ),
          color: nullableString("Colour name, e.g. black"),
          size: nullableString("Size code: XS, S, M, L, XL, XXL"),
          minPrice: nullableNumber("Minimum price"),
          maxPrice: nullableNumber("Maximum price"),
          style: nullableString(
            "Fit or style, e.g. oversized, slim, loose, formal",
          ),
          isNew: nullableBoolean(
            "True when the customer asks for new arrivals",
          ),
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description:
        "Get full details for one product: price, colours, sizes in stock, stock counts, description. Use when the customer asks about a specific item, including 'do you have this in XL?' while on a product page.",
      parameters: {
        type: "object",
        properties: {
          productName: nullableString(
            "Product name to look up. Omit to use the product the customer is currently viewing.",
          ),
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_size",
      description:
        "Recommend a clothing size from body measurements. Call only when the customer has given at least a height and weight, or a chest/waist measurement.",
      parameters: {
        type: "object",
        properties: {
          heightCm: nullableNumber("Height in centimetres"),
          weightKg: nullableNumber("Weight in kilograms"),
          chestCm: nullableNumber("Chest measurement in centimetres"),
          waistCm: nullableNumber("Waist measurement in centimetres"),
          hipsCm: nullableNumber("Hip measurement in centimetres"),
          usualSize: nullableString("The size the customer normally wears"),
          itemType: nullableString(
            "Either 'tops' or 'bottoms'. Defaults to tops.",
          ),
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_outfit",
      description:
        "Build a complete outfit for an occasion, e.g. 'I need an outfit for a casual date'. Returns matching pieces with colours and styling tips.",
      parameters: {
        type: "object",
        properties: {
          occasion: {
            type: "string",
            description:
              "Occasion, e.g. casual date, work, party, wedding, sport, everyday",
          },
          maxBudget: nullableNumber("Optional total budget"),
        },
        required: ["occasion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_orders",
      description:
        "Look up the signed-in customer's real orders: status, payment state, and whether each can still be cancelled or returned. Use for 'where is my order', 'is my order confirmed', 'can I return this', 'can I cancel my COD order'.",
      parameters: {
        type: "object",
        properties: {
          orderReference: nullableString(
            "Specific transaction id or order reference. Omit or null to list recent orders.",
          ),
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_promotions",
      description:
        "Current discounts and promotions, plus the signed-in customer's own coupons, loyalty points and redeemable reward tiers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_info",
      description:
        "Store branches with address and phone, opening hours, delivery, payment methods, COD, and the return/exchange/refund/delivery-time policies from the Terms & Conditions.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function toProductCard(product: {
  id: string;
  name: string;
  price: number;
  category?: string;
  colors?: string[];
  stock: number;
  image?: string;
}) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    category: product.category,
    colors: product.colors,
    stock: product.stock,
    image: product.image,
  };
}

function productInfoCard(product: ProductInfo) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    category: product.category,
    colors: product.availableColors,
    stock: product.totalStock,
    image: product.image,
  };
}

/**
 * Run one tool call and return a JSON string for the model, while recording any
 * UI cards the client should render.
 */
export async function runTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
  effects: ToolSideEffects,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case "search_products": {
      const filters: SearchFilters = { inStock: true };
      if (ctx.branch) filters.branch = ctx.branch;
      if (typeof args.keyword === "string") filters.keyword = args.keyword.toLowerCase();
      if (typeof args.category === "string") filters.category = args.category.toLowerCase();
      if (typeof args.color === "string") filters.color = args.color.toLowerCase();
      if (typeof args.size === "string") filters.size = args.size.toUpperCase();
      if (typeof args.style === "string") filters.style = args.style.toLowerCase();
      if (typeof args.minPrice === "number") filters.minPrice = args.minPrice;
      if (typeof args.maxPrice === "number") filters.maxPrice = args.maxPrice;
      if (args.isNew === true) filters.isNew = true;

      const results = await searchProducts(filters);
      const limited = results.slice(0, args.isNew === true ? 20 : 10);
      effects.products = limited.map(toProductCard);

      return JSON.stringify({
        matchCount: results.length,
        shown: limited.length,
        products: limited.map((p) => ({
          name: p.name,
          price: p.price,
          category: p.category,
          colors: p.colors,
          stock: p.stock,
        })),
        note:
          results.length === 0
            ? "No products matched. Suggest relaxing a filter; do not invent products."
            : "Product cards are already displayed to the customer, so summarise briefly rather than listing every item.",
      });
    }

    case "get_product_details": {
      let product: ProductInfo | null = null;

      if (typeof args.productName === "string" && args.productName.trim()) {
        product = await findProductByName(args.productName.trim());
      }
      if (!product && ctx.productContext) {
        product = await getProductById(ctx.productContext);
      }

      if (!product) {
        return JSON.stringify({
          found: false,
          note:
            "Product not found. Ask the customer for the exact product name, or invite them to open the product page. Do not guess details.",
        });
      }

      effects.products = [productInfoCard(product)];

      return JSON.stringify({
        found: true,
        name: product.name,
        price: product.price,
        category: product.category || null,
        description: product.description || null,
        material: product.material || null,
        materialKnown: !!product.material,
        availableColors: product.availableColors,
        availableSizes: product.availableSizes,
        stockBySize: product.stockBySize,
        stockByColor: product.stockByColor,
        totalStock: product.totalStock,
        summary: formatProductInfo(product),
        note:
          "If materialKnown is false, say the material is not listed rather than guessing it.",
      });
    }

    case "recommend_size": {
      const measurements: {
        height?: number;
        weight?: number;
        chest?: number;
        waist?: number;
        hips?: number;
      } = {};
      if (typeof args.heightCm === "number") measurements.height = args.heightCm;
      if (typeof args.weightKg === "number") measurements.weight = args.weightKg;
      if (typeof args.chestCm === "number") measurements.chest = args.chestCm;
      if (typeof args.waistCm === "number") measurements.waist = args.waistCm;
      if (typeof args.hipsCm === "number") measurements.hips = args.hipsCm;

      if (Object.keys(measurements).length === 0) {
        return JSON.stringify({
          ok: false,
          note:
            "No measurements supplied. Ask for height and weight, or chest (tops) / waist (bottoms).",
        });
      }

      const itemType = args.itemType === "bottoms" ? "bottoms" : "tops";
      const result = recommendSize(measurements, itemType);

      return JSON.stringify({
        ok: true,
        recommendedSize: result.recommendedSize,
        alternativeSizes: result.alternativeSizes,
        confidence: result.confidence,
        notes: result.notes,
        usualSize: args.usualSize ?? null,
        note:
          "This comes from the store's general size chart, not a per-garment chart. Mention that fit can vary. If usualSize is given and differs from recommendedSize, acknowledge both.",
      });
    }

    case "recommend_outfit": {
      const occasion =
        typeof args.occasion === "string" ? args.occasion : "casual";
      const budget =
        typeof args.maxBudget === "number" ? args.maxBudget : undefined;

      const outfit = await generateOutfitRecommendation(
        occasion,
        budget,
        ctx.branch || undefined,
      );

      if (!outfit) {
        return JSON.stringify({
          found: false,
          note:
            "Could not assemble an outfit from current stock. Say so and offer to search individual pieces.",
        });
      }

      effects.isOutfit = true;
      effects.products = outfit.items.map((item) => ({
        ...toProductCard(item.product),
        category: item.category,
      }));
      effects.outfit = {
        occasion: outfit.occasion,
        description: outfit.description,
        totalPrice: outfit.totalPrice,
        tips: outfit.tips,
      };

      return JSON.stringify({
        found: true,
        occasion: outfit.occasion,
        totalPrice: outfit.totalPrice,
        pieces: outfit.items.map((item) => ({
          role: item.category,
          name: item.product.name,
          price: item.product.price,
        })),
        note:
          "The outfit card is already shown. Give a short styling summary instead of repeating every price.",
      });
    }

    case "get_my_orders": {
      if (!ctx.customerUid) {
        return JSON.stringify({
          signedIn: false,
          note:
            "The customer is not signed in, so their orders cannot be accessed. Ask them to sign in and check Account > My Purchases. Never ask for an order number as a way around signing in.",
        });
      }

      const reference =
        typeof args.orderReference === "string" && args.orderReference.trim()
          ? args.orderReference.trim()
          : null;

      if (reference) {
        const order = await getCustomerOrderByRef(ctx.customerUid, reference);
        if (!order) {
          return JSON.stringify({
            signedIn: true,
            found: false,
            note: `No order matching "${reference}" on this account.`,
          });
        }
        return JSON.stringify({ signedIn: true, found: true, order });
      }

      const orders = await getCustomerOrders(ctx.customerUid, 5);
      return JSON.stringify({
        signedIn: true,
        found: orders.length > 0,
        orders,
        note:
          "Report the real status. Cancelling or returning is a REQUEST that the store must approve; it is not immediate. Cancel and return are submitted from Account > My Purchases. Scan/wallet cancellations also require a payment QR screenshot.",
      });
    }

    case "get_promotions": {
      const snapshot = await getPromotionSnapshot(ctx.customerUid);
      return JSON.stringify({
        ...snapshot,
        note:
          "Only mention these. There is no generic welcome code and no free-shipping offer unless listed here. Coupons belong to this customer's account and are applied at checkout.",
      });
    }

    case "get_store_info": {
      const snapshot = await getStoreInfoSnapshot();
      return JSON.stringify({
        ...snapshot,
        note:
          "branches are the real shop records. For opening hours prefer each branch's own openingHours and name the branch; only fall back to the top-level openingHours when a branch has none. policies summarise the published Terms & Conditions, so use them for returns, exchanges, refunds and delivery times, and link customers to policiesUrl for the full wording. Anything listed in unknownFields has no source: say you do not have it on file rather than inventing it.",
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
