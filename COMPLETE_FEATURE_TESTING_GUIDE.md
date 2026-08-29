# 🧪 Complete Chatbot Testing Guide

## 🎉 ALL 7 FEATURES INTEGRATED!

Your AI Shopping Assistant now has **7 major capabilities**:

1. 🔍 **Product Search** - Find products by filters
2. 👔 **Outfit Recommendations** - Complete outfit curation
3. 📦 **Product Information** - Detailed product queries
4. 📏 **Size Recommendations** - Based on measurements
5. 📦 **Order Support** - Track, cancel, return orders
6. 🎉 **Promotions** - Discounts, coupons, sales
7. 🏪 **Store Information** - Location, hours, policies

---

## 🚀 Getting Started

### 1. Restart Dev Server (REQUIRED!)
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### 2. Open Website
```
http://localhost:3001
```

### 3. Click Chat Button
Look for the 💬 button in bottom-right corner

---

## 📋 Feature Testing

### Feature 1: 🔍 Product Search

**Test Queries:**
```
"Show me black t-shirts"
"Find jeans under 50,000"
"New arrivals"
"Red dresses"
"Show me products"
```

**Expected:**
- Bot responds with search acknowledgment
- Product cards appear (up to 10)
- Shows images, names, prices
- "View Details" buttons work

---

### Feature 2: 👔 Outfit Recommendations

**Test Queries:**
```
"I need an outfit for a casual date"
"What should I wear to work?"
"Party outfit under 150,000"
"Gym outfit"
"Help me dress for a formal event"
"Business meeting outfit"
```

**Expected:**
- Bot acknowledges occasion
- Shows 2-4 matching items
- Category labels (Top, Bottom, Footwear)
- Total outfit price
- Styling tips
- Color-coordinated pieces

---

### Feature 3: 📦 Product Information

**Test Queries:**

**On Product Page:**
```
"Do you have this in XL?"
"What colors does this come in?"
"How much is this?"
"Is this in stock?"
"What material is this?"
```

**Expected:**
- Specific answer (Yes/No for availability)
- Quantity available
- Alternative options
- Complete product details
- Product card displayed

---

### Feature 4: 📏 Size Recommendations ⭐ NEW!

**Test Queries:**
```
"I'm 170cm and 65kg, what size should I get?"
"My height is 5'7\" and weight is 140lbs"
"Chest 95cm, waist 80cm"
"What size for 165cm tall person?"
"I usually wear M, what size here?"
```

**Expected Response Example:**
```
📏 Size Recommendation

🎯 Recommended Size: M
📊 Confidence: Medium

🔄 Alternative Sizes: S, L

💡 Notes:
• This recommendation is based on height and weight
• For best fit, please provide chest/waist measurements
• If between sizes, choose the larger size for comfort
```

---

### Feature 5: 📦 Order Support ⭐ NEW!

**Test Queries:**
```
"Where is my order OR12345678?"
"Track order OR12345678"
"Can I cancel my order OR12345678?"
"Can I return order OR12345678?"
"Order status OR12345678"
```

**Expected Response Example:**
```
📦 Order OR12345678

🚚 Status: Shipped
Your order is on the way!

💳 Payment: COD (pending)
💰 Total Amount: 125,000 MMK

📋 Items:
• Blue Jeans x1 - 75,000 MMK
• White T-Shirt x2 - 50,000 MMK

🔢 Tracking Number: TRK123456789
📅 Order Date: December 1, 2026

✅ Can Cancel: Yes (COD orders anytime)
❌ Cannot Return: Order must be delivered first
```

**If no order found:**
```
❌ I couldn't find order OR12345678.

Please check:
• Order reference is correct
• Order was placed on our website

Need help? Contact us at +95 9 123 456 789
```

---

### Feature 6: 🎉 Promotions ⭐ NEW!

**Test Queries:**
```
"Any discounts available?"
"Coupon codes?"
"Current sales?"
"What promotions do you have?"
"Any special offers?"
"New arrivals"
```

**Expected Response Example:**
```
🎉 Current Promotions:

**🆕 New Arrivals Collection**
Check out our latest fashion pieces!

**🎉 Weekend Flash Sale**
Get 20% off on selected items!
💰 20% OFF
⏰ Valid for 3 more days

**👋 Welcome Discount**
First-time customer? Get 10% off!
💰 10% OFF
🎫 Code: WELCOME10

**🚚 Free Shipping**
Free delivery on orders over 100,000 MMK!
📦 Min. Purchase: 100,000 MMK
```

---

### Feature 7: 🏪 Store Information ⭐ NEW!

**Test Queries:**

**Location:**
```
"Where is your shop?"
"Store location?"
"Your address?"
```

**Hours:**
```
"What are your hours?"
"When do you open?"
"Store timings?"
```

**Delivery:**
```
"Do you offer delivery?"
"Shipping options?"
"Delivery areas?"
```

**Payment:**
```
"What payment methods?"
"Do you accept COD?"
"Payment options?"
```

**Returns:**
```
"Return policy?"
"Can I return items?"
"Exchange policy?"
```

**Expected Response Examples:**

**Location Query:**
```
📍 Main Branch
📫 Address: 123 Fashion Street, Downtown, Yangon
📞 Phone: +95 9 123 456 789
🕐 Hours: Monday - Sunday: 9:00 AM - 9:00 PM
```

**Delivery Query:**
```
🚚 Delivery Information:

✅ We deliver to: Yangon, Mandalay, Naypyidaw, Bago, Mawlamyine
💰 Delivery Fee: 2,000 - 5,000 MMK
⏱️ Estimated Time: 2-5 business days

Orders processed within 1-2 business days.
```

**Payment Query:**
```
💳 Accepted Payment Methods:

✅ Cash on Delivery (COD)
✅ MyanmarPay
✅ KBZ Pay
✅ Wave Money
✅ Credit/Debit Cards
```

---

## 🎯 Feature Priority Order

The chatbot checks queries in this order:

1. **Size Recommendation** (if measurements detected)
2. **Order Support** (if order reference found)
3. **Promotions** (if asking about discounts/sales)
4. **Store Info** (if asking about store details)
5. **Product Info** (if asking about specific product)
6. **Outfit Recommendation** (if asking for outfit)
7. **Product Search** (fallback)

This ensures the most specific query is handled first!

---

## ✅ Success Indicators

**Everything works when:**
- ✅ Chat button appears and opens smoothly
- ✅ AI responds within 2-3 seconds
- ✅ Correct feature is triggered for each query
- ✅ Responses are accurate and helpful
- ✅ No errors in browser console
- ✅ No errors in terminal logs
- ✅ Product cards display properly
- ✅ Images load correctly

---

## 🐛 Troubleshooting

### Chat not responding
- Check GROQ_API_KEY in .env.local
- Restart dev server
- Check terminal for errors

### Wrong feature triggered
- Be more specific in your query
- Include keywords (order number, measurements, etc.)

### No products found
- Database might be empty
- Add products via POS admin
- Check Firebase connection

### Order not found
- Order reference must be exact
- Check `onlineOrders` collection in Firebase
- Format: OR followed by numbers

---

## 📊 Feature Coverage

| Feature | Keywords | Priority |
|---------|----------|----------|
| Size Recommendation | height, weight, cm, kg, measurements | 1 (Highest) |
| Order Support | order, OR123, track, cancel, return | 2 |
| Promotions | discount, coupon, sale, promotion | 3 |
| Store Info | where, hours, delivery, payment, policy | 4 |
| Product Info | size XL, color, price, stock, material | 5 |
| Outfit Recommendation | outfit, date, work, party, formal | 6 |
| Product Search | show, find, search, product names | 7 (Fallback) |

---

## 🎓 Testing Scenarios

### Scenario 1: New Customer Journey
```
1. "Hi" → Bot introduces all capabilities
2. "What promotions?" → Shows discounts
3. "Show me t-shirts" → Product search
4. [Go to product page]
5. "Do you have this in L?" → Size check
6. "I'm 175cm and 70kg, what size?" → Size recommendation
7. "Where is your shop?" → Store info
```

### Scenario 2: Order Tracking
```
1. "Where is my order OR12345678?" → Order status
2. "Can I cancel this?" → Cancellation eligibility
3. "Can I return it?" → Return eligibility
```

### Scenario 3: Shopping for Event
```
1. "I need an outfit for work" → Outfit recommendation
2. [Views outfit items]
3. "Do you have the shirt in XL?" → Size check
4. "What colors?" → Color options
5. "Any discounts?" → Promotions
```

---

## 📞 Quick Reference

### Test All Features:
```bash
# 1. Size Recommendation
"I'm 170cm and 65kg, what size?"

# 2. Order Support  
"Where is my order OR12345678?"

# 3. Promotions
"Any discounts?"

# 4. Store Info
"Where is your shop?"

# 5. Product Info
[On product page] "Do you have this in XL?"

# 6. Outfit Recommendation
"Outfit for a date"

# 7. Product Search
"Show me black t-shirts"
```

---

## 🎉 Summary

**Total Features**: 7
**New Features Added**: 4 (Size Rec, Order Support, Promotions, Store Info)
**Total Capabilities**: 30+ different query types
**Response Time**: 1-3 seconds
**Cost**: FREE (Groq API)

---

## 🔮 Next Steps

After testing:
1. ✅ Verify all features work
2. ✅ Customize store information in `storeInfo.ts`
3. ✅ Add your promotions in `promotions.ts`
4. ✅ Test with real orders in database
5. ✅ Deploy to production!

---

**Your AI Shopping Assistant is now complete with 7 powerful features! 🚀**

Happy testing! 🎉
