# 📦 AI Product Information Feature

## 🎉 NEW FEATURE ADDED!

The chatbot can now answer detailed questions about products including price, sizes, colors, material, and stock availability!

---

## ✨ What's New

### Detailed Product Queries
Customers can now ask specific questions about products:
- ✅ **Size availability**: "Do you have this in XL?"
- ✅ **Color options**: "What colors does this come in?"
- ✅ **Price information**: "How much is this?"
- ✅ **Material details**: "What is this made of?"
- ✅ **Stock availability**: "Is this in stock?"
- ✅ **General information**: Complete product details

---

## 📝 How to Use

### Example Queries

#### Size Availability:
```
"Do you have this shirt in XL?"
"Is size L available?"
"Do you have this in medium?"
"Is XL in stock?"
```

**Response:**
```
✅ Yes! Size XL is available in Black, White, Blue. 
We have 15 unit(s) available.

📦 Product Name
💰 Price: 45,000 MMK
🎨 Available Colors: Black, White, Blue
📏 Available Sizes: S, M, L, XL, XXL
📊 Total Stock: 85 units
```

#### Color Availability:
```
"What colors does this come in?"
"Do you have this in black?"
"Is red available?"
"Show me color options"
```

**Response:**
```
✅ Yes! Black is available in sizes: S, M, L, XL. 
We have 20 unit(s) in stock.

📦 Product Name
🎨 Available Colors: Black, White, Red, Blue, Navy
```

#### Price Information:
```
"How much is this?"
"What's the price?"
"How much does this cost?"
"Price?"
```

**Response:**
```
📦 Product Name
💰 Price: 45,000 MMK
🎨 Available Colors: Black, White, Blue
📏 Available Sizes: S, M, L, XL
📊 Total Stock: 85 units
```

#### Material Information:
```
"What is this made of?"
"What material?"
"What fabric is this?"
```

**Response:**
```
📦 Product Name
🧵 Material: 100% Cotton
💰 Price: 45,000 MMK
```

#### Stock Availability:
```
"Is this in stock?"
"Do you have this available?"
"Is this available?"
```

**Response:**
```
✅ Yes! This item is in stock.
📊 Total Stock: 85 units
🎨 Available Colors: Black, White, Blue
📏 Available Sizes: S, M, L, XL, XXL
```

#### General Information:
```
"Tell me about this product"
"Product details"
"More information"
```

**Response:**
```
📦 Product Name
💰 Price: 45,000 MMK
📂 Category: T-Shirt
🎨 Available Colors: Black, White, Blue
📏 Available Sizes: S, M, L, XL, XXL
🧵 Material: 100% Cotton
📊 Total Stock: 85 units

📝 Description: Comfortable and stylish t-shirt 
perfect for everyday wear...
```

---

## 🎯 Supported Query Types

### 1. **Size Queries**
Detects when customers ask about sizes:

**Keywords**: size, XL, XXL, large, medium, small, XS, S, M, L

**What it does**:
- Extracts the size from the message (XS, S, M, L, XL, XXL, etc.)
- Checks availability across all colors
- Shows which colors have that size
- Displays quantity available

**Examples**:
- "Do you have this in XL?" → Checks XL availability
- "Is size M available?" → Checks M availability
- "Large size?" → Checks L availability

### 2. **Color Queries**
Detects when customers ask about colors:

**Keywords**: color, colour, black, white, red, blue, green, yellow, pink, purple

**What it does**:
- Extracts the color from the message
- Checks availability of that color
- Shows which sizes are available in that color
- Displays quantity available

**Examples**:
- "Do you have this in black?" → Checks black availability
- "What colors?" → Shows all available colors
- "Is red available?" → Checks red availability

### 3. **Price Queries**
Detects when customers ask about pricing:

**Keywords**: price, cost, how much

**What it does**:
- Shows the product price
- Displays in formatted MMK
- Includes other relevant product info

**Examples**:
- "How much is this?" → Shows price
- "What's the price?" → Shows price
- "Cost?" → Shows price

### 4. **Material Queries**
Detects when customers ask about materials:

**Keywords**: material, fabric, made of

**What it does**:
- Shows the material composition
- Example: "100% Cotton", "Polyester Blend"

**Examples**:
- "What is this made of?" → Shows material
- "What fabric?" → Shows material

### 5. **Stock Queries**
Detects when customers ask about availability:

**Keywords**: stock, available, in stock, do you have

**What it does**:
- Checks overall stock status
- Shows total quantity
- Lists available colors and sizes

**Examples**:
- "Is this in stock?" → Shows stock status
- "Do you have this?" → Shows availability
- "Available?" → Shows stock info

### 6. **General Information**
Any product-related question not covered above:

**What it does**:
- Shows complete product information
- All colors, sizes, price, material
- Product description
- Stock details

---

## 🔍 How It Works

### Detection Algorithm:
```
1. User sends message
2. AI responds with natural language
3. System detects product info keywords
4. Identifies query type (size/color/price/etc.)
5. Extracts specific details (size: XL, color: black)
6. Searches for product in database
7. Retrieves detailed product information
8. Formats response with relevant data
9. Displays product card + detailed text
```

### Product Matching:
The system tries to identify which product the user is asking about by:
1. Looking for product names in the message
2. Searching keywords (excluding common words)
3. Matching against product database
4. Context from recent conversation (future enhancement)

---

## 📊 Information Provided

### Product Data Included:
- ✅ **Name**: Product/Group name
- ✅ **Price**: Formatted in MMK
- ✅ **Category**: Product category
- ✅ **Colors**: All available colors
- ✅ **Sizes**: All available sizes
- ✅ **Material**: Fabric composition
- ✅ **Stock**: Total quantity
- ✅ **Description**: Product description
- ✅ **Images**: Product image

### Size-Specific Data:
- ✅ Size availability (yes/no)
- ✅ Quantity available
- ✅ Which colors have that size
- ✅ Alternative sizes if unavailable

### Color-Specific Data:
- ✅ Color availability (yes/no)
- ✅ Quantity available
- ✅ Which sizes have that color
- ✅ Alternative colors if unavailable

---

## 🎨 Response Format

### Positive Response (Available):
```
✅ Yes! Size XL is available in Black, White, Blue.
We have 15 unit(s) available.

📦 Classic Cotton T-Shirt
💰 Price: 45,000 MMK
📂 Category: T-Shirt
🎨 Available Colors: Black, White, Blue, Red
📏 Available Sizes: S, M, L, XL, XXL
🧵 Material: 100% Cotton
📊 Total Stock: 85 units

📝 Description: Comfortable and stylish t-shirt...
```

### Negative Response (Out of Stock):
```
❌ Sorry, size XXL is currently out of stock for this item.

Available sizes: S, M, L, XL

📦 Classic Cotton T-Shirt
💰 Price: 45,000 MMK
🎨 Available Colors: Black, White, Blue, Red
📏 Available Sizes: S, M, L, XL
📊 Total Stock: 65 units
```

### Unknown Product:
```
I'd be happy to help you with product details! 
Could you please specify which product you're asking about? 
You can show me by clicking on a product or telling me 
the product name.
```

---

## 💡 Usage Tips

### For Best Results:
1. **Mention the product name** in your question
   - Good: "Do you have the Classic T-Shirt in XL?"
   - Okay: "Do you have this in XL?" (after browsing a product)

2. **Be specific about what you need**
   - "Size L availability" → Checks L specifically
   - "What sizes?" → Shows all sizes

3. **One question at a time**
   - "Is XL available?" → ✅ Clear
   - "Do you have XL and is it black?" → ✅ Works but less clear

---

## 🔧 Technical Implementation

### Files Created:
1. **`src/lib/productInfo.ts`** (400+ lines)
   - Product data retrieval
   - Size/color availability checking
   - Information formatting
   - Query detection logic

### Files Modified:
1. **`src/app/api/ai-chat/route.ts`**
   - Product info query detection
   - Database lookup integration
   - Response formatting
   - Priority handling (info > outfit > search)

2. **`src/components/ChatBot.tsx`**
   - Updated quick prompts
   - Product info display support

---

## 📈 Key Features

### Smart Detection:
- ✅ Recognizes product info questions
- ✅ Extracts size from message (XL, L, M, etc.)
- ✅ Extracts color from message
- ✅ Identifies product being asked about
- ✅ Handles variations in phrasing

### Accurate Data:
- ✅ Real-time stock checking
- ✅ Size-specific availability
- ✅ Color-specific availability
- ✅ Accurate quantity counts
- ✅ Complete product details

### User-Friendly:
- ✅ Clear yes/no answers
- ✅ Helpful alternatives when out of stock
- ✅ Formatted, easy-to-read information
- ✅ Product image included
- ✅ Direct link to product page

---

## 🎯 Business Benefits

### Customer Experience:
- ✅ **Faster answers** - Instant product info
- ✅ **No manual searching** - AI finds the data
- ✅ **Clear availability** - Know before clicking
- ✅ **Better decisions** - All info upfront

### Operational Benefits:
- ✅ **Reduces support queries** - Self-service info
- ✅ **Fewer abandoned carts** - Clear stock status
- ✅ **Higher conversion** - Informed customers buy more
- ✅ **Better inventory visibility** - Stock transparency

---

## 🧪 Testing

### Test These Queries:

1. **"Do you have this in XL?"**
   - Should check XL availability
   - Show which colors have XL
   - Display quantity

2. **"What colors does this come in?"**
   - Should list all available colors
   - Show which have stock

3. **"How much is this?"**
   - Should show formatted price
   - Include product details

4. **"Is this in stock?"**
   - Should show stock status
   - Display quantity
   - List sizes and colors

5. **"What is this made of?"**
   - Should show material
   - Include other product info

---

## 🔮 Future Enhancements

Potential improvements:
- [ ] Product comparison ("Compare these two items")
- [ ] Size recommendations ("What size should I get?")
- [ ] Fit guide integration
- [ ] Customer reviews display
- [ ] Restock notifications
- [ ] Related products suggestions
- [ ] Wishlist integration
- [ ] Cart integration ("Add XL in black to cart")
- [ ] Image-based product lookup
- [ ] Barcode scanning
- [ ] Multi-product queries

---

## 📚 API Reference

### Key Functions:

```typescript
// Get product by ID
getProductById(productId: string): Promise<ProductInfo | null>

// Find product by name
findProductByName(productName: string): Promise<ProductInfo | null>

// Check size availability
isSizeAvailable(
  product: ProductInfo, 
  size: string, 
  color?: string
): { available: boolean; quantity: number; colors?: string[] }

// Check color availability
isColorAvailable(
  product: ProductInfo, 
  color: string
): { available: boolean; quantity: number; sizes?: string[] }

// Format product info as text
formatProductInfo(product: ProductInfo): string

// Detect product info query
isProductInfoQuery(message: string): {
  isQuery: boolean;
  queryType?: "size" | "color" | "price" | "material" | "stock" | "general";
  extractedInfo?: { size?: string; color?: string; }
}
```

---

## ✅ Success Metrics

Track these to measure feature success:
- 📊 Product info queries per day
- 🛒 Conversion rate after info query
- ⭐ Accuracy of size/color detection
- 💰 Revenue from info-assisted purchases
- 🔄 Repeat queries on same product

---

## 🐛 Troubleshooting

### "Could not identify product"
**Cause**: Product name not clear in message
**Solution**: Ask user to specify product name or click product first

### Incorrect size/color shown
**Cause**: Database data not properly formatted
**Solution**: Ensure products have colorVariants with sizeQuantities

### Stock shows 0 but items exist
**Cause**: Stock calculation from colorVariants
**Solution**: Check that sizeQuantities have proper quantity values

---

## 📞 Support

For questions or issues:
1. Check console logs for debugging
2. Verify product data structure in Firebase
3. Ensure colorVariants and sizeQuantities are populated
4. Test with products that have complete data

---

**Built with ❤️ to help customers make informed decisions!**

Ready to answer all product questions! 💬
