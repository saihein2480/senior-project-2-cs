# 🔑 How to Get Your Gemini API Key (Step by Step)

## The API key in your .env.local looks incorrect!

Your current key: `YOUR_CURRENT_KEY_HERE`  
✅ **Correct format should be**: `AIzaSy...` (starts with AIza)

## 📝 Step-by-Step Instructions

### Step 1: Open Google AI Studio

Click this link or copy-paste it into your browser:
```
https://aistudio.google.com/app/apikey
```

### Step 2: Sign In

- Use any Google/Gmail account
- No credit card needed!

### Step 3: Create API Key

You'll see a button that says **"Create API Key"** or **"Get API Key"**

Click it and you'll see two options:

1. **"Create API key in new project"** ← Choose this (recommended)
2. "Create API key in existing project"

### Step 4: Copy the Key

After creating, you'll see your API key. It should look like:

```
AIzaSyAbc123XYZ...more characters...789
```

**Important**: The key should:
- ✅ Start with `AIza`
- ✅ Be about 39 characters long
- ✅ Contain letters and numbers

### Step 5: Add to .env.local

Open your `.env.local` file and **REPLACE** this line:

```env
GEMINI_API_KEY=YOUR_CURRENT_INVALID_KEY_HERE
```

With your new key:

```env
GEMINI_API_KEY=AIzaSyAbc123XYZ...your-actual-key...789
```

### Step 6: Restart the Server

Stop the dev server (Ctrl+C) and restart:

```bash
npm run dev
```

### Step 7: Test

1. Open http://localhost:3001
2. Click the pink chat button
3. Try asking: "Show me black t-shirts"

## 🔍 Troubleshooting

### Issue: Can't find "Create API Key" button?

**Solution**: Make sure you're at the correct URL:
- ✅ https://aistudio.google.com/app/apikey
- ❌ NOT: https://console.cloud.google.com (wrong place!)

### Issue: Key still not working?

1. **Check the format**: Does it start with `AIza`?
2. **No spaces**: Make sure there are no spaces before or after the key
3. **Restart server**: Always restart after changing .env.local
4. **Check console**: Open browser console (F12) to see error messages

### Issue: Page asks me to enable API?

If Google AI Studio asks you to enable the Gemini API:
1. Click "Enable"
2. Wait a few seconds
3. Try creating the API key again

## 📋 Quick Checklist

- [ ] Go to https://aistudio.google.com/app/apikey
- [ ] Sign in with Google account
- [ ] Click "Create API Key"
- [ ] Select "Create API key in new project"
- [ ] Copy the key (should start with `AIza`)
- [ ] Open `.env.local`
- [ ] Replace the GEMINI_API_KEY line
- [ ] Save the file
- [ ] Restart server: `npm run dev`
- [ ] Test the chatbot

## ✅ Verify Your Key Format

Your API key should look like this:

```
AIzaSyDpZ5uW3x8K2m7TqL9vN1eR4gH6jY8fC0a
     ^^^ Must start with AIza
```

**NOT like this:**
```
AQ.Ab8RN6K... ← This is wrong format
pk_test_... ← This is wrong (that's a payment API key)
sk_test_... ← This is wrong (that's a secret key)
```

## 🎯 Expected Result

Once you have the correct key:

1. The chatbot should respond to your messages
2. No errors in the console
3. Product search should work

## Need More Help?

If you're still stuck:

1. **Check browser console** (F12 → Console tab)
2. **Look for error messages** - they'll tell you what's wrong
3. **Share the error** message (not your API key!)

---

**Remember**: Your API key is FREE and should start with `AIza`! 🎉
