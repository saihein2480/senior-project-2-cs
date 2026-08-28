# Customer Purchases Page - Dual Currency Display

## Issue
The purchases page at `http://localhost:3001/account/purchases` was only showing either THB OR MMK prices, not both. This made it difficult for customers to understand the original price and the converted price.

## Solution
Updated the purchases page to display BOTH THB and MMK prices for all orders, including COD orders.

## Changes Made

### File: `pos-clothing-store-web/src/app/account/purchases/page.tsx`

#### 1. Desktop Table View - Updated Price Column
**Before:**
```typescript
<td className="px-4 py-3 text-gray-700">
  {row.amountMmk ? 
    `Ks ${Number(row.amountMmk).toLocaleString()}` : 
    row.sellingTotal ? 
      `Ks ${Number(row.sellingTotal).toLocaleString()}` :
      `฿ ${Number(row.total || 0).toFixed(2)}`
  }
</td>
```

**After:**
```typescript
<td className="px-4 py-3 text-gray-700">
  <div className="flex flex-col gap-0.5">
    <span className="font-medium">฿ {Number(row.total || 0).toFixed(2)}</span>
    {(row.amountMmk || row.sellingTotal) && (
      <span className="text-xs text-gray-500">
        Ks {Number(row.amountMmk || row.sellingTotal || 0).toLocaleString()}
      </span>
    )}
  </div>
</td>
```

**Changes:**
- Always shows THB price as the primary amount (bold)
- Shows MMK price below it in smaller gray text (if available)
- Uses flexbox column layout for clean stacking

#### 2. Desktop Table Header
**Before:**
```typescript
<th className="px-4 py-3">Amount (MMK)</th>
```

**After:**
```typescript
<th className="px-4 py-3">Amount (THB / MMK)</th>
```

**Changes:**
- Updated header to reflect that both currencies are displayed

#### 3. Mobile Card View - Amount Fields
**Before:**
```typescript
<div>
  <p className="text-xs text-gray-500">Amount (MMK)</p>
  <p className="font-medium text-gray-900">
    {row.amountMmk ? 
      `Ks ${Number(row.amountMmk).toLocaleString()}` : 
      row.sellingTotal ? 
        `Ks ${Number(row.sellingTotal).toLocaleString()}` :
        `฿ ${Number(row.total || 0).toFixed(2)}`
    }
  </p>
</div>
```

**After:**
```typescript
<div>
  <p className="text-xs text-gray-500">Amount (THB)</p>
  <p className="font-medium text-gray-900">
    ฿ {Number(row.total || 0).toFixed(2)}
  </p>
</div>
<div>
  <p className="text-xs text-gray-500">Amount (MMK)</p>
  <p className="font-medium text-gray-900">
    Ks {Number(row.amountMmk || row.sellingTotal || 0).toLocaleString()}
  </p>
</div>
```

**Changes:**
- Split into two separate fields (side by side in grid)
- Shows THB amount in one cell
- Shows MMK amount in another cell
- Removed duplicate "Total (THB)" and "Total (MMK)" fields that were redundant

## Display Format

### Desktop View (Table)
```
+-------------------+-----------+------------------+
| Transaction ID    | Order Ref | Amount (THB/MMK) |
+-------------------+-----------+------------------+
| TXN-0000000000123 | ONL-XXX   | ฿ 1,250.00       |
|                   |           | Ks 53,750        |
+-------------------+-----------+------------------+
```

### Mobile View (Cards)
```
┌─────────────────────────────┐
│ Order Ref: ONL-XXX          │
│ Date: Dec 25, 2024          │
│ Amount (THB): ฿ 1,250.00    │
│ Amount (MMK): Ks 53,750     │
│ Payment Method: 🚚 COD      │
└─────────────────────────────┘
```

## Data Structure

### Transaction Object Fields Used:
- `row.total` - Original amount in THB (always present)
- `row.amountMmk` - Converted amount in MMK (for QR scan orders)
- `row.sellingTotal` - Converted amount in MMK (for COD orders)
- `row.onlineOrderId` - Order reference number

### Price Calculation:
- **THB**: Always uses `row.total` (original price)
- **MMK**: Uses `row.amountMmk` if available, otherwise `row.sellingTotal`
- If no MMK value exists, it doesn't show the MMK line (desktop) or shows "0" (mobile)

## Benefits

1. **Transparency**: Customers can see both the original THB price and converted MMK price
2. **Clarity**: No confusion about which currency was used
3. **COD Support**: COD orders now clearly show both currencies
4. **Consistency**: All orders (QR scan, COD, cash) display prices in the same format

## Testing

To verify the changes work correctly:

1. **COD Order**:
   - Place a COD order from customer storefront
   - Go to `/account/purchases`
   - Verify order shows:
     - Order reference (e.g., TXN-0000000000123)
     - THB amount (e.g., ฿ 1,250.00)
     - MMK amount below it (e.g., Ks 53,750)

2. **QR Scan Order**:
   - Place a QR scan order
   - Complete payment
   - Go to `/account/purchases`
   - Verify order shows both THB and MMK amounts

3. **Mobile View**:
   - Access `/account/purchases` on mobile device
   - Verify both Amount (THB) and Amount (MMK) fields are visible
   - Check that layout looks clean and not cramped

## Notes

- The THB amount is always the source of truth (original price)
- MMK is the converted amount based on exchange rate
- Both COD and QR scan orders use the same display format
- The page is responsive and works on both desktop and mobile
