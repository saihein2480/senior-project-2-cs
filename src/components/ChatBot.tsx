"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, usePathname } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  products?: ProductResult[];
  isOutfit?: boolean;
  outfit?: OutfitData;
  productContext?: string; // ID of product currently being viewed
}

interface ProductResult {
  id: string;
  name: string;
  price: number;
  category?: string;
  colors?: string[];
  stock: number;
  image?: string;
}

interface OutfitData {
  occasion: string;
  description: string;
  totalPrice: number;
  tips?: string[];
}

const QUICK_PROMPTS = [
  "Show me new arrivals",
  "Outfit for a date",
  "What size should I get?",
  "Any discounts available?",
  "Where is your shop?",
];

const FEATURE_CATEGORIES = [
  {
    id: "search",
    title: "Product Search",
    examples: [
      "Show me black t-shirts",
      "Find jeans under 50,000 MMK",
      "New arrivals",
    ],
  },
  {
    id: "recommendation",
    title: "Outfit Recommendations",
    examples: [
      "Outfit for a casual date",
      "What should I wear to work?",
      "Party outfit under 150,000",
    ],
  },
  {
    id: "product-info",
    title: "Product Information",
    examples: [
      "Do you have this in XL?",
      "What colors are available?",
      "Is this in stock?",
    ],
  },
  {
    id: "size",
    title: "Size Recommendation",
    examples: [
      "I'm 170cm and 65kg, what size?",
      "What size for 5'7\" tall?",
      "Help me find my size",
    ],
  },
  {
    id: "order",
    title: "Order Support",
    examples: [
      "Where is my order OR12345678?",
      "Can I cancel my order?",
      "Track my order",
    ],
  },
  {
    id: "promotions",
    title: "Promotions & Deals",
    examples: [
      "Any discounts available?",
      "Current sales?",
      "Coupon codes?",
    ],
  },
  {
    id: "store",
    title: "Store Information",
    examples: [
      "Where is your shop?",
      "Store opening hours?",
      "Do you offer delivery?",
    ],
  },
];

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Use Next.js hooks to detect URL changes
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Load messages from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMessages = sessionStorage.getItem('chatMessages');
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed);
          console.log('✅ Loaded chat history from session');
        } catch (error) {
          console.error('Failed to parse saved messages:', error);
          // Set default welcome message if parsing fails
          setMessages([
            {
              role: "assistant",
              content: "Hi! I'm Iori👋 How can I help you find the perfect outfit today?",
            },
          ]);
        }
      } else {
        // Set default welcome message if no saved messages
        setMessages([
          {
            role: "assistant",
            content: "Hi! I'm Iori👋 How can I help you find the perfect outfit today?",
          },
        ]);
      }
    }
  }, []);

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      sessionStorage.setItem('chatMessages', JSON.stringify(messages));
      console.log('💾 Saved chat history to session');
    }
  }, [messages]);

  // Detect if user is on a product page and extract branch
  useEffect(() => {
    // Extract product ID from pathname
    const productMatch = pathname?.match(/\/product\/([^/?]+)/);
    if (productMatch) {
      setCurrentProductId(productMatch[1]);
      console.log('📍 Detected product page:', productMatch[1]);
    } else {
      setCurrentProductId(null);
    }
    
    // Extract branch from URL params
    const branchParam = searchParams?.get('branch');
    if (branchParam) {
      setCurrentBranch(branchParam);
      console.log('🏪 Branch updated to:', branchParam);
    } else {
      setCurrentBranch(null);
      console.log('🏪 No branch selected');
    }
  }, [searchParams, pathname]); // Re-run whenever URL changes

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US").format(price);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          productContext: currentProductId, // Send current product ID
          branch: currentBranch, // Send selected branch
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API Error Response:", response.status, errorData);
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      // Check if there's an error in the response
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || "I'm sorry, I couldn't process that request.",
        products: data.products || [],
        isOutfit: data.isOutfit || false,
        outfit: data.outfit || null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            errorMessage.includes("not configured") || errorMessage.includes("API")
              ? `⚠️ ${errorMessage}\n\nPlease add your Gemini API key to continue. Get one free at: https://aistudio.google.com/app/apikey`
              : "Sorry, I'm having trouble right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleQuickPrompt = (prompt: string) => {
    sendMessage(prompt);
    setShowMenu(false); // Close menu after selection
    setSelectedCategory(null); // Reset category
  };

  const clearChat = () => {
    const confirmClear = window.confirm("Are you sure you want to clear the chat history?");
    if (confirmClear) {
      const welcomeMessage: Message = {
        role: "assistant",
        content: "Hi! I'm Iori👋 How can I help you find the perfect outfit today?",
      };
      setMessages([welcomeMessage]);
      sessionStorage.removeItem('chatMessages');
      console.log('🗑️ Chat history cleared');
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50">
          <button
            onClick={() => setIsOpen(true)}
            className="flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 group overflow-hidden relative"
            aria-label="Open chat"
          >
            <div className="relative w-full h-full transition-transform">
              <Image
                src="/lori_adult.png"
                alt="Iori Chat Assistant"
                fill
                className="object-cover"
                priority
                quality={100}
              />
            </div>
          </button>
          {/* Notification badge */}
          <span className="absolute -top-1 -right-1 h-5 w-5 md:h-6 md:w-6 rounded-full bg-white flex items-center justify-center shadow-lg border-2 border-pink-300">
            <svg
              className="w-3 h-3 md:w-4 md:h-4 text-pink-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22.5l-.394-1.933a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </span>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-50 flex flex-col w-full h-full md:w-[380px] md:h-[600px] md:rounded-2xl bg-white shadow-2xl overflow-hidden border-t md:border border-gray-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-rose-500 to-pink-500 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm overflow-hidden">
                  <Image
                    src="/lori_adult.png"
                    alt="Iori Avatar"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    quality={100}
                  />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white"></span>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Iori</h3>
                <p className="text-xs text-white/90">AI Shopping Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearChat}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Clear chat"
                title="Clear chat history"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Close chat"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} gap-2`}
              >
                {/* Assistant Avatar */}
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 w-15 h-15 rounded-full overflow-hidden border-2 border-pink-200 shadow-sm">
                    <Image
                      src="/lori_adult.png"
                      alt="Iori"
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                      quality={100}
                    />
                  </div>
                )}
                
                <div
                  className={`max-w-[85%] ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-2xl rounded-tr-sm"
                      : "bg-white text-gray-800 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100"
                  } p-3`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                  {/* Outfit Recommendation Display */}
                  {message.isOutfit && message.outfit && message.products && message.products.length > 0 && (
                    <div className="mt-4 bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-4 border border-rose-200">
                      {/* Outfit Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">👔</span>
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Complete {message.outfit.occasion} Outfit
                          </h4>
                          <p className="text-xs text-gray-600">{message.outfit.description}</p>
                        </div>
                      </div>

                      {/* Outfit Items */}
                      <div className="space-y-2 mb-3">
                        {message.products.map((product) => (
                          <Link
                            key={product.id}
                            href={`/product/${product.id}`}
                            className="flex gap-3 p-2 bg-white hover:bg-rose-50 rounded-lg transition-colors border border-rose-100"
                          >
                            <div className="relative w-16 h-16 flex-shrink-0 bg-white rounded-md overflow-hidden border border-gray-200">
                              {product.image ? (
                                <Image
                                  src={product.image}
                                  alt={product.name}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                  <svg
                                    className="w-6 h-6 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                                  {product.category}
                                </span>
                              </div>
                              <p className="font-medium text-sm text-gray-900 truncate capitalize mt-1">
                                {product.name}
                              </p>
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-sm text-rose-600 font-semibold">
                                  {formatPrice(product.price)} MMK
                                </p>
                                {product.colors && product.colors.length > 0 && (
                                  <div className="flex gap-1">
                                    {product.colors.slice(0, 3).map((color, idx) => (
                                      <span
                                        key={idx}
                                        className="w-4 h-4 rounded-full border border-gray-300"
                                        style={{ backgroundColor: color }}
                                        title={color}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>

                      {/* Total Price */}
                      <div className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-rose-200">
                        <span className="font-semibold text-gray-700">Total Outfit Price:</span>
                        <span className="text-lg font-bold text-rose-600">
                          {formatPrice(message.outfit.totalPrice)} MMK
                        </span>
                      </div>

                      {/* Styling Tips */}
                      {message.outfit.tips && message.outfit.tips.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-rose-200">
                          <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                            <span>💡</span> Styling Tips:
                          </p>
                          <ul className="space-y-1">
                            {message.outfit.tips.map((tip, idx) => (
                              <li key={idx} className="text-xs text-gray-600 flex items-start gap-1">
                                <span className="text-rose-500 mt-0.5">•</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Regular Product Results */}
                  {!message.isOutfit && message.products && message.products.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.products.slice(0, 5).map((product) => (
                        <Link
                          key={product.id}
                          href={`/product/${product.id}`}
                          className="flex gap-3 p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                        >
                          <div className="relative w-16 h-16 flex-shrink-0 bg-white rounded-md overflow-hidden">
                            {product.image ? (
                              <Image
                                src={product.image}
                                alt={product.name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                <svg
                                  className="w-6 h-6 text-gray-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate capitalize">
                              {product.name}
                            </p>
                            <p className="text-sm text-rose-600 font-semibold">
                              {formatPrice(product.price)} MMK
                            </p>
                            <p className="text-xs text-gray-500">
                              {product.stock > 0
                                ? `In stock: ${product.stock}`
                                : "Out of stock"}
                            </p>
                          </div>
                        </Link>
                      ))}
                      {message.products.length > 5 && (
                        <p className="text-xs text-gray-500 text-center">
                          +{message.products.length - 5} more products
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start gap-2">
                {/* Assistant Avatar */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-pink-200 shadow-sm">
                  <Image
                    src="/lori_adult.png"
                    alt="Iori"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    quality={100}
                  />
                </div>
                
                <div className="bg-white text-gray-800 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 p-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts - Category Menu (Always visible on first message) */}
          {messages.length <= 1 && !isLoading && (
            <div className="px-3 py-2 bg-white border-t border-gray-200">
              {!selectedCategory ? (
                <>
                  <p className="text-xs font-medium text-gray-600 mb-2">How can I help?</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FEATURE_CATEGORIES.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className="px-2 py-1.5 hover:text-pink-600 border border-rose-200 rounded text-xs font-medium text-gray-700 transition-colors text-left"
                      >
                        {category.title}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-700">
                      {FEATURE_CATEGORIES.find(c => c.id === selectedCategory)?.title}
                    </p>
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                    >
                      ← Back
                    </button>
                  </div>
                  <div className="space-y-1">
                    {FEATURE_CATEGORIES.find(c => c.id === selectedCategory)?.examples.map((example, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleQuickPrompt(example);
                          setSelectedCategory(null);
                        }}
                        className="w-full text-left text-xs px-2 py-1.5 border border-rose-200 bg-gray-50 hover:text-pink-600 text-gray-600 rounded transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sliding Menu Panel - Available anytime via menu button */}
          {showMenu && (
            <>
              {/* Backdrop */}
              <div 
                className="absolute inset-0 bg-black/20 z-10"
                onClick={() => {
                  setShowMenu(false);
                  setSelectedCategory(null);
                }}
              />
              
              {/* Menu Panel */}
              <div className="absolute bottom-16 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-20 max-h-[60vh] md:max-h-[400px] overflow-y-auto">
                <div className="px-3 py-3 md:py-2">
                  {!selectedCategory ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm md:text-xs font-medium text-gray-600">How can I help?</p>
                        <button
                          onClick={() => setShowMenu(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-1.5">
                        {FEATURE_CATEGORIES.map((category) => (
                          <button
                            key={category.id}
                            onClick={() => setSelectedCategory(category.id)}
                            className="px-3 py-2 md:px-2 md:py-1.5 hover:text-pink-600 border border-rose-200 rounded text-sm md:text-xs font-medium text-gray-700 transition-colors text-left"
                          >
                            {category.title}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2 md:mb-1.5">
                        <p className="text-sm md:text-xs font-medium text-gray-700">
                          {FEATURE_CATEGORIES.find(c => c.id === selectedCategory)?.title}
                        </p>
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className="text-sm md:text-xs text-rose-600 hover:text-rose-700 font-medium"
                        >
                          ← Back
                        </button>
                      </div>
                      <div className="space-y-2 md:space-y-1">
                        {FEATURE_CATEGORIES.find(c => c.id === selectedCategory)?.examples.map((example, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuickPrompt(example)}
                            className="w-full text-left text-sm md:text-xs px-3 py-2 md:px-2 md:py-1.5 border border-rose-200 bg-gray-50 hover:text-pink-600 text-gray-600 rounded transition-colors"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            className="p-3 md:p-4 bg-white border-t border-gray-200 relative"
          >
            <div className="flex gap-2">
              {/* Menu Button */}
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="px-2.5 md:px-3 py-2.5 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors flex items-center justify-center flex-shrink-0"
                aria-label="Open menu"
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-3 md:px-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="px-4 md:px-5 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-lg flex items-center justify-center flex-shrink-0"
                aria-label="Send message"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
