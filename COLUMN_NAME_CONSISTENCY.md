# Column Name Consistency Update

## Change Summary
Updated the customer purchases page to use "Order ID" instead of "Transaction ID" to maintain consistency with the owner's online orders page.

## Rationale
Both pages display the same data (customer orders), so they should use consistent terminology:
- **Owner view**: Online Orders page uses "Order ID"
- **Customer view**: Purchases page now also uses "Order ID"

This reduces confusion and makes it clear that both pages are showing the same orders from different perspectives.

## Changes Made

### File: `pos-clothing-store-web/src/app/account/purchases/page.tsx`

#### 1. Desktop Table Header
**Before:**
```tsx
<th className="px-4 py-3">Transaction ID</th>
```

**After:**
```tsx
<th className="px-4 py-3">Order ID</th>
```

#### 2. Mobile Card View Label
**Before:**
```tsx
<p className="text-xs text-gray-500">Transaction ID</p>
```

**After:**
```tsx
<p className="text-xs text-gray-500">Order ID</p>
```

#### 3. Refund Details Modal
**Before:**
```tsx
<p className="text-gray-500 mb-0.5">Transaction ID</p>
```

**After:**
```tsx
<p className="text-gray-500 mb-0.5">Order ID</p>
```

## Terminology Comparison

### Before (Inconsistent):
| Page                    | Column Name      |
|------------------------|------------------|
| Customer Purchases     | Transaction ID   |
| Owner Online Orders    | Order ID         |
| ❌ Different terms for same data

### After (Consistent):
| Page                    | Column Name      |
|------------------------|------------------|
| Customer Purchases     | Order ID         |
| Owner Online Orders    | Order ID         |
| ✅ Same terminology

## Display Examples

### Customer Purchases Page:
```
┌──────────────────┬──────────────────┬─────────────────┐
│ Order ID         │ Order Ref        │ Amount(THB/MMK) │
├──────────────────┼──────────────────┼─────────────────┤
│ TXN-00000000065 │ TXN-00000000065 │ ฿ 278.20        │
│                  │                  │ Ks 11,963       │
└──────────────────┴──────────────────┴─────────────────┘
```

### Owner Online Orders Page:
```
┌──────────────────┬──────────────┬────────┬─────────────────┐
│ Order ID         │ Customer     │ Items  │ Amount(THB/MMK) │
├──────────────────┼──────────────┼────────┼─────────────────┤
│ TXN-00000000065 │ John Doe     │ 1 item │ ฿ 278.20        │
│                  │              │        │ Ks 11,963       │
└──────────────────┴──────────────┴────────┴─────────────────┘
```

## Data Structure

Both pages display the same `transactionId` field:

```javascript
{
  transactionId: "TXN-0000000000065",  // Now labeled as "Order ID"
  onlineOrderId: "TXN-0000000000065",  // Shown in "Order Ref" column
  customer: { /* ... */ },
  items: [ /* ... */ ],
  total: 278.20,
  amountMmk: 11963,
  paymentMethod: "cod",
  status: "pending"
}
```

### Field Usage:
- **Order ID column**: Shows `transactionId` (e.g., TXN-0000000000065)
- **Order Ref column**: Shows `onlineOrderId` (e.g., TXN-0000000000065)
- For COD orders: Both values are identical
- For QR Scan orders: May have different formats

## Benefits

1. **Consistency**: Same terminology across customer and owner interfaces
2. **Clarity**: "Order ID" is more intuitive for customers than "Transaction ID"
3. **Professional**: Consistent naming shows attention to detail
4. **Less Confusion**: Customers and staff use the same language
5. **Better Communication**: Easier to discuss orders when everyone uses same terms

## User Impact

### Customer View:
- Sees "Order ID" as the primary identifier
- More familiar terminology (ordering something = order ID)
- Matches receipt/invoice terminology

### Owner View:
- Already uses "Order ID" in online orders page
- Terminology remains unchanged
- Staff can reference same "Order ID" when helping customers

## Related Fields

Understanding the different ID fields:

| Field Name      | Description                           | Example              | Where Used        |
|----------------|---------------------------------------|----------------------|-------------------|
| transactionId  | Unique transaction/order identifier   | TXN-0000000000065   | Both pages (main) |
| onlineOrderId  | Reference to online order             | TXN-0000000000065   | Order Ref column  |
| id            | Firestore document ID                 | 8sK2mP4nQ7dR...     | Internal only     |

## Testing Checklist

### Desktop View:
- [ ] Go to `http://localhost:3001/account/purchases`
- [ ] Verify table header shows "Order ID" (not "Transaction ID")
- [ ] Check that order IDs display correctly in the column
- [ ] Click on order to view details modal
- [ ] Verify modal shows "Order ID" label

### Mobile View:
- [ ] Access purchases page on mobile device or small screen
- [ ] Check card view shows "Order ID" label
- [ ] Verify the ID value displays correctly
- [ ] Open details modal and check "Order ID" label

### Cross-Page Consistency:
- [ ] Compare customer purchases page with owner online orders page
- [ ] Verify both use "Order ID" as column name
- [ ] Check that same order appears with same ID on both pages
- [ ] Confirm terminology is consistent throughout

## Screenshots Reference

### Customer Purchases Page (Updated):
```
┌─────────────────────────────────────────────────────────┐
│ My Purchase History                                      │
├─────────────────────────────────────────────────────────┤
│ Order ID  │ Order Ref │ Amount       │ Payment │ Status │
├───────────┼───────────┼──────────────┼─────────┼────────┤
│ TXN-00065 │ TXN-00065 │ ฿ 278.20     │ COD     │ Pending│
│           │           │ Ks 11,963    │         │        │
└───────────┴───────────┴──────────────┴─────────┴────────┘
```

### Owner Online Orders Page (Already Consistent):
```
┌────────────────────────────────────────────────────────────┐
│ Online Orders                                              │
├────────────────────────────────────────────────────────────┤
│ Order ID  │ Customer │ Items │ Amount       │ Payment     │
├───────────┼──────────┼───────┼──────────────┼─────────────┤
│ TXN-00065 │ John Doe │ 1     │ ฿ 278.20     │ COD         │
│           │          │       │ Ks 11,963    │             │
└───────────┴──────────┴───────┴──────────────┴─────────────┘
```

## Future Considerations

### Potential Improvements:
1. Update email templates to use "Order ID" instead of "Transaction ID"
2. Update any printed receipts to show "Order ID"
3. Update API documentation to reference "Order ID"
4. Consider updating database field names in future migration (optional)

### Other Pages to Check:
- Order confirmation emails
- Receipt/invoice templates
- Customer service scripts
- Help documentation
- API responses (may keep internal naming)

## Technical Notes

### No Backend Changes Required:
- This is a **display-only change**
- Database field remains `transactionId` (internal naming)
- No data migration needed
- No API changes required
- Only frontend labels updated

### Why Keep `transactionId` in Database:
- Maintains backwards compatibility
- Avoids complex data migration
- Internal naming can differ from user-facing labels
- Easier to maintain existing code
- Common practice in software development

## Summary

✅ Changed "Transaction ID" → "Order ID" in customer purchases page  
✅ Now consistent with owner's online orders page  
✅ Updated in table header, mobile cards, and modal  
✅ No backend changes required  
✅ Better user experience and consistency  

**Status:** Complete  
**Breaking Changes:** None  
**Migration Required:** No  
