# Order Reference Display Fix

## Issue
The Order Ref column in the customer purchases page (`http://localhost:3001/account/purchases`) was showing "-" instead of the actual order reference for COD orders.

## Root Cause
When COD orders were created, the transaction document was not being populated with the `onlineOrderId` field, which links the transaction to the online order. Additionally, the `amountMmk` and proper `exchangeRate` and `sellingTotal` fields were not being set correctly.

## Solution
Updated the COD order creation API to:
1. Set `onlineOrderId` field in transaction document
2. Calculate and store `amountMmk` properly
3. Set correct `exchangeRate` from environment variable
4. Set `sellingTotal` to the MMK amount

## Changes Made

### File: `pos-clothing-store-web/src/app/api/transactions/create-cod/route.ts`

**Added/Modified Fields in Transaction:**

```typescript
// Calculate order ID and MMK conversion BEFORE creating transaction
const orderId = transactionId;
const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
const amountMmk = mmkRate > 0 ? total * mmkRate : total;

const transactionData = {
  transactionId,
  onlineOrderId: orderId, // ✅ ADDED - Links to online order
  // ... other fields ...
  amountMmk, // ✅ ADDED - MMK amount for display
  exchangeRate: mmkRate || 1, // ✅ UPDATED - Proper exchange rate
  sellingTotal: amountMmk, // ✅ UPDATED - MMK total
  // ... rest of fields ...
};
```

**Before:**
```typescript
const transactionData = {
  transactionId,
  // No onlineOrderId ❌
  // ... fields ...
  exchangeRate: 1, // Wrong ❌
  sellingTotal: total, // THB instead of MMK ❌
};
```

**After:**
```typescript
const orderId = transactionId;
const mmkRate = Number(process.env.NEXT_PUBLIC_MMK_RATE || 0);
const amountMmk = mmkRate > 0 ? total * mmkRate : total;

const transactionData = {
  transactionId,
  onlineOrderId: orderId, // ✅ Links transaction to order
  // ... fields ...
  amountMmk, // ✅ MMK amount
  exchangeRate: mmkRate || 1, // ✅ Correct rate
  sellingTotal: amountMmk, // ✅ MMK total
};
```

## How It Works

### COD Order Creation Flow:

1. **Generate Transaction ID**: `TXN-0000000000123`
2. **Set Order ID**: Same as transaction ID for COD orders
3. **Calculate MMK Amount**: 
   ```typescript
   mmkRate = 43 (from env)
   total = 1250 THB
   amountMmk = 1250 × 43 = 53,750 MMK
   ```
4. **Create Transaction** with:
   - `transactionId`: TXN-0000000000123
   - `onlineOrderId`: TXN-0000000000123 ✅
   - `total`: 1250 (THB)
   - `amountMmk`: 53750 (MMK) ✅
   - `exchangeRate`: 43 ✅
   - `sellingTotal`: 53750 (MMK) ✅
5. **Create Online Order** with:
   - `orderId`: TXN-0000000000123
   - `transactionId`: TXN-0000000000123
   - `amountMmk`: 53750

### Display in Purchases Page:

```
Transaction ID      Order Ref           Amount (THB / MMK)
TXN-0000000000123  TXN-0000000000123   ฿ 1,250.00
                                       Ks 53,750
```

## Database Schema

### Transaction Document (COD Orders):
```javascript
{
  transactionId: "TXN-0000000000123",
  onlineOrderId: "TXN-0000000000123", // ✅ NEW
  customer: { uid, email, displayName, phone, address },
  items: [...],
  total: 1250, // THB
  amountMmk: 53750, // ✅ NEW - MMK amount
  exchangeRate: 43, // ✅ FIXED
  sellingTotal: 53750, // ✅ FIXED - MMK total
  sellingCurrency: "THB",
  paymentMethod: "cod",
  status: "pending",
  orderSource: "web_storefront",
  customerUid: "customer-uid-123",
  // ... other fields
}
```

### Online Order Document:
```javascript
{
  orderId: "TXN-0000000000123",
  transactionId: "TXN-0000000000123",
  source: "online",
  customer: { uid, email, displayName, phone, address },
  cartItems: [...],
  amountMmk: 53750,
  status: "pending",
  paymentStatus: "PENDING",
  paymentMethod: "cod",
  orderSource: "web_storefront",
  // ... other fields
}
```

## Testing Checklist

### Before Testing:
- [ ] Ensure `NEXT_PUBLIC_MMK_RATE` is set in `.env.local` (e.g., `43`)
- [ ] Clear any existing COD orders from test data
- [ ] Have customer account ready with complete profile

### Test COD Order:
1. [ ] Go to customer storefront `http://localhost:3001`
2. [ ] Add items to cart
3. [ ] Proceed to checkout
4. [ ] Select "Cash on Delivery" payment
5. [ ] Complete order
6. [ ] Go to purchases page `http://localhost:3001/account/purchases`

### Verify Display:
- [ ] Order Ref column shows transaction ID (e.g., TXN-0000000000123) ✅ **NOT "-"**
- [ ] Amount shows THB price (e.g., ฿ 1,250.00)
- [ ] Amount shows MMK price below (e.g., Ks 53,750)
- [ ] Both prices match the order total
- [ ] Payment Method shows "🚚 COD"
- [ ] Payment Status shows "Pending"
- [ ] Order Status shows "Pending"

### Verify in Firestore Console:
1. [ ] Open Firebase Console → Firestore
2. [ ] Navigate to `transactions` collection
3. [ ] Find the COD transaction
4. [ ] Verify fields exist:
   - [ ] `onlineOrderId` = transaction ID
   - [ ] `amountMmk` = calculated MMK amount
   - [ ] `exchangeRate` = rate from env (e.g., 43)
   - [ ] `sellingTotal` = MMK amount
   - [ ] `total` = THB amount

### Test Mobile View:
1. [ ] Access purchases page on mobile device or resize browser
2. [ ] Verify Order Ref shows in card
3. [ ] Verify Amount (THB) shows correct value
4. [ ] Verify Amount (MMK) shows correct value

## Expected Results

### Desktop View:
```
┌──────────────────┬──────────────────┬─────────────────┬─────────┬────────┬────────┬───────────────┬─────────┐
│ Transaction ID   │ Order Ref        │ Amount(THB/MMK) │ Payment │ Pay    │ Order  │ Date          │ Actions │
├──────────────────┼──────────────────┼─────────────────┼─────────┼────────┼────────┼───────────────┼─────────┤
│ TXN-00000000123 │ TXN-00000000123 │ ฿ 1,250.00      │ 🚚 COD  │ Pending│ Pending│ 8/27/26 1:34PM│   ⋮     │
│                  │                  │ Ks 53,750       │         │        │        │               │         │
└──────────────────┴──────────────────┴─────────────────┴─────────┴────────┴────────┴───────────────┴─────────┘
```

### Mobile View:
```
┌────────────────────────────────────┐
│ Transaction ID                     │
│ TXN-0000000000123                 │
│                                    │
│ Order Ref: TXN-0000000000123      │
│ Date: 8/27/2026, 1:34:47 PM      │
│                                    │
│ Amount (THB)     Payment Method    │
│ ฿ 1,250.00       🚚 COD           │
│                                    │
│ Amount (MMK)     Payment Status    │
│ Ks 53,750        Pending          │
│                                    │
│ [View Details] [Cancel] [Return]  │
└────────────────────────────────────┘
```

## Notes

- **Order Ref = Transaction ID** for COD orders (same value)
- **Order Ref ≠ Firestore Document ID** (different values)
- QR Scan orders have different order IDs (format: `ONL-timestamp-random`)
- The fix ensures COD orders behave consistently with QR scan orders
- Both order types now show complete information in purchases page

## Troubleshooting

### If Order Ref Still Shows "-":

1. **Check Environment Variable**:
   ```bash
   # In .env.local
   NEXT_PUBLIC_MMK_RATE=43
   ```

2. **Restart Development Server**:
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

3. **Clear Existing Orders**:
   - Old COD orders won't have the `onlineOrderId` field
   - Create a new test order after applying the fix

4. **Check Firestore**:
   - Verify new transaction has `onlineOrderId` field
   - Verify `amountMmk` is populated
   - Check `exchangeRate` is correct (not 1)

### If MMK Amount Shows 0:

1. Check `NEXT_PUBLIC_MMK_RATE` is set and > 0
2. Restart dev server after setting environment variable
3. Verify order was created AFTER the fix was applied
