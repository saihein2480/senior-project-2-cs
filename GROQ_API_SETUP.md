# 🚀 Groq API Setup - FREE & SUPER FAST!

## Why Groq is Perfect

✅ **100% FREE** - No credit card required  
✅ **Super Fast** - 10x faster than OpenAI  
✅ **Generous Limits** - 30 requests per minute (RPM)  
✅ **Llama 3 Models** - State-of-the-art open-source AI  
✅ **Easy Setup** - Takes 2 minutes  

## Step-by-Step Setup (2 Minutes!)

### Step 1: Get Your FREE Groq API Key

1. **Go to**: https://console.groq.com/keys

2. **Sign up** with:
   - Google account (easiest)
   - GitHub account
   - Or email

3. **Create API Key**:
   - Click "Create API Key"
   - Give it a name (e.g., "Clothing Store Chatbot")
   - Click "Submit"

4. **Copy your API key**:
   - It looks like: `gsk_...` (starts with gsk_)
   - **Save it immediately** (you can only see it once!)

### Step 2: Add to Your Project

Open `.env.local` and add:

```env
GROQ_API_KEY=gsk_your_actual_api_key_here
```

### Step 3: Restart Server

```bash
npm run dev
```

### Step 4: Test!

1. Open http://localhost:3001
2. Click the pink chat button
3. Try: "Show me black t-shirts"

**Done!** 🎉

## Free Tier Limits

What you get for **FREE**:
- ✅ **30 requests per minute**
- ✅ **14,400 requests per day**
- ✅ **No expiration**
- ✅ **No credit card required**

### What This Means:
- 👥 Can handle **1,000+ customer conversations per day**
- 💬 Each conversation = 3-5 requests
- 📊 **More than enough** for a clothing store
- 💰 **Total Cost: $0**

### Real Example:
If you have 200 customers per day who each ask 5 questions:
- Total requests: 1,000 per day
- Your limit: 14,400 per day
- **You're only using 7% of your free limit!** 🎉

## Models Available

We're using: **`llama-3.3-70b-versatile`**

Why this model?
- ✅ Very intelligent (70 billion parameters)
- ✅ Extremely fast
- ✅ Great at conversations
- ✅ Completely free

Other free models available:
- `llama-3.1-8b-instant` (Faster, simpler tasks)
- `mixtral-8x7b-32768` (Long context)
- `gemma-7b-it` (Google's model)

## API Key Format

✅ **Correct format**: `gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Must start with `gsk_`!

If your key doesn't start with `gsk_`, you copied the wrong thing.

## Troubleshooting

### ❌ "Groq API not configured"
**Solution**: 
1. Check `.env.local` has `GROQ_API_KEY=gsk_...`
2. Restart dev server: `npm run dev`
3. Key must start with `gsk_`

### ❌ "Invalid API key"
**Solution**:
1. Go to https://console.groq.com/keys
2. Create a NEW API key
3. Copy it immediately (you only see it once)
4. Paste into `.env.local`
5. Restart server

### ❌ "Rate limit exceeded"
**Solution**:
- Wait 1 minute (limits reset automatically)
- Free tier: 30 RPM (requests per minute)
- Very generous for normal usage

### ❌ Chat not responding
**Solution**:
1. Check browser console (F12) for errors
2. Check terminal for errors
3. Verify API key starts with `gsk_`
4. Make sure you restarted the server

## Groq vs Others

| Feature | Groq (FREE) | OpenAI (Paid) | Gemini (Issues) |
|---------|-------------|---------------|-----------------|
| **Cost** | 💚 $0/month | 💰 ~$10/month | 🚫 Blocked |
| **Speed** | ⚡ Ultra Fast | 🐢 Slower | ❓ Unknown |
| **Setup** | 🚀 2 minutes | ⏰ 5 minutes | 😰 Complex |
| **Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Limits** | 30 RPM | Pay per use | 🚫 Denied |
| **Best For** | 🏪 Stores | 🏢 Enterprise | ❌ Not working |

**Verdict**: Groq is perfect for your clothing store chatbot! 🎉

## Test Queries to Try

Once setup, test with these:

1. **Basic Search**
   - "Show me t-shirts"
   - "Do you have jeans?"
   - "I'm looking for dresses"

2. **Color Search**
   - "Black t-shirts"
   - "Red dress"
   - "White shirts"

3. **Price Search**
   - "Jeans under 50,000 MMK"
   - "Products under 30,000"

4. **New Arrivals**
   - "Show me new arrivals"
   - "What's new?"

5. **Conversation**
   - "Hi"
   - "Can you help me find something?"

## Expected Response Time

- ⚡ **Groq**: 0.5-1 second (VERY FAST!)
- 🐢 OpenAI: 2-3 seconds
- 🐌 Others: 3-5 seconds

Groq is 3-5x faster than competitors!

## Monitoring Your Usage

Check your usage at: https://console.groq.com/settings/usage

You can see:
- Requests per day
- Tokens used
- Rate limit status

## Security

✅ **DO:**
- Keep API key in `.env.local`
- Add `.env.local` to `.gitignore` (already done)
- Use environment variables

❌ **DON'T:**
- Share API key publicly
- Commit API key to GitHub
- Put API key in client-side code

## Need Help?

### Resources:
- 🔑 **Get API Key**: https://console.groq.com/keys
- 📚 **Documentation**: https://console.groq.com/docs
- 📊 **Usage**: https://console.groq.com/settings/usage
- 💬 **Support**: https://console.groq.com/support

### Common Questions:

**Q: Is it really free forever?**  
A: Yes! Groq offers a generous free tier for developers.

**Q: What if I exceed the limits?**  
A: Very unlikely for a normal store (30 RPM is a lot). If you do, they have affordable paid tiers.

**Q: Do I need a credit card?**  
A: No! Completely free with just an email or Google account.

**Q: How does it compare to OpenAI?**  
A: Faster and free! Quality is excellent for chatbots.

**Q: Can I use it in production?**  
A: Yes! Groq is production-ready and used by many companies.

---

## ✅ Quick Checklist

- [ ] Go to https://console.groq.com/keys
- [ ] Sign up (Google/GitHub/Email)
- [ ] Click "Create API Key"
- [ ] Name it "Clothing Store Chatbot"
- [ ] Copy the key (starts with `gsk_`)
- [ ] Open `.env.local`
- [ ] Add: `GROQ_API_KEY=gsk_your_key_here`
- [ ] Save file
- [ ] Run: `npm run dev`
- [ ] Open: http://localhost:3001
- [ ] Click pink chat button
- [ ] Test: "Show me black t-shirts"
- [ ] 🎉 Done!

**Total Time**: 2-3 minutes  
**Total Cost**: $0 (FREE!)  

Enjoy your super-fast AI Shopping Assistant! 🚀
