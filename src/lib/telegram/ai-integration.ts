/**
 * AI Assistant Integration for Telegram
 * Connect Groq AI chatbot with Telegram
 */

import Groq from "groq-sdk";
import { searchProducts } from "../productSearch";
import {
  isOutfitRequest,
  extractOccasion,
  extractBudget,
  generateOutfitRecommendation,
} from "../outfitRecommendation";
import { isPromotionQuery, getPromotionResponse } from "../promotions";
import { isOrderInquiry, findOrderByRef } from "../orderSupport";
import { isSizeRecommendationQuery, extractMeasurements, recommendSize } from "../storeInfo";
import { formatProduct, formatPrice, escapeMarkdown } from "./formatters";
import { createProductKeyboard } from "./keyboards";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

/**
 * Process message with AI assistant
 */
export async function processWithAI(
  message: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<{
  text: string;
  products?: any[];
  isOutfit?: boolean;
  requiresProductSearch?: boolean;
}> {
  if (!groq) {
    return {
      text: "AI assistant is not configured. Please set GROQ_API_KEY in environment variables.",
    };
  }

  try {
    const lowerMessage = message.toLowerCase();

    // Check for specific query types first

    // 1. Promotion queries
    const promotionQuery = isPromotionQuery(message);
    if (promotionQuery.isQuery && promotionQuery.queryType) {
      const response = getPromotionResponse(promotionQuery.queryType);
      return { text: response };
    }

    // 2. Order inquiries
    const orderQuery = isOrderInquiry(message);
    if (orderQuery.isInquiry && orderQuery.orderRef) {
      const order = await findOrderByRef(orderQuery.orderRef);
      if (order) {
        const { formatOrder } = await import("./formatters");
        return { text: formatOrder(order) };
      }
    }

    // 3. Size recommendations
    if (isSizeRecommendationQuery(message)) {
      const measurements = extractMeasurements(message);
      if (Object.keys(measurements).length > 0) {
        const itemType = lowerMessage.includes("pants") || lowerMessage.includes("jeans") 
          ? "bottoms" 
          : "tops";
        const recommendation = recommendSize(measurements, itemType);

        let text = `📏 *Size Recommendation*\n\n`;
        text += `🎯 *Recommended Size:* ${escapeMarkdown(recommendation.recommendedSize)}\n`;
        text += `📊 *Confidence:* ${escapeMarkdown(recommendation.confidence)}\n\n`;

        if (recommendation.alternativeSizes.length > 0) {
          text += `🔄 *Alternative Sizes:* ${recommendation.alternativeSizes.join(", ")}\n\n`;
        }

        text += `💡 *Notes:*\n${recommendation.notes.map(n => `• ${escapeMarkdown(n)}`).join("\n")}`;

        return { text };
      }
    }

    // 4. Outfit recommendations
    if (isOutfitRequest(message)) {
      const occasion = extractOccasion(message);
      const budget = extractBudget(message);

      if (occasion) {
        const outfit = await generateOutfitRecommendation(occasion, budget);

        if (outfit) {
          let text = `✨ *${escapeMarkdown(outfit.occasion)} Outfit Recommendation*\n\n`;
          text += `${escapeMarkdown(outfit.description)}\n\n`;
          text += `💰 *Total:* ${escapeMarkdown(formatPrice(outfit.totalPrice))}\n\n`;

          if (outfit.tips && outfit.tips.length > 0) {
            text += `💡 *Style Tips:*\n`;
            outfit.tips.forEach(tip => {
              text += `• ${escapeMarkdown(tip)}\n`;
            });
          }

          return {
            text,
            isOutfit: true,
          };
        }
      }
    }

    // 5. Product search
    if (
      lowerMessage.includes("show") ||
      lowerMessage.includes("find") ||
      lowerMessage.includes("search") ||
      lowerMessage.includes("looking for")
    ) {
      const products = await searchProducts({ keyword: message });

      if (products.length > 0) {
        return {
          text: `Found ${products.length} product${products.length !== 1 ? "s" : ""}! Here's what we have:`,
          products: products.slice(0, 5),
          requiresProductSearch: true,
        };
      }
    }

    // Use AI for conversational response
    const groqMessages = [
      {
        role: "system" as const,
        content: `You are StyleBot, a helpful shopping assistant for Swe Trendy Hub clothing store.

Keep responses SHORT (2-3 sentences max) and friendly.
Help customers find products, answer questions, and provide recommendations.

You can help with:
- Product search and recommendations
- Size guidance
- Style advice
- Order tracking
- Store information
- Promotions

Always be helpful, concise, and encourage shopping.`,
      },
      ...chatHistory.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      {
        role: "user" as const,
        content: message,
      },
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: groqMessages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 200,
    });

    const aiResponse = chatCompletion.choices[0]?.message?.content || 
      "I'm here to help! What are you looking for today?";

    return { text: aiResponse };
  } catch (error) {
    console.error("AI processing error:", error);
    return {
      text: "I'm having trouble processing that. Could you try rephrasing?",
    };
  }
}

/**
 * Get conversational product recommendation
 */
export async function getAIProductRecommendation(
  userPreferences: string
): Promise<string> {
  if (!groq) {
    return "AI recommendations are not available at the moment.";
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a fashion expert helping customers find the perfect clothing.
Based on their preferences, suggest product categories and styles.
Keep it brief (2-3 sentences) and specific.`,
        },
        {
          role: "user",
          content: `I'm looking for: ${userPreferences}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.8,
      max_tokens: 150,
    });

    return (
      chatCompletion.choices[0]?.message?.content ||
      "Let me help you find something perfect!"
    );
  } catch (error) {
    console.error("AI recommendation error:", error);
    return "I'd love to help you find something! Could you tell me more about what you're looking for?";
  }
}
