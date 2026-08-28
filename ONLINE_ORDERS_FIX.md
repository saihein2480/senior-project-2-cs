# Online Orders Display Fix

## Issue
Customer orders placed via QR Scan or COD payment in the customer storefront were not displaying properly in the owner dashboard at `/owner/sales/online-orders`.

## Root Cause
The `orderSource` field was missing from QR Scan orders created through the MyanMyanPay flow. This field helps distinguish between:
- **POS orders** (`orderSource: "pos"`) - created at physical store
- **Web storefront orders** (`orderSource: "web_storefront"`) - created by customers online

## Changes Made

### 1. QR Scan Order Creation (create-order/route.ts)
**File**: `pos-clothing-store-web/src/app/api/mmpay/create-order/route.ts`

Added `orderSource: "web_storefront"` field when creating online orders via QR scan payment.

**Before**:
```typescript
await adminDb.collection("onlineOrders").doc(orderId).set({
  orderId,
  source: "online",
  // ... other fields
  paymentMethod: "scan",
  provider: "MMPAY",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

**After**:
```typescript
await adminDb.collection("onlineOrders").doc(orderId).set({
  orderId,
  source: "online",
  // ... other fields
  paymentMethod: "scan",
  provider: "MMPAY",
  orderSource: "web_storefront", // ADDED
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

### 2. MyanMyanPay Webhook Transaction Creation
**File**: `pos-clothing-store-web/src/app/api/mmpay/webhook/route.ts`

Added `orderSource: "web_storefront"` and `customerUid` fields when creating transaction records from successful payments.

**Before**:
```typescript
await transactionDocRef.set({
  transactionId,
  source: "online",
  // ... other fields
  paymentProvider: "MMPAY",
  paymentMeta: { /* ... */ },
});
```

**After**:
```typescript
await transactionDocRef.set({
  transactionId,
  source: "online",
  // ... other fields
  paymentProvider: "MMPAY",
  orderSource: "web_storefront", // ADDED
  customerUid: order.customer?.uid, // ADDED
  paymentMeta: { /* ... */ },
});
```

### 3. COD Order Creation
**File**: `pos-clothing-store-web/src/app/api/transactions/create-cod/route.ts`

Already had `orderSource: "web_storefront"` properly set. No changes needed.

## How It Works Now

### QR Scan Payment Flow:
1. Customer selects "QR Code Payment" at checkout
2. System creates entry in `onlineOrders` collection with:
   - `paymentMethod: "scan"`
   - `paymentStatus: "PENDING"`
   - `orderSource: "web_storefront"` ✅ **NEW**
3. Customer scans QR and pays via MyanMyanPay
4. Webhook receives payment confirmation
5. System creates entry in `transactions` collection with:
   - `orderSource: "web_storefront"` ✅ **NEW**
   - `customerUid` ✅ **NEW**
6. Order appears in online orders page immediately

### COD Payment Flow:
1. Customer selects "Cash on Delivery" at checkout
2. System creates entries in BOTH collections:
   - `onlineOrders` with `orderSource: "web_storefront"` ✅
   - `transactions` with `orderSource: "web_storefront"` ✅
3. Order appears in online orders page immediately

## Online Orders Page Query
The online orders page at `/owner/sales/online-orders` queries:
```typescript
query(collection(db, "onlineOrders"), orderBy("updatedAt", "desc"))
```

This query fetches **ALL** orders from the `onlineOrders` collection, regardless of source. The page displays:
- All QR scan orders
- All COD orders
- All online storefront orders

## Verification

### Diagnostic Script
Run the diagnostic script to check existing orders:
```bash
cd pos-clothing-store-web
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=/path/to/serviceAccount.json node scripts/check-online-orders.js
```

This will show:
- Recent online orders with their fields
- Any orders missing the `orderSource` field
- Corresponding transaction records

### Manual Testing
1. **Test QR Scan Order**:
   - Go to customer storefront
   - Add items to cart
   - Proceed to checkout
   - Select "QR Code Payment"
   - Complete payment via MyanMyanPay
   - Check `/owner/sales/online-orders` - order should appear immediately

2. **Test COD Order**:
   - Go to customer storefront
   - Add items to cart
   - Proceed to checkout
   - Select "Cash on Delivery"
   - Submit order
   - Check `/owner/sales/online-orders` - order should appear immediately

3. **Verify Filtering**:
   - Use "Payment Method" filter to show only COD orders
   - Use "Payment Method" filter to show only Scan orders
   - Both should display the respective customer orders

## Database Schema

### onlineOrders Collection
```typescript
{
  orderId: string,
  source: "online",
  orderSource: "web_storefront", // NEW - distinguishes from POS
  customer: {
    uid: string,
    email: string,
    displayName: string,
    phone: string,
    address: string
  },
  items: [...],
  amountMmk: number,
  status: string,
  paymentStatus: string,
  paymentMethod: "cod" | "scan",
  provider: "COD" | "MMPAY",
  createdAt: string,
  updatedAt: string
}
```

### transactions Collection (for web orders)
```typescript
{
  transactionId: string,
  source: "online",
  orderSource: "web_storefront", // NEW
  customerUid: string, // NEW
  customer: {...},
  items: [...],
  total: number,
  paymentMethod: "cod" | "scan",
  status: "pending" | "completed",
  createdAt: Timestamp,
  timestamp: string
}
```

## Notes

- The `orderSource` field is optional but recommended for better order tracking
- Existing orders without `orderSource` will still display in the online orders page
- The online orders page does NOT filter by `orderSource` - it shows all orders
- COD orders create transaction entries immediately
- QR scan orders create transaction entries only after successful payment
