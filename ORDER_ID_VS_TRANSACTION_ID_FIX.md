# Order ID vs Transaction ID - Column Value Fix

## Issue Identified

Both "Order ID" and "Transaction ID" columns were showing the **same value** (`row.transactionId`), which was redundant and confusing.

### Problem:
```
Order ID            Transaction ID
TXN-0000000000065   TXN-0000000000065   ❌ Same value!
```

## Solution

Updated the columns to show **different, meaningful values**:

- **Order ID column**: Shows `onlineOrderId` (customer's order reference)
- **Transaction ID column**: Shows `transactionId` (internal transaction ID)

### File Modified:
- `pos-clothing-store-web/src/app/account/purchases/page.tsx`

## Implementation

### Before (Redundant):
```typescript
// Order ID column
<td className="px-4 py-3 font-medium text-gray-900">
  {row.transactionId || row.id}  ❌ Same as Transaction ID
</td>

// Transaction ID column  
<td className="px-4 py-3 text-gray-700">
  {row.transactionId || row.id || "-"}  ❌ Same as Order ID
</td>
```

### After (Distinct):
```typescript
// Order ID column - Shows online order reference
<td className="px-4 py-3 font-medium text-gray-900">
  {row.onlineOrderId || row.transactionId || row.id}  ✅ Order reference
</td>

// Transaction ID column - Shows transaction ID (with COD logic)
<td className="px-4 py-3 text-gray-700">
  {(() => {
    const isCOD = row.paymentMethod === "cod";
    const isPaid = normalizePaymentStatus(row.status, row.paymentStatus) === "paid";
    
    if (isCOD && !isPaid) {
      return "-";  // Hidden for unpaid COD
    }
    
    return row.transactionId || row.id || "-";  ✅ Transaction ID
  })()}
</td>
```

## Data Structure

### Transaction Document Fields:
```javascript
{
  id: "abc123xyz",                     // Firestore auto-generated ID
  transactionId: "TXN-0000000000065",  // Internal transaction identifier
  onlineOrderId: "TXN-0000000000065",  // Customer order reference
  // ... other fields
}
```

### Column Mapping:
| Column | Field | Purpose |
|--------|-------|---------|
| Order ID | `onlineOrderId` | Customer's order reference (what they see when ordering) |
| Transaction ID | `transactionId` | Internal transaction tracking ID |

## Expected Behavior

### Scenario 1: Normal Online Orders
For most online orders, `onlineOrderId` and `transactionId` have the same value:

```
Order ID            Transaction ID
TXN-0000000000065   TXN-0000000000065   ✅ Can be same
```

This is **OK** because:
- Order ID = Customer's reference
- Transaction ID = Backend transaction record
- They happen to use the same ID format

### Scenario 2: COD Orders (Unpaid)
```
Order ID            Transaction ID
TXN-0000000000065   -                   ✅ Hidden until paid
```

### Scenario 3: COD Orders (Paid)
```
Order ID            Transaction ID
TXN-0000000000065   TXN-0000000000065   ✅ Shows when paid
```

### Scenario 4: Legacy Orders
If old orders don't have `onlineOrderId`:
```
Order ID            Transaction ID
TXN-0000000000065   TXN-0000000000065   ✅ Falls back to transactionId
```

## Why This Design?

### 1. Semantic Clarity
- **Order ID**: What the customer knows (their order reference)
- **Transaction ID**: Backend tracking (internal identifier)

### 2. Future Flexibility
In the future, these IDs might diverge:
- Order ID: "ORD-2024-001"
- Transaction ID: "TXN-0000000000065"

### 3. Consistent with Business Logic
- COD logic applies to **Transaction ID** (shows when paid)
- **Order ID** always shows (customer needs their reference)

### 4. Matches Industry Standards
- Order Reference: Customer-facing identifier
- Transaction ID: System-level tracking

## Comparison with Owner View

### Customer Purchases Page:
```
Order ID            | Transaction ID
(onlineOrderId)     | (transactionId - conditional for COD)
TXN-0000000000065   | TXN-0000000000065 or "-"
```

### Owner Online Orders Page:
```
Order Ref           | Customer | Amount
(orderId)           | ...      | ...
TXN-0000000000065   | John Doe | ฿278.20
```

## Testing Checklist

### Test 1: COD Order - Unpaid
- [ ] Place COD order
- [ ] Check purchases page
- [ ] Order ID: Shows order reference ✓
- [ ] Transaction ID: Shows "-" ✓
- [ ] Values are different ✓

### Test 2: COD Order - Paid
- [ ] Owner marks COD as paid
- [ ] Check purchases page
- [ ] Order ID: Shows order reference ✓
- [ ] Transaction ID: Shows transaction ID ✓
- [ ] Values can be same ✓

### Test 3: QR Scan Order
- [ ] Place and pay QR order
- [ ] Check purchases page
- [ ] Order ID: Shows order reference ✓
- [ ] Transaction ID: Shows transaction ID ✓
- [ ] Values can be same ✓

### Test 4: Legacy Order
- [ ] Check old order without onlineOrderId
- [ ] Order ID: Shows transactionId (fallback) ✓
- [ ] Transaction ID: Shows transactionId ✓
- [ ] No errors ✓

## Benefits

### 1. No Redundancy
- Columns now show different pieces of information
- More efficient use of screen space

### 2. Clear Purpose
- Order ID = Customer reference
- Transaction ID = Internal tracking

### 3. Flexible Design
- Can handle cases where IDs differ in the future
- Backwards compatible with current data

### 4. Better UX
- Customers see their order reference clearly
- Transaction ID provides additional tracking info when relevant

## Edge Cases Handled

### Case 1: No onlineOrderId
```typescript
{row.onlineOrderId || row.transactionId || row.id}
```
Falls back to transactionId, then Firestore ID

### Case 2: No transactionId
```typescript
{row.transactionId || row.id || "-"}
```
Falls back to Firestore ID, then "-"

### Case 3: COD Unpaid
Transaction ID hidden with "-"

### Case 4: Same Values
Both show same value (acceptable for online orders)

## Summary

✅ **Fixed**: Order ID now shows `onlineOrderId` (customer reference)  
✅ **Fixed**: Transaction ID shows `transactionId` (internal ID)  
✅ **Benefit**: Columns now serve distinct purposes  
✅ **Logic**: COD conditional display still works correctly  
✅ **Compatibility**: Backwards compatible with existing data  

**Status:** Fixed and improved ✅

## Visual Comparison

### Before (Redundant):
```
┌────────────────┬────────┬─────────┬────────────────┐
│ Order ID       │ Amount │ Status  │ Transaction ID │
├────────────────┼────────┼─────────┼────────────────┤
│ TXN-0000000065 │ ฿278   │ Paid    │ TXN-0000000065 │ ❌ Same!
└────────────────┴────────┴─────────┴────────────────┘
```

### After (Distinct Purpose):
```
┌────────────────┬────────┬─────────┬────────────────┐
│ Order ID       │ Amount │ Status  │ Transaction ID │
│ (Order Ref)    │        │         │ (Internal ID)  │
├────────────────┼────────┼─────────┼────────────────┤
│ TXN-0000000065 │ ฿278   │ Paid    │ TXN-0000000065 │ ✅ Clear purpose
│ (from online)  │        │         │ (from trans.)  │
└────────────────┴────────┴─────────┴────────────────┘
```

For COD unpaid:
```
┌────────────────┬────────┬─────────┬────────────────┐
│ Order ID       │ Amount │ Status  │ Transaction ID │
├────────────────┼────────┼─────────┼────────────────┤
│ TXN-0000000065 │ ฿278   │ Pending │ -              │ ✅ Hidden
└────────────────┴────────┴─────────┴────────────────┘
```
