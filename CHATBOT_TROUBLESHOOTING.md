# 🐛 Chatbot Troubleshooting Guide

## Current Issues & Solutions

### Issue 1: "Could not identify specific product" ✅ FIXED

**Problem**: When asking "Do you have this in XL?" on a product page, the chatbot couldn't identify which product you were referring to.

**Solution**: ✅ **FIXED!** The chatbot now:
1. Detects which product page you're on
2. Automatically uses that product for size/color queries
3. Falls back to searching by product name if not on a product page

**How to test after restart**:
```
1. Go to a product page: /product/[id]
2. Open chatbot
3. Ask: "Do you have this in XL?"
4. The bot will now know which product you mean!
```

---

### Issue 2: No Products Found ⚠️ NEEDS FIX

**Problem**: The chatbot found **0 products** in the database.

**Log**: `✅ Found 0 products`

**Cause**: Your `stocks` collection in the web storefront Firebase is empty.

**Solutions**:

#### Option A: Verify Firebase Configuration (RECOMMENDED)

Check that both apps use the same Firebase project:

**POS Admin App** (`.../pos-clothing-store/clothing-store/.env.local`):
```
NEXT_PUBLIC_FIREBASE_PROJECT_ID=senior-project-2-pos-cs
```

**Web Storefront** (`.../pos-clothing-store-web/.env.local`):
```
NEXT_PUBLIC_FIREBASE_PROJECT_ID=senior-project-2-pos-cs
```

They should be **identical**!

#### Option B: Add Products via POS Admin

1. Open POS admin: http://localhost:3000
2. Go to Inventory → Stocks
3. Add products with:
   - Group Name / Name
   - Unit Price
   - Category (shirt, jeans, dress, etc.)
   - Color Variants (with colors and sizes)
   - Stock quantities

#### Option C: Check Firebase Console

1. Go to: https://console.firebase.google.com
2. Select project: `senior-project-2-pos-cs`
3. Go to Firestore Database
4. Check collection: `stocks`
5. Verify there are documents with data

---

### Issue 3: Outfit Recommendations Not Working

**Problem**: Outfit generation returns 0 products.

**Log**: `📦 Total products available: 0`

**Cause**: Same as Issue 2 - empty stocks collection

**Solution**: Add products as described in Issue 2 above

---

## 🔍 Debug Checklist

### 1. Check Firebase Connection

Run this test to see your products:

```javascript
// In browser console on web storefront page:
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const snapshot = await getDocs(collection(db, 'stocks'));
console.log('Total products:', snapshot.size);
snapshot.forEach(doc => console.log(doc.id, doc.data()));
```

### 2. Verify Environment Variables

**Web Storefront** `.env.local` should have:
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

GROQ_API_KEY=your_groq_api_key_here
```

### 3. Restart Dev Server

After any `.env.local` changes:
```bash
# Stop server (Ctrl+C)
npm run dev
```

### 4. Check Console Logs

When testing chatbot, watch for these logs:

**Good Logs:**
```
✅ Groq API initialized
📤 Sending message to Groq: ...
📥 Received response from Groq
📦 Fetched X products with stock
📍 Product context provided: [id]
✅ Found product from context: [name]
```

**Bad Logs:**
```
📦 Total products available: 0
⚠️ Could not identify specific product
❌ Firebase not configured
```

---

## 🎯 Testing Each Feature

### Test 1: Product Search

```
1. Open chatbot
2. Type: "Show me t-shirts"
3. Expected: List of t-shirt products

If you see: "No products found"
→ Issue 2: Add products to Firebase
```

### Test 2: Outfit Recommendations

```
1. Open chatbot
2. Type: "I need an outfit for work"
3. Expected: Complete outfit with 2-4 items

If you see: "Could not generate outfit"
→ Issue 2: Add products to Firebase
```

### Test 3: Product Information

```
1. Go to a product page: /product/[id]
2. Open chatbot
3. Type: "Do you have this in XL?"
4. Expected: Size availability answer

If you see: "Could not identify product"
→ Issue 1: FIXED! Restart server
→ Or Issue 2: No products in database
```

---

## 📋 Quick Fix Steps

### If Chatbot Can't Find Products:

1. **Check both `.env.local` files match**
   - POS admin and web storefront should use same Firebase project

2. **Verify products exist in POS admin**
   - Open: http://localhost:3000
   - Go to: Inventory → Stocks
   - Should see products listed

3. **Check Firebase Console**
   - Go to: https://console.firebase.google.com
   - Project: senior-project-2-pos-cs
   - Check: Firestore → stocks collection

4. **Restart web storefront**
   ```bash
   cd pos-clothing-store-web
   npm run dev
   ```

5. **Test again**
   - Open: http://localhost:3001
   - Try: "Show me products"

---

## 🚀 Expected Behavior After Fixes

### Product Search:
```
User: "Show me black t-shirts"
Bot: "Great choice! Let me find black t-shirts for you."
→ Shows 5-10 product cards
```

### Outfit Recommendations:
```
User: "I need an outfit for work"
Bot: "I'm putting together a professional outfit for you!"
→ Shows 2-4 matching items with total price
```

### Product Information:
```
User: [On product page] "Do you have this in XL?"
Bot: "Let me check XL availability for you!"
→ Shows: ✅ Yes! Size XL available in [colors]
→ Or: ❌ Sorry, XL is out of stock
```

---

## 📞 Still Having Issues?

### Debug Command:

Run this in your terminal to check products:

```bash
# Install Firebase CLI if needed
npm install -g firebase-tools

# Login
firebase login

# List projects
firebase projects:list

# Should see: senior-project-2-pos-cs
```

### Check Logs:

When you test the chatbot, the terminal should show:

```
✅ Groq API initialized
📤 Sending message to Groq: Show me t-shirts
📥 Received response from Groq
📦 Fetched 25 products with stock
✅ Found 10 products
```

If you see `📦 Fetched 0 products`, your database is empty.

---

## ✅ Verification Steps

After adding products:

1. **Open web storefront**: http://localhost:3001
2. **Go to homepage** - Should see products listed
3. **Open chatbot** (💬 button)
4. **Test search**: "Show me products"
5. **Should see**: Product cards appear

If homepage shows products but chatbot doesn't:
- Restart the dev server
- Check browser console for errors
- Check terminal for error logs

---

## 🎉 Success Indicators

You'll know everything is working when:

✅ Homepage displays products
✅ Chatbot search shows products
✅ Outfit recommendations generate
✅ Product info queries work on product pages
✅ No errors in console
✅ Logs show "Fetched X products"

---

**Most likely fix**: Add products to your database via POS admin, then restart the web storefront! 🚀
