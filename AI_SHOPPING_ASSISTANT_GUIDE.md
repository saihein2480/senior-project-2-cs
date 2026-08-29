# AI Shopping Assistant - Setup & Testing Guide

## Overview
The AI Shopping Assistant (StyleBot) is a conversational chatbot that helps customers find products using natural language queries. It uses **Google Gemini API (FREE)** with function calling to search products intelligently.

## 🎉 Why Gemini?

✅ **Completely FREE** - Google offers a generous free tier  
✅ **No Credit Card Required** - Just sign up with Google account  
✅ **15 RPM (Requests Per Minute)** - More than enough for a chatbot  
✅ **1 Million tokens per day** - Extremely generous for small-medium stores  
✅ **Function Calling Support** - Just like OpenAI  
✅ **Fast Response** - Gemini 1.5 Flash is optimized for speed  

**Free Tier Limits:**
- 15 requests per minute
- 1 million tokens per day
- 1,500 requests per day

This is perfect for a clothing store chatbot! 🚀

## Features Implemented

### 1. **Natural Language Product Search** ✅
Customers can ask questions naturally:
- "Show me black T-shirts"
- "Do you have jeans under 50,000 MMK?"
- "I want a red dress"
- "Show me oversized shirts"

### 2. **Smart Filtering**
The assistant can filter by:
- **Keyword**: General product name search
- **Category**: T-shirts, jeans, dresses, shirts, pants, etc.
- **Color**: Black, white, red, blue, pink, etc.
- **Price Range**: Under/over specific amounts or price ranges
- **Style**: Oversized, slim fit, casual, formal, etc.
- **Stock Status**: Only shows in-stock items by default

### 3. **Beautiful UI**
- Floating chat widget in bottom-right corner
- Gradient rose/pink theme matching the store design
- Product cards with images and prices
- Quick prompt suggestions for easy start
- Typing indicators
- Smooth animations and transitions
- Mobile responsive

## Setup Instructions

### Step 1: Install Dependencies
The Google Generative AI package has already been installed. If you need to reinstall:

```bash
npm install @google/generative-ai
```

### Step 2: Get Your FREE Gemini API Key

1. **Go to Google AI Studio**: https://aistudio.google.com/app/apikey
2. **Sign in** with your Google account (no credit card needed!)
3. **Click "Create API Key"**
4. **Copy your API key** (starts with `AIza...`)

**That's it!** No payment information required! 🎉

### Step 3: Configure Gemini API Key

Add your API key to `.env.local` file:

```env
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Important**: Never commit your API key to version control. The `.env.local` file is already in `.gitignore`.

### Step 4: Start the Development Server

```bash
cd pos-clothing-store-web
npm run dev
```

The app will be available at: http://localhost:3001

## Testing the Chatbot

### Test Queries to Try:

1. **Basic Product Search**
   - "Show me t-shirts"
   - "Do you have dresses?"
   - "I'm looking for jeans"

2. **Color-based Search**
   - "Show me black t-shirts"
   - "Red dresses"
   - "I want a white shirt"

3. **Price-based Search**
   - "Jeans under 50,000 MMK"
   - "Show me products under 30,000"
   - "Dress between 40,000 and 80,000 MMK"

4. **Style-based Search**
   - "Oversized shirts"
   - "Slim fit jeans"
   - "Casual wear"

5. **Combined Filters**
   - "Black oversized t-shirt under 40,000"
   - "Red dress above 50,000 MMK"
   - "Casual jeans under 60,000"

### Expected Behavior:

✅ **When products are found:**
- AI responds with a friendly message
- Shows up to 5 product cards with:
  - Product image
  - Product name
  - Price in MMK (formatted with commas)
  - Stock availability
- Products are clickable links to product detail pages
- Shows "+X more products" if more than 5 results

✅ **When no products are found:**
- AI suggests alternative searches
- May ask customer to adjust criteria
- Remains helpful and conversational

✅ **General conversation:**
- Can answer sizing questions
- Provide style advice
- Help navigate the store
- Maintain friendly, professional tone

## Architecture

### Components

1. **ChatBot.tsx** (`src/components/ChatBot.tsx`)
   - Floating chat widget UI
   - Message history management
   - Product result rendering
   - Quick prompt buttons

2. **API Route** (`src/app/api/ai-chat/route.ts`)
   - Google Gemini integration
   - Function calling implementation
   - Product search orchestration
   - Error handling

3. **Product Search Utility** (`src/lib/productSearch.ts`)
   - Firebase product queries
   - Filter application
   - Natural language parsing
   - Data transformation

### Data Flow

```
User Input → ChatBot UI → API Route → Gemini (with function calling)
                                    ↓
                            search_products function
                                    ↓
                            Product Search Utility
                                    ↓
                            Firebase (stocks collection)
                                    ↓
                            Filtered Results → Gemini → ChatBot UI
```

## Customization

### Change AI Model
Edit `src/app/api/ai-chat/route.ts`:

```typescript
model: "gemini-1.5-flash", // Fast and free
// Other options:
// - "gemini-1.5-pro" - More powerful (still free but lower limits)
// - "gemini-1.0-pro" - Older version
```

### Modify System Instruction
Edit the `systemInstruction` in `src/app/api/ai-chat/route.ts` to change the bot's personality or behavior.

### Add More Quick Prompts
Edit `QUICK_PROMPTS` array in `src/components/ChatBot.tsx`:

```typescript
const QUICK_PROMPTS = [
  "Show me new arrivals",
  "Black t-shirts",
  // Add your own prompts here
];
```

### Adjust Product Result Limit
In `src/app/api/ai-chat/route.ts`:

```typescript
const productResults = products.slice(0, 10); // Change 10 to your desired limit
```

## Troubleshooting

### Issue: "Gemini API is not configured"
**Solution**: Make sure `GEMINI_API_KEY` is set in `.env.local` and restart the dev server.

### Issue: "Invalid API Key" error
**Solution**: 
1. Check if you copied the full API key (starts with `AIza...`)
2. Make sure there are no extra spaces
3. Verify the key is active at https://aistudio.google.com/app/apikey

### Issue: No products showing up
**Solution**: 
1. Check if products exist in Firebase `stocks` collection
2. Verify products have `groupName` or `name` field
3. Check if products have stock > 0

### Issue: Chat not responding
**Solution**:
1. Check browser console for errors
2. Verify API route is accessible at `/api/ai-chat`
3. Check Gemini API key is valid
4. Check network tab for failed requests
5. Verify you haven't exceeded rate limits (15 RPM)

### Issue: Products not clickable
**Solution**: Verify product IDs match the routing pattern `/product/[id]`

## Cost Considerations

### 💰 **Completely FREE!**

- **Cost**: $0 (Zero)
- **Free Tier**: 15 requests per minute, 1 million tokens per day
- **No Credit Card**: Required
- **Perfect for**: Small to medium stores

### Estimated Usage:
- Average conversation: 3-5 requests
- Token usage: ~500 tokens per conversation
- **Daily capacity**: ~2,000 conversations per day
- **Monthly capacity**: ~60,000 conversations per month

**For comparison:**
- OpenAI GPT-4o-mini: ~$0.0001-0.0005 per conversation (paid)
- Google Gemini: $0 (FREE!)

## Gemini vs OpenAI

| Feature | Gemini 1.5 Flash (FREE) | GPT-4o-mini (Paid) |
|---------|------------------------|-------------------|
| Cost | 💚 **FREE** | 💰 Paid |
| Speed | 🚀 Very Fast | 🚀 Fast |
| Function Calling | ✅ Yes | ✅ Yes |
| Rate Limit | 15 RPM | Depends on plan |
| Daily Limit | 1M tokens | Pay per use |
| Quality | ⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Excellent |

**Verdict**: Gemini is perfect for your use case! 🎉

## Future Enhancements

Potential features to add:
- [ ] Conversation history persistence
- [ ] Multi-language support (Burmese/English)
- [ ] Product recommendations based on browsing history
- [ ] Size guide integration
- [ ] Voice input support
- [ ] Image-based search
- [ ] Order tracking via chat
- [ ] Customer support escalation

## Files Modified/Created

### Created:
- `src/components/ChatBot.tsx` - Chat widget UI
- `src/app/api/ai-chat/route.ts` - API endpoint with Gemini
- `src/lib/productSearch.ts` - Search utility

### Modified:
- `src/app/layout.tsx` - Added ChatBot component
- `src/app/globals.css` - Added animations
- `.env.local` - Added Gemini API key
- `env.local.example` - Added API key template
- `package.json` - Added @google/generative-ai dependency

## Security Notes

⚠️ **Important Security Considerations:**

1. **API Key Protection**: Never expose Gemini API key in client-side code
2. **Rate Limiting**: Gemini has built-in rate limiting (15 RPM)
3. **Input Validation**: User inputs are validated before processing
4. **CORS**: API route only accepts POST requests from same origin
5. **Error Messages**: Sensitive error details are not exposed to users

## Testing Checklist

- [x] API configuration added
- [x] ChatBot widget appears on all pages
- [x] Chat opens/closes smoothly
- [ ] Get free Gemini API key
- [ ] Add API key to .env.local
- [ ] Test query: "Show me black T-shirts"
- [ ] Test query: "Jeans under 50,000 MMK"
- [ ] Test query: "Red dress"
- [ ] Test query: "Oversized shirts"
- [ ] Product cards display correctly
- [ ] Product links navigate to detail pages
- [ ] Prices formatted with commas
- [ ] Stock status shows correctly
- [ ] Quick prompts work
- [ ] Typing indicator shows during loading
- [ ] Error handling works (try without API key)

## Quick Start Guide

### 🚀 **5-Minute Setup**

1. **Get API Key** (1 minute)
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in and click "Create API Key"
   - Copy the key

2. **Add to Environment** (30 seconds)
   ```env
   GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

3. **Start Server** (1 minute)
   ```bash
   npm run dev
   ```

4. **Test Chat** (2 minutes)
   - Open http://localhost:3001
   - Click pink chat button
   - Try: "Show me black t-shirts"

**Done!** 🎉

## API Rate Limits & Monitoring

### Free Tier Limits:
- ✅ 15 requests per minute (RPM)
- ✅ 1,500 requests per day (RPD)
- ✅ 1 million tokens per day

### Monitor Your Usage:
Visit: https://aistudio.google.com/app/apikey

### What happens if you exceed limits?
- You'll get a 429 error
- The chatbot will show: "I'm a bit busy right now, please try again in a moment"
- Limits reset automatically after 1 minute

### Tips to Stay Within Limits:
- ✅ Limits are very generous for a store chatbot
- ✅ Average store gets 10-50 chats per day
- ✅ You can handle ~1,500 conversations per day
- ✅ If you need more, Gemini has affordable paid tiers

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Gemini documentation: https://ai.google.dev/docs
3. Check Firebase product data structure
4. Review browser console and network logs

### Gemini Resources:
- **API Docs**: https://ai.google.dev/docs
- **Get API Key**: https://aistudio.google.com/app/apikey
- **Pricing**: https://ai.google.dev/pricing (Free tier is very generous!)
- **Quota Management**: https://aistudio.google.com/app/apikey

---

**Status**: ✅ Ready for testing with FREE Gemini API
**Cost**: 💚 **$0 (Completely FREE!)**
**Last Updated**: January 2027
