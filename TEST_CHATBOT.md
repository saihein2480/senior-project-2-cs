  # AI Shopping Assistant Chatbot - Testing Guide

## Status: ✅ READY TO TEST!

The chatbot is fully integrated and ready for testing.

## ⚠️ IMPORTANT: Restart Dev Server After Setup!

If you just added/changed the `GROQ_API_KEY`, you **MUST** restart your dev server:

```bash
# Stop the current dev server (Ctrl+C)
# Then start it again:
npm run dev
```

**Why?** Next.js caches environment variables at startup. Changes to `.env.local` won't take effect until restart!

## How to Test

### 1. Verify API Key Setup
Check your `.env.local` file has:
```bash
GROQ_API_KEY=gsk_your_actual_api_key_here
```

✅ **Your current API key is set and WORKING!** ✅

Get a free key from: https://console.groq.com/keys

### 2. Start the Development Server
```bash
npm run dev
```

### 3. Open the Website
Navigate to: http://localhost:3001

### 4. Click the Chat Button
Look for the floating chat button in the bottom-right corner (💬 icon).

### 5. Try These Test Messages

#### Greeting Tests:
- "Hi"
- "Hello"
- "Hey there"

#### Outfit Recommendation Tests (NEW! 👔):
- **"I need an outfit for a casual date"**
- **"What should I wear to work?"**
- **"Party outfit"**
- **"Business meeting outfit"**
- **"Outfit for a formal event"**
- **"Gym outfit under 100,000"**

#### Product Search Tests:
- "Show me black t-shirts"
- "Do you have jeans under 50,000 MMK?"
- "I want a red dress"
- "Show me new arrivals"
- "Looking for white shirts"
- "Show me blue jeans"

#### Mixed Queries:
- "Show me black pants under 40,000"
- "Red t-shirts"
- "New jackets"

## What to Expect

### ✅ Successful Response:
- Bot responds with friendly message
- **OUTFIT RECOMMENDATIONS**: Shows complete outfit with matching pieces, color-coordinated, total price, and styling tips
- **PRODUCT SEARCH**: Shows product cards below the message (if products found)
- Shows product image, name, price, colors, stock status
- "View Details" button for each product

### Expected Behavior:
1. **Greeting**: Bot introduces itself as StyleBot
2. **Outfit Request**: Bot creates complete outfit (top + bottom + shoes) with styling tips 👔
3. **Product Query**: Bot acknowledges search + shows matching products
4. **No Match**: Bot responds but shows no products
5. **Error**: Error message displayed to user

## Features Implemented

- ✅ Floating chat widget (bottom-right corner)
- ✅ Chat message history
- ✅ **NEW: AI Outfit Recommendations** 👔
  - Complete outfit suggestions (top + bottom + shoes)
  - Occasion-based styling (casual, date, formal, party, business, workout)
  - Color coordination algorithm
  - Budget-aware recommendations
  - Styling tips for each occasion
  - Total outfit price calculation
- ✅ Product search with filters:
  - Color detection (black, white, red, blue, etc.)
  - Category detection (t-shirt, jeans, dress, shirt, pants, jacket)
  - Price filtering (e.g., "under 50000")
  - New arrivals (latest 30 days)
  - In-stock items only
- ✅ Product cards with images
- ✅ Responsive design
- ✅ Error handling
- ✅ Loading states

## Troubleshooting

### ❌ Getting 404 "model_not_found" Errors

**Solution**: Restart your dev server! Environment variables are cached.

```bash
# Press Ctrl+C to stop dev server
npm run dev  # Start again
```

### ❌ "Groq API is not configured" Error

1. Check `.env.local` has `GROQ_API_KEY=gsk_...`
2. Get a free key from: https://console.groq.com/keys
3. **Restart dev server** after adding the key

### Chat Button Not Showing
- Check browser console for errors
- Verify `<ChatBot />` is in `layout.tsx`
- Hard refresh: Ctrl+Shift+R

### No Products Showing
- Check Firebase connection
- Verify `stocks` collection has data
- Check browser console for search errors

### AI Not Responding
- Verify `GROQ_API_KEY` is set in `.env.local`
- **RESTART dev server** after adding/changing API key
- Check server console for API errors
- Test your API key at: https://console.groq.com/playground

## Technical Details

### API Endpoint
- `POST /api/ai-chat`
- Accepts: `{ messages: Message[] }`
- Returns: `{ message: string, products: Product[], totalCount: number }`

### AI Model
- **Service**: Groq API (Free & Fast!)
- **Model**: `openai/gpt-oss-20b` (1000 tokens/sec, free tier)
- **Speed**: Fastest free AI API available
- **Limits**: 250K TPM, 1K RPM (Developer Plan - Free)

### Available Groq Models (August 2026)
Current production models:
- `openai/gpt-oss-20b` ⭐ (Used by default - fastest!)
- `openai/gpt-oss-120b` (More powerful, slightly slower)
- `groq/compound` (Multi-tool AI system)
- `qwen/qwen3.6-27b` (Multilingual)

**Note**: `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` were deprecated on June 17, 2026.

### Product Search Logic
The system uses keyword detection and filters:
1. Detects product-related keywords
2. Extracts filters from user message
3. Searches Firebase `stocks` collection
4. Returns up to 10 matching products

## Success Criteria

- ✅ Chat widget opens/closes smoothly
- ✅ Messages send and receive responses
- ✅ Products display with correct information
- ✅ Images load properly
- ✅ Filters work (color, category, price)
- ✅ Error states handled gracefully
- ✅ Mobile responsive

## Known Limitations

- Maximum 10 products per response
- Only searches in-stock items
- Basic keyword matching (no advanced NLP yet)
- Supports predefined categories only
- Price detection limited to "under X" format

## Future Enhancements

Potential improvements:
- [ ] Conversation memory across sessions
- [ ] Size availability checking
- [ ] Image-based search
- [ ] Comparison features
- [ ] Shopping cart integration
- [ ] Product recommendations
- [ ] Multi-language support

---

**Need Help?** 
- Check console logs for detailed error messages
- Visit Groq Console: https://console.groq.com
- Test API key: https://console.groq.com/playground
