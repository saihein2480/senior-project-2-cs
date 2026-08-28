# Transaction ID Column Update - Customer Purchases Page

## Changes Made

Updated the customer purchases page table structure to replace "Order Ref" with "Transaction ID" column and add conditional display logic for COD orders.

### File Modified:
- `pos-clothing-store-web/src/app/account/purchases/page.tsx`

## Changes Summary

### 1. Removed Column:
- **Order Ref** - No longer displayed in the table

### 2. Added Column:
- **Transaction ID** - New column positioned after "Date" column

### 3. Column Order (Updated):
1. Order ID
2. Amount (THB / MMK)
3. Payment Method
4. Payment Status
5. Order Status
6. Date
7. **Transaction ID** ← NEW
8. Actions

## Transaction ID Display Logic

### Conditional Display for COD Orders:

```typescript
const isCOD = row.paymentMethod === "cod";
const isPaid = normalizePaymentStatus(row.status, row.paymentStatus) === "paid";

// For COD orders, only show Transaction ID if payment status is paid
if (isCOD && !isPaid) {
  return "-";
}

// For non-COD orders or paid COD orders, show Transaction ID
return row.transactionId || row.id || "-";
```

### Display Rules:

| Payment Method | Payment Status | Transaction ID Displays? |
|----------------|----------------|--------------------------|
| COD            | Pending        | ❌ No (shows "-")        |
| COD            | Paid           | ✅ Yes                   |
| Cash           | Any            | ✅ Yes                   |
| QR Scan        | Any            | ✅ Yes                   |
| Wallet         | Any            | ✅ Yes                   |

## Why This Logic?

### COD Order Workflow:
1. **Order Placed** → Payment Status: Pending
   - Customer hasn't paid yet
   - Transaction ID: "-" (hidden)

2. **Order Delivered** → Payment Status: Still Pending
   - Customer receives items
   - Pays cash to delivery person
   - Transaction ID: "-" (hidden)

3. **Owner Marks as Paid** → Payment Status: Paid
   - Owner confirms cash received
   - Transaction ID: "TXN-0000000000065" ✅ (now visible)

### Reasoning:
- **Security**: Transaction ID represents completed financial transaction
- **Accuracy**: COD transaction isn't "complete" until payment received
- **Consistency**: Shows Transaction ID only when money has actually been exchanged

## Table Structure

### Before:
```
┌────────────┬────────────┬────────┬─────────┬─────────┬────────┬────────┬─────────┐
│ Order ID   │ Order Ref  │ Amount │ Payment │ Payment │ Order  │ Date   │ Actions │
│            │            │        │ Method  │ Status  │ Status │        │         │
└────────────┴────────────┴────────┴─────────┴─────────┴────────┴────────┴─────────┘
```

### After:
```
┌────────────┬────────┬─────────┬─────────┬────────┬────────┬────────────┬─────────┐
│ Order ID   │ Amount │ Payment │ Payment │ Order  │ Date   │ Trans. ID  │ Actions │
│            │        │ Method  │ Status  │ Status │        │            │         │
└────────────┴────────┴─────────┴─────────┴────────┴────────┴────────────┴─────────┘
```

## Examples

### Example 1: COD Order - Pending Payment
```
Order ID            : TXN-0000000000065
Payment Method      : 🚚 COD
Payment Status      : Pending
Transaction ID      : -                    ← Hidden until paid
```

### Example 2: COD Order - Paid
```
Order ID            : TXN-0000000000065
Payment Method      : 🚚 COD
Payment Status      : Paid
Transaction ID      : TXN-0000000000065    ← Now visible!
```

### Example 3: QR Scan Order
```
Order ID            : TXN-0000000000066
Payment Method      : 📱 QR Scan
Payment Status      : Paid
Transaction ID      : TXN-0000000000066    ← Always visible
```

### Example 4: Cash Order
```
Order ID            : TXN-ABC123
Payment Method      : 💵 Cash
Payment Status      : Paid
Transaction ID      : TXN-ABC123           ← Always visible
```

## Code Implementation

### Table Header:
```tsx
<thead className="bg-gray-50 text-left text-gray-600">
  <tr>
    <th className="px-4 py-3">Order ID</th>
    <th className="px-4 py-3">Amount (THB / MMK)</th>
    <th className="px-4 py-3">Payment Method</th>
    <th className="px-4 py-3">Payment Status</th>
    <th className="px-4 py-3">Order Status</th>
    <th className="px-4 py-3">Date</th>
    <th className="px-4 py-3">Transaction ID</th>
    <th className="px-4 py-3 text-right">Actions</th>
  </tr>
</thead>
```

### Table Row Cell (Transaction ID):
```tsx
<td className="px-4 py-3 text-gray-700">
  {(() => {
    const isCOD = row.paymentMethod === "cod";
    const isPaid = normalizePaymentStatus(row.status, row.paymentStatus) === "paid";
    
    // For COD orders, only show Transaction ID if payment status is paid
    if (isCOD && !isPaid) {
      return "-";
    }
    
    // For non-COD orders or paid COD orders, show Transaction ID
    return row.transactionId || row.id || "-";
  })()}
</td>
```

## Testing Checklist

### Test 1: COD Order - Pending
- [ ] Place new COD order
- [ ] Go to customer purchases page
- [ ] Find the COD order
- [ ] Payment Status: "Pending"
- [ ] Transaction ID column: "-" ✓

### Test 2: COD Order - Mark as Paid
- [ ] Go to owner dashboard `/owner/sales/online-orders`
- [ ] Find the COD order (status: Delivered)
- [ ] Click "Mark COD as Paid"
- [ ] Go back to customer purchases page
- [ ] Payment Status: "Paid" ✓
- [ ] Transaction ID column: "TXN-XXXX" ✓

### Test 3: QR Scan Order
- [ ] Place QR scan order
- [ ] Complete payment
- [ ] Go to customer purchases page
- [ ] Payment Status: "Paid"
- [ ] Transaction ID column: "TXN-XXXX" ✓

### Test 4: Cash Order
- [ ] Place cash order (if available)
- [ ] Go to customer purchases page
- [ ] Payment Status: "Paid"
- [ ] Transaction ID column: Shows ID ✓

## Benefits

### 1. Security
- Transaction IDs not exposed for unpaid transactions
- Prevents confusion about incomplete transactions

### 2. Clarity
- Clear indication of completed financial transactions
- Easier to track actual money flow

### 3. Business Logic
- Aligns with COD payment workflow
- Transaction ID appears when transaction is truly "complete"

### 4. User Experience
- Customer sees Transaction ID only when relevant
- Less clutter for pending orders
- Clear visual feedback when payment confirmed

## Database Fields Used

### Transaction Document:
```javascript
{
  id: "abc123xyz",                    // Firestore document ID
  transactionId: "TXN-0000000000065", // Transaction identifier
  onlineOrderId: "TXN-0000000000065", // Order reference (removed from table)
  paymentMethod: "cod",
  status: "pending" | "completed",
  paymentStatus: "PENDING" | "SUCCESS",
  // ... other fields
}
```

### Display Logic:
- **Order ID column**: Uses `row.transactionId || row.id`
- **Transaction ID column**: Uses conditional logic based on payment method and status

## Related Features

This update complements the following features:

1. **Payment Status Sync** (`COD_PAYMENT_STATUS_SYNC.md`)
   - When owner marks COD as paid, Transaction ID becomes visible

2. **Dual Currency Display**
   - Both columns work together to show complete order information

3. **Online Orders Dashboard**
   - Owner can see all orders and mark COD as paid
   - Action triggers Transaction ID visibility on customer side

## Migration Notes

### Existing Orders:
- No data migration needed
- Logic works with existing transaction data
- All fields already present in database

### New Orders:
- Continue using same data structure
- No changes to order creation process
- Only display logic changed

## Summary

✅ **Removed**: Order Ref column  
✅ **Added**: Transaction ID column (after Date)  
✅ **Logic**: Transaction ID hidden for unpaid COD orders  
✅ **Display**: Transaction ID shown when COD payment marked as paid  
✅ **Other Orders**: Transaction ID always visible (Cash, QR, Wallet)  

**Status:** Complete and ready for testing ✅
