import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { searchProducts, SearchFilters } from "../../../lib/productSearch";
import {
  generateOutfitRecommendation,
  isOutfitRequest,
  extractOccasion,
  extractBudget,
} from "../../../lib/outfitRecommendation";
import {
  isProductInfoQuery,
  findProductByName,
  getProductById,
  isSizeAvailable,
  isColorAvailable,
  formatProductInfo,
  ProductInfo,
} from "../../../lib/productInfo";
import {
  isSizeRecommendationQuery,
  extractMeasurements,
  recommendSize,
  isStoreInfoQuery,
  getStoreInfoResponse,
} from "../../../lib/storeInfo";
import {
  isOrderInquiry,
  findOrderByRef,
  formatOrderInfo,
  canCancelOrder,
  canReturnOrder,
} from "../../../lib/orderSupport";
import {
  isPromotionQuery,
  getPromotionResponse,
  getActivePromotions,
} from "../../../lib/promotions";

// Initialize Groq client
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!groq) {
      console.error("❌ Groq API not configured - GROQ_API_KEY is missing");
      return NextResponse.json(
        {
          error:
            "Groq API is not configured. Please add GROQ_API_KEY to your .env.local file. Get a free key at: https://console.groq.com/keys",
        },
        { status: 500 },
      );
    }

    console.log("✅ Groq API initialized");

    const { messages, productContext } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request. Messages array is required." },
        { status: 400 },
      );
    }

    // Log product context if provided
    if (productContext) {
      console.log("📍 Product context provided:", productContext);
    }

    // Get user message
    const userMessage = messages[messages.length - 1].content;
    
    console.log("📤 Sending message to Groq:", userMessage);

    // Build conversation history for Groq
    const groqMessages = messages.map((msg: Message) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Add system message at the beginning
    groqMessages.unshift({
      role: "system" as const,
      content: `You are StyleBot, a comprehensive shopping assistant for a clothing store.

Your job is to help customers with:

1. PRODUCT SEARCH - Find products by keyword, color, category, price
2. OUTFIT RECOMMENDATIONS - Create complete outfit suggestions for occasions
3. PRODUCT INFORMATION - Answer questions about specific products (size, color, price, stock)
4. SIZE RECOMMENDATIONS - Suggest sizes based on customer measurements
5. ORDER SUPPORT - Help track orders, check cancellation/return eligibility
6. PROMOTIONS - Inform about current discounts, coupons, and special offers
7. STORE INFORMATION - Answer questions about location, hours, delivery, policies

PRODUCT INFORMATION:
When customers ask about specific products (price, size, color, material, stock), provide detailed and accurate information.

SIZE RECOMMENDATIONS:
When customers provide measurements (height, weight, chest, waist), recommend appropriate sizes with confidence levels.

ORDER SUPPORT:
Help customers track their orders, check if they can cancel or return items. Always provide accurate status information.

PROMOTIONS:
Tell customers about current discounts, coupon codes, flash sales, and special offers.

STORE INFORMATION:
Answer questions about store location, opening hours, delivery options, payment methods, return policies, and COD availability.

OUTFIT RECOMMENDATIONS:
When customers ask for outfit suggestions (e.g., "outfit for a date", "what to wear to work"), provide helpful styling advice and mention you're creating a complete outfit recommendation.

PRODUCT SEARCH:
When customers ask about specific products (like "show me t-shirts", "black jeans"), respond naturally and mention that you're searching for products.

Keep responses very short and friendly (2-3 sentences max).

Examples:
- User: "Do you have this shirt in XL?"
  You: "Let me check the availability of XL for you right now! 👕"

- User: "I'm 170cm and 65kg, what size should I get?"
  You: "Based on your measurements, I'll recommend the perfect size for you! 📏"

- User: "Where is my order OR12345678?"
  You: "Let me check the status of your order right away! 📦"

- User: "Any discounts available?"
  You: "Great question! Let me show you our current promotions and coupon codes! 🎉"

- User: "Where is your shop?"
  You: "I'll get you our store location and contact information! 🏪"

- User: "I need an outfit for a casual date"
  You: "Perfect! Let me create a complete casual date outfit for you. I'll pick pieces that work great together! 💕"

- User: "Show me black t-shirts"
  You: "Great choice! Let me find black t-shirts for you. I'll show you what we have in stock."

- User: "Hi"
  You: "Hi! 👋 I'm StyleBot, your comprehensive shopping assistant. I can help you find products, check sizes, track orders, recommend outfits, tell you about promotions, or answer store questions. What can I help you with today?"`,
    });

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: groqMessages,
        model: "openai/gpt-oss-20b", // From Groq docs
        temperature: 0.7,
        max_tokens: 200,
      });

      const text = chatCompletion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
      
      console.log("📥 Received response from Groq");

      // Check if this is a product information query
      const lowerMessage = userMessage.toLowerCase();
      let products: any[] = [];
      let isOutfit = false;
      let outfitData: any = null;
      let productInfoText: string | null = null;

      // Priority 1: Size Recommendation Query
      if (isSizeRecommendationQuery(userMessage)) {
        console.log("📏 Detected size recommendation query");
        
        const measurements = extractMeasurements(userMessage);
        console.log("📐 Extracted measurements:", measurements);
        
        if (Object.keys(measurements).length > 0) {
          const itemType = lowerMessage.includes("pants") || lowerMessage.includes("jeans") || lowerMessage.includes("skirt") ? "bottoms" : "tops";
          const recommendation = recommendSize(measurements, itemType);
          
          productInfoText = `📏 **Size Recommendation**\n\n🎯 **Recommended Size:** ${recommendation.recommendedSize}\n📊 **Confidence:** ${recommendation.confidence.charAt(0).toUpperCase() + recommendation.confidence.slice(1)}\n\n`;
          
          if (recommendation.alternativeSizes.length > 0) {
            productInfoText += `🔄 **Alternative Sizes:** ${recommendation.alternativeSizes.join(", ")}\n\n`;
          }
          
          productInfoText += `💡 **Notes:**\n${recommendation.notes.map(note => `• ${note}`).join("\n")}`;
        } else {
          productInfoText = "📏 I'd love to recommend a size for you! Please provide:\n\n• Your height (e.g., 170cm or 5'7\")\n• Your weight (e.g., 65kg or 140lbs)\n\nOr for more accurate results:\n• Chest measurement (for tops)\n• Waist measurement (for bottoms)\n\nExample: \"I'm 170cm, 65kg\" or \"Chest: 95cm, Waist: 80cm\"";
        }
      }
      
      // Priority 2: Order Support Query
      else if (!productInfoText) {
        const orderInquiry = isOrderInquiry(userMessage);
        
        if (orderInquiry.isInquiry) {
          console.log(`📦 Detected order inquiry: ${orderInquiry.queryType}`);
          
          if (orderInquiry.orderRef) {
            console.log(`🔍 Searching for order: ${orderInquiry.orderRef}`);
            
            try {
              const order = await findOrderByRef(orderInquiry.orderRef);
              
              if (order) {
                console.log(`✅ Found order: ${order.orderRef}`);
                productInfoText = formatOrderInfo(order);
                
                // Add specific guidance based on query type
                if (orderInquiry.queryType === "cancel") {
                  const cancelInfo = canCancelOrder(order);
                  if (cancelInfo.canCancel) {
                    productInfoText += `\n\n✅ **You can cancel this order.**\n\n📞 To proceed with cancellation, please contact us at +95 9 123 456 789 or reply with "Confirm cancel ${order.orderRef}"`;
                  } else {
                    productInfoText += `\n\n❌ **Cancellation not available:** ${cancelInfo.reason}`;
                  }
                } else if (orderInquiry.queryType === "return") {
                  const returnInfo = canReturnOrder(order);
                  if (returnInfo.canReturn) {
                    productInfoText += `\n\n✅ **You can return this order.**\n\nReturn process:\n1. Item must be unworn with original tags\n2. Contact us within 7 days of delivery\n3. We'll arrange pickup\n4. Refund processed after inspection\n\n📞 Contact: +95 9 123 456 789`;
                  } else {
                    productInfoText += `\n\n❌ **Return not available:** ${returnInfo.reason}`;
                  }
                }
              } else {
                console.log(`❌ Order not found: ${orderInquiry.orderRef}`);
                productInfoText = `❌ I couldn't find order **${orderInquiry.orderRef}**.\n\nPlease check:\n• Order reference is correct (e.g., OR12345678)\n• Order was placed on our website\n\nNeed help? Contact us at +95 9 123 456 789`;
              }
            } catch (orderError) {
              console.error("❌ Order lookup error:", orderError);
              productInfoText = `I'm having trouble looking up that order right now. Please try again or contact support at +95 9 123 456 789.`;
            }
          } else {
            productInfoText = `📦 **Order Support**\n\nTo track your order, please provide your order reference number (e.g., OR12345678).\n\nYou can find it in:\n• Order confirmation email\n• Order history on our website\n\nExample: "Where is my order OR12345678?"`;
          }
        }
      }
      
      // Priority 3: Promotions Query
      else if (!productInfoText) {
        const promoQuery = isPromotionQuery(userMessage);
        
        if (promoQuery.isQuery) {
          console.log(`🎉 Detected promotion query: ${promoQuery.queryType}`);
          productInfoText = getPromotionResponse(promoQuery.queryType || "general");
        }
      }
      
      // Priority 4: Store Information Query
      else if (!productInfoText) {
        const storeQuery = isStoreInfoQuery(userMessage);
        
        if (storeQuery.isQuery) {
          console.log(`🏪 Detected store info query: ${storeQuery.queryType}`);
          productInfoText = getStoreInfoResponse(storeQuery.queryType!);
        }
      }
      
      // Priority 5: Product Information Query
      const productInfoQuery = isProductInfoQuery(userMessage);

      if (!productInfoText && productInfoQuery.isQuery) {
        console.log(`ℹ️ Detected product info query: ${productInfoQuery.queryType}`);
        
        // Try to find the product being asked about
        let product: ProductInfo | null = null;
        
        // First, check if we have product context from the page
        if (productContext) {
          console.log(`🔍 Using product context: ${productContext}`);
          product = await getProductById(productContext);
          if (product) {
            console.log(`✅ Found product from context: ${product.name}`);
          }
        }
        
        // If no context, try to extract product name from message
        if (!product) {
          const words = userMessage.toLowerCase().split(/\s+/);
          const productKeywords = words.filter(w => 
            w.length > 3 && 
            !['this', 'that', 'have', 'does', 'available', 'stock', 'color', 'size', 'price', 'shirt', 'dress', 'jeans', 'pants'].includes(w)
          );
          
          // Try to find product by keywords
          if (productKeywords.length > 0) {
            for (const keyword of productKeywords) {
              product = await findProductByName(keyword);
              if (product) break;
            }
          }
        }
        
        // If we found a product, provide detailed info
        if (product) {
          console.log(`✅ Found product: ${product.name}`);
          
          if (productInfoQuery.queryType === "size" && productInfoQuery.extractedInfo?.size) {
            const size = productInfoQuery.extractedInfo.size;
            const sizeInfo = isSizeAvailable(product, size);
            
            if (sizeInfo.available) {
              productInfoText = `✅ Yes! Size ${size} is available in ${sizeInfo.colors?.join(", ") || "stock"}. We have ${sizeInfo.quantity} unit(s) available.\n\n${formatProductInfo(product)}`;
            } else {
              productInfoText = `❌ Sorry, size ${size} is currently out of stock for this item.\n\nAvailable sizes: ${product.availableSizes.join(", ")}\n\n${formatProductInfo(product)}`;
            }
          } else if (productInfoQuery.queryType === "color" && productInfoQuery.extractedInfo?.color) {
            const color = productInfoQuery.extractedInfo.color;
            const colorInfo = isColorAvailable(product, color);
            
            if (colorInfo.available) {
              productInfoText = `✅ Yes! ${color.charAt(0).toUpperCase() + color.slice(1)} is available in sizes: ${colorInfo.sizes?.join(", ")}. We have ${colorInfo.quantity} unit(s) in stock.\n\n${formatProductInfo(product)}`;
            } else {
              productInfoText = `❌ Sorry, ${color} is currently out of stock for this item.\n\nAvailable colors: ${product.availableColors.join(", ") || "None in stock"}\n\n${formatProductInfo(product)}`;
            }
          } else if (productInfoQuery.queryType === "color") {
            // General color query without specific color mentioned
            if (product.availableColors.length > 0) {
              const colorDetails = product.availableColors
                .map(color => {
                  const stock = product.stockByColor[color] || 0;
                  const sizes = product.colorVariants
                    .find(v => v.color === color)
                    ?.sizeQuantities.filter(sq => sq.quantity > 0)
                    .map(sq => sq.size)
                    .join(", ") || "";
                  return `• ${color}: ${stock} units (Sizes: ${sizes})`;
                })
                .join("\n");
              
              productInfoText = `🎨 Here are all the available colors:\n\n${colorDetails}\n\n${formatProductInfo(product)}`;
            } else {
              productInfoText = `❌ Sorry, this item currently has no colors in stock.\n\n${formatProductInfo(product)}`;
            }
          } else {
            // General product information
            productInfoText = formatProductInfo(product);
          }
          
          // Add product to results for display
          products = [{
            id: product.id,
            name: product.name,
            price: product.price,
            category: product.category,
            colors: product.availableColors,
            stock: product.totalStock,
            image: product.image,
          }];
        } else {
          console.log("⚠️ Could not identify specific product from query");
          
          if (productContext) {
            productInfoText = "I couldn't find details for this product. It might not be in our system yet, or there might be a data issue. Please try browsing our products or contact support.";
          } else {
            productInfoText = "I'd be happy to help you with product details! To check size, color, or stock availability, please:\n\n1. Browse to a specific product page first, or\n2. Tell me the exact product name\n\nThen ask me about sizes, colors, prices, or availability! 😊";
          }
        }
      }

      // Priority 6: Outfit recommendation request (only if no other query detected)
      if (!productInfoText && !productInfoQuery.isQuery && isOutfitRequest(userMessage)) {
        console.log("👔 Detected outfit recommendation request");
        isOutfit = true;

        const occasion = extractOccasion(userMessage);
        const budget = extractBudget(userMessage);

        console.log(`🎯 Occasion: ${occasion}, Budget: ${budget || "unlimited"}`);

        if (occasion) {
          try {
            const outfit = await generateOutfitRecommendation(occasion, budget);

            if (outfit) {
              // Format outfit items as products for display
              products = outfit.items.map((item) => ({
                id: item.product.id,
                name: item.product.name,
                price: item.product.price,
                category: item.category, // Use the outfit category label (e.g., "Top", "Bottom")
                colors: item.product.colors,
                stock: item.product.stock,
                image: item.product.image,
              }));

              outfitData = {
                occasion: outfit.occasion,
                description: outfit.description,
                totalPrice: outfit.totalPrice,
                tips: outfit.tips,
              };

              console.log(`✅ Generated outfit with ${products.length} items`);
            } else {
              console.log("❌ Could not generate outfit recommendation");
            }
          } catch (outfitError) {
            console.error("❌ Outfit generation error:", outfitError);
          }
        }
      } else if (!productInfoText) {
        // Priority 7: Regular product search (fallback)
        const productKeywords = ['show', 'find', 'search', 'looking for', 't-shirt', 'tshirt', 'shirt', 'jeans', 'pants', 'dress', 'jacket', 'shoes', 'new', 'arrival'];
        const isProductQuery = productKeywords.some(keyword => lowerMessage.includes(keyword));

        if (isProductQuery) {
          // Extract basic filters
          const filters: SearchFilters = { inStock: true };
          
          // Color detection
          const colors = ['black', 'white', 'red', 'blue', 'green', 'pink', 'yellow', 'brown', 'gray', 'purple', 'orange'];
          for (const color of colors) {
            if (lowerMessage.includes(color)) {
              filters.color = color;
              break;
            }
          }
          
          // Category detection
          if (lowerMessage.includes('t-shirt') || lowerMessage.includes('tshirt')) {
            filters.category = 't-shirt';
          } else if (lowerMessage.includes('jeans')) {
            filters.category = 'jeans';
          } else if (lowerMessage.includes('dress')) {
            filters.category = 'dress';
          } else if (lowerMessage.includes('shirt') && !lowerMessage.includes('t-shirt')) {
            filters.category = 'shirt';
          } else if (lowerMessage.includes('pants')) {
            filters.category = 'pants';
          } else if (lowerMessage.includes('jacket')) {
            filters.category = 'jacket';
          }
          
          // Price detection
          const priceMatch = lowerMessage.match(/under\s+(\d+(?:,\d+)*)/i);
          if (priceMatch) {
            filters.maxPrice = parseInt(priceMatch[1].replace(/,/g, ''));
          }
          
          // Search for new arrivals
          if (lowerMessage.includes('new') || lowerMessage.includes('arrival')) {
            // Don't set category filter for new arrivals
            filters.category = undefined;
          }
          
          try {
            const searchResults = await searchProducts(filters);
            products = searchResults.slice(0, 10).map((p) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              category: p.category,
              colors: p.colors,
              stock: p.stock,
              image: p.image,
            }));
            console.log(`✅ Found ${products.length} products`);
          } catch (searchError) {
            console.error("❌ Product search error:", searchError);
          }
        }
      }

      return NextResponse.json({
        message: productInfoText || text,
        products: products,
        totalCount: products.length,
        isOutfit: isOutfit,
        outfit: outfitData,
        isProductInfo: !!productInfoText,
      });
    } catch (groqError) {
      console.error("❌ Groq API Error:", groqError);
      const errorMsg = groqError instanceof Error ? groqError.message : String(groqError);
      throw new Error(`Groq API error: ${errorMsg}`);
    }
  } catch (error) {
    console.error("❌ AI Chat Error:", error);
    
    let errorMessage = "Failed to process your request. Please try again.";
    let errorDetails = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 },
    );
  }
}
