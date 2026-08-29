/**
 * Store Information and FAQ System
 * Provides answers to common customer questions about the store
 */

export interface StoreInfo {
  name: string;
  locations: {
    branch: string;
    address: string;
    phone: string;
    hours: string;
  }[];
  policies: {
    shipping: string;
    returns: string;
    exchanges: string;
    cancellation: string;
  };
  paymentMethods: string[];
  deliveryInfo: {
    available: boolean;
    areas: string[];
    fee: string;
    estimatedTime: string;
  };
  codPolicy: {
    available: boolean;
    maxAmount?: number;
    restrictions?: string;
  };
}

// Store configuration
export const STORE_INFO: StoreInfo = {
  name: "StyleHub Clothing Store",
  locations: [
    {
      branch: "Main Branch",
      address: "123 Fashion Street, Downtown, Yangon, Myanmar",
      phone: "+95 9 123 456 789",
      hours: "Monday - Sunday: 9:00 AM - 9:00 PM",
    },
  ],
  policies: {
    shipping:
      "We offer nationwide delivery. Orders are typically processed within 1-2 business days.",
    returns:
      "Items can be returned within 7 days of delivery if unworn and in original condition with tags attached. COD orders: full refund upon inspection. Online payment orders: refund within 5-7 business days.",
    exchanges:
      "Exchanges are accepted within 7 days for different sizes or colors (subject to availability). The item must be unworn with original tags.",
    cancellation:
      "Orders can be cancelled before shipment. COD orders can be cancelled anytime before delivery. Online payment orders can be cancelled within 24 hours for full refund.",
  },
  paymentMethods: [
    "Cash on Delivery (COD)",
    "MyanmarPay",
    "KBZ Pay",
    "Wave Money",
    "Credit/Debit Cards",
  ],
  deliveryInfo: {
    available: true,
    areas: ["Yangon", "Mandalay", "Naypyidaw", "Bago", "Mawlamyine"],
    fee: "2,000 - 5,000 MMK depending on location",
    estimatedTime: "2-5 business days",
  },
  codPolicy: {
    available: true,
    maxAmount: 500000,
    restrictions: "Available for orders under 500,000 MMK",
  },
};

// Size chart based on measurements (in cm)
export const SIZE_CHART = {
  tops: {
    XS: { chest: [76, 84], waist: [61, 66], height: [150, 160] },
    S: { chest: [84, 91], waist: [66, 74], height: [155, 165] },
    M: { chest: [91, 99], waist: [74, 81], height: [160, 170] },
    L: { chest: [99, 107], waist: [81, 89], height: [165, 175] },
    XL: { chest: [107, 117], waist: [89, 99], height: [170, 180] },
    XXL: { chest: [117, 127], waist: [99, 109], height: [175, 185] },
  },
  bottoms: {
    XS: { waist: [61, 66], hips: [84, 89], height: [150, 160] },
    S: { waist: [66, 74], hips: [89, 97], height: [155, 165] },
    M: { waist: [74, 81], hips: [97, 104], height: [160, 170] },
    L: { waist: [81, 89], hips: [104, 112], height: [165, 175] },
    XL: { waist: [89, 99], hips: [112, 122], height: [170, 180] },
    XXL: { waist: [99, 109], hips: [122, 132], height: [175, 185] },
  },
};

/**
 * Recommend size based on measurements
 */
export function recommendSize(
  measurements: {
    height?: number; // in cm
    weight?: number; // in kg
    chest?: number; // in cm
    waist?: number; // in cm
    hips?: number; // in cm
  },
  itemType: "tops" | "bottoms" = "tops"
): {
  recommendedSize: string;
  alternativeSizes: string[];
  confidence: "high" | "medium" | "low";
  notes: string[];
} {
  const chart = SIZE_CHART[itemType];
  const notes: string[] = [];
  let recommendedSize = "M"; // default
  let confidence: "high" | "medium" | "low" = "medium";
  const alternativeSizes: string[] = [];

  // Size recommendation based on measurements
  if (itemType === "tops" && measurements.chest) {
    for (const [size, ranges] of Object.entries(chart)) {
      if (
        measurements.chest >= ranges.chest[0] &&
        measurements.chest <= ranges.chest[1]
      ) {
        recommendedSize = size;
        confidence = "high";
        break;
      }
    }

    // Add alternative sizes
    const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
    const currentIndex = sizeOrder.indexOf(recommendedSize);
    if (currentIndex > 0) alternativeSizes.push(sizeOrder[currentIndex - 1]);
    if (currentIndex < sizeOrder.length - 1)
      alternativeSizes.push(sizeOrder[currentIndex + 1]);
  } else if (itemType === "bottoms" && measurements.waist) {
    for (const [size, ranges] of Object.entries(chart)) {
      if (
        measurements.waist >= ranges.waist[0] &&
        measurements.waist <= ranges.waist[1]
      ) {
        recommendedSize = size;
        confidence = "high";
        break;
      }
    }

    const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
    const currentIndex = sizeOrder.indexOf(recommendedSize);
    if (currentIndex > 0) alternativeSizes.push(sizeOrder[currentIndex - 1]);
    if (currentIndex < sizeOrder.length - 1)
      alternativeSizes.push(sizeOrder[currentIndex + 1]);
  } else if (measurements.height && measurements.weight) {
    // BMI-based estimation
    const heightM = measurements.height / 100;
    const bmi = measurements.weight / (heightM * heightM);

    if (bmi < 18.5) {
      recommendedSize = measurements.height < 165 ? "XS" : "S";
    } else if (bmi < 25) {
      recommendedSize = measurements.height < 165 ? "S" : "M";
    } else if (bmi < 30) {
      recommendedSize = measurements.height < 165 ? "M" : "L";
    } else {
      recommendedSize = measurements.height < 165 ? "L" : "XL";
    }

    confidence = "medium";
    notes.push(
      "This recommendation is based on height and weight. For best fit, please provide chest/waist measurements."
    );

    const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
    const currentIndex = sizeOrder.indexOf(recommendedSize);
    if (currentIndex > 0) alternativeSizes.push(sizeOrder[currentIndex - 1]);
    if (currentIndex < sizeOrder.length - 1)
      alternativeSizes.push(sizeOrder[currentIndex + 1]);
  } else {
    confidence = "low";
    notes.push(
      "Please provide more measurements (height, weight, or chest/waist) for accurate size recommendation."
    );
  }

  // Additional notes
  if (confidence === "high") {
    notes.push("This size should fit you well based on your measurements.");
  }

  notes.push(
    "Fit may vary by brand and style. We recommend checking the product's size chart."
  );
  notes.push(
    "If you're between sizes, we suggest choosing the larger size for comfort."
  );

  return {
    recommendedSize,
    alternativeSizes,
    confidence,
    notes,
  };
}

/**
 * Extract measurements from natural language
 */
export function extractMeasurements(text: string): {
  height?: number;
  weight?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  currentSize?: string;
} {
  const lowerText = text.toLowerCase();
  const measurements: any = {};

  // Height (cm or feet/inches)
  const heightCmMatch = lowerText.match(/(\d+)\s*cm/i);
  const heightFeetMatch = lowerText.match(
    /(\d+)\s*(?:feet|ft|')\s*(\d+)?\s*(?:inches|in|")?/i
  );

  if (heightCmMatch) {
    measurements.height = parseInt(heightCmMatch[1]);
  } else if (heightFeetMatch) {
    const feet = parseInt(heightFeetMatch[1]);
    const inches = heightFeetMatch[2] ? parseInt(heightFeetMatch[2]) : 0;
    measurements.height = Math.round(feet * 30.48 + inches * 2.54);
  }

  // Weight (kg or lbs)
  const weightKgMatch = lowerText.match(/(\d+)\s*(?:kg|kilos?)/i);
  const weightLbsMatch = lowerText.match(/(\d+)\s*(?:lbs?|pounds?)/i);

  if (weightKgMatch) {
    measurements.weight = parseInt(weightKgMatch[1]);
  } else if (weightLbsMatch) {
    measurements.weight = Math.round(parseInt(weightLbsMatch[1]) * 0.453592);
  }

  // Chest (cm)
  const chestMatch = lowerText.match(/chest\s*:?\s*(\d+)/i);
  if (chestMatch) {
    measurements.chest = parseInt(chestMatch[1]);
  }

  // Waist (cm)
  const waistMatch = lowerText.match(/waist\s*:?\s*(\d+)/i);
  if (waistMatch) {
    measurements.waist = parseInt(waistMatch[1]);
  }

  // Hips (cm)
  const hipsMatch = lowerText.match(/hips?\s*:?\s*(\d+)/i);
  if (hipsMatch) {
    measurements.hips = parseInt(hipsMatch[1]);
  }

  // Current size
  const sizeMatch = lowerText.match(/\b(xs|s|m|l|xl|xxl|xxxl)\b/i);
  if (sizeMatch) {
    measurements.currentSize = sizeMatch[1].toUpperCase();
  }

  return measurements;
}

/**
 * Detect if message is asking about size recommendation
 */
export function isSizeRecommendationQuery(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  const sizeKeywords = [
    "what size",
    "which size",
    "size should i",
    "recommend size",
    "my size",
    "fit me",
    "will fit",
    "size for",
  ];

  const measurementIndicators = [
    "cm",
    "kg",
    "feet",
    "inches",
    "height",
    "weight",
    "chest",
    "waist",
    "hips",
  ];

  const hasSizeKeyword = sizeKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasMeasurement = measurementIndicators.some((indicator) =>
    lowerMessage.includes(indicator)
  );

  return hasSizeKeyword || hasMeasurement;
}

/**
 * Detect if message is asking about store information
 */
export function isStoreInfoQuery(message: string): {
  isQuery: boolean;
  queryType?:
    | "location"
    | "hours"
    | "contact"
    | "delivery"
    | "payment"
    | "cod"
    | "returns"
    | "policy";
} {
  const lowerMessage = message.toLowerCase();

  // Location queries
  if (
    lowerMessage.includes("where") &&
    (lowerMessage.includes("shop") ||
      lowerMessage.includes("store") ||
      lowerMessage.includes("location") ||
      lowerMessage.includes("address"))
  ) {
    return { isQuery: true, queryType: "location" };
  }

  // Hours queries
  if (
    lowerMessage.includes("hours") ||
    lowerMessage.includes("open") ||
    lowerMessage.includes("close") ||
    (lowerMessage.includes("what time") && lowerMessage.includes("open"))
  ) {
    return { isQuery: true, queryType: "hours" };
  }

  // Contact queries
  if (
    lowerMessage.includes("contact") ||
    lowerMessage.includes("phone") ||
    lowerMessage.includes("call") ||
    lowerMessage.includes("number")
  ) {
    return { isQuery: true, queryType: "contact" };
  }

  // Delivery queries
  if (
    lowerMessage.includes("deliver") ||
    lowerMessage.includes("shipping") ||
    lowerMessage.includes("ship")
  ) {
    return { isQuery: true, queryType: "delivery" };
  }

  // Payment queries
  if (
    lowerMessage.includes("payment") ||
    lowerMessage.includes("pay") ||
    lowerMessage.includes("method")
  ) {
    return { isQuery: true, queryType: "payment" };
  }

  // COD queries
  if (
    lowerMessage.includes("cod") ||
    lowerMessage.includes("cash on delivery")
  ) {
    return { isQuery: true, queryType: "cod" };
  }

  // Returns queries
  if (
    lowerMessage.includes("return") ||
    lowerMessage.includes("exchange") ||
    lowerMessage.includes("refund")
  ) {
    return { isQuery: true, queryType: "returns" };
  }

  // Policy queries
  if (lowerMessage.includes("policy") || lowerMessage.includes("cancel")) {
    return { isQuery: true, queryType: "policy" };
  }

  return { isQuery: false };
}

/**
 * Get store information response
 */
export function getStoreInfoResponse(
  queryType:
    | "location"
    | "hours"
    | "contact"
    | "delivery"
    | "payment"
    | "cod"
    | "returns"
    | "policy"
): string {
  switch (queryType) {
    case "location":
      return STORE_INFO.locations
        .map(
          (loc) =>
            `📍 **${loc.branch}**\n📫 Address: ${loc.address}\n📞 Phone: ${loc.phone}\n🕐 Hours: ${loc.hours}`
        )
        .join("\n\n");

    case "hours":
      return (
        "🕐 **Store Hours:**\n\n" +
        STORE_INFO.locations
          .map((loc) => `${loc.branch}: ${loc.hours}`)
          .join("\n")
      );

    case "contact":
      return (
        "📞 **Contact Us:**\n\n" +
        STORE_INFO.locations
          .map((loc) => `${loc.branch}: ${loc.phone}`)
          .join("\n")
      );

    case "delivery":
      return `🚚 **Delivery Information:**\n\n✅ We offer delivery to: ${STORE_INFO.deliveryInfo.areas.join(", ")}\n💰 Delivery Fee: ${STORE_INFO.deliveryInfo.fee}\n⏱️ Estimated Time: ${STORE_INFO.deliveryInfo.estimatedTime}\n\n${STORE_INFO.policies.shipping}`;

    case "payment":
      return `💳 **Accepted Payment Methods:**\n\n${STORE_INFO.paymentMethods.map((m) => `✅ ${m}`).join("\n")}`;

    case "cod":
      return `💵 **Cash on Delivery (COD):**\n\n✅ Available: Yes\n💰 Maximum Amount: ${new Intl.NumberFormat("en-US").format(STORE_INFO.codPolicy.maxAmount || 0)} MMK\n📝 ${STORE_INFO.codPolicy.restrictions}`;

    case "returns":
      return `🔄 **Returns & Exchanges Policy:**\n\n**Returns:**\n${STORE_INFO.policies.returns}\n\n**Exchanges:**\n${STORE_INFO.policies.exchanges}`;

    case "policy":
      return `📋 **Store Policies:**\n\n**Cancellation:**\n${STORE_INFO.policies.cancellation}\n\n**Returns:**\n${STORE_INFO.policies.returns}`;

    default:
      return "I can help you with information about our store. What would you like to know?";
  }
}
