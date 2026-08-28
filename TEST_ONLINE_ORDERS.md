# Testing Online Orders Display

## Prerequisites
1. Have both applications running:
   - Customer storefront: `pos-clothing-store-web`
   - Owner dashboard: `pos-clothing-store/clothing-store`
2. Have a customer account with complete profile (name, phone, address)
3. Have products with available stock

## Test 1: COD Order

### Steps:
1. **Customer Storefront** - Navigate to: `http://localhost:3001` (or your storefront URL)
2. Browse products and add items to cart
3. Go to Cart and click "Proceed to Checkout"
4. Select **"Cash on Delivery"** payment method
5. Click "Place COD Order"
6. You should see a success message

### Verification:
1. **Owner Dashboard** - Navigate to: `http://localhost:3000/owner/sales/online-orders`
2. The COD order should appear immediately at the top of the list
3. Verify the order shows:
   - Order ID (e.g., TXN-XXXXX)
   - Customer name and details
   - Payment Method: COD
   - Payment Status: Pending
   - Order Status: Pending
   - Correct amount in MMK

### Filter Testing:
1. Use "Payment Method" filter and select "COD"
   - The order should remain visible
2. Use "Payment Method" filter and select "Scan/QR"
   - The order should be hidden
3. Use "Payment Method" filter and select "All"
   - The order should be visible again

## Test 2: QR Scan Order

### Steps:
1. **Customer Storefront** - Navigate to: `http://localhost:3001`
2. Browse products and add items to cart
3. Go to Cart and click "Proceed to Checkout"
4. Select **"QR Code Payment"** payment method
5. Click "Pay Now"
6. You should see a QR code
7. **Test Payment**: 
   - If using sandbox mode, you can use the test-complete endpoint
   - If using production, scan and pay via MyanMyanPay app

### Verification (Before Payment):
1. **Owner Dashboard** - Navigate to: `http://localhost:3000/owner/sales/online-orders`
2. The order should appear with:
   - Payment Status: PENDING
   - Order Status: pending
   - Payment Method: scan

### Verification (After Payment):
1. After successful payment, refresh the online orders page
2. The order should update to:
   - Payment Status: SUCCESS (or Paid)
   - Order Status: paid
   - Payment Method: scan

### Filter Testing:
1. Use "Payment Method" filter and select "Scan/QR"
   - The order should remain visible
2. Use "Payment Method" filter and select "COD"
   - The order should be hidden
3. Use "Payment Method" filter and select "All"
   - The order should be visible again

## Test 3: Mixed Orders Filtering

### Steps:
1. Create both a COD order and a QR Scan order (as per tests above)

### Verification:
1. **Owner Dashboard** - Navigate to: `http://localhost:3000/owner/sales/online-orders`
2. Both orders should be visible in the list
3. Test each filter:
   - **All Payment Methods**: Both orders visible
   - **COD**: Only COD order visible
   - **Scan/QR**: Only QR order visible
4. Test status filters:
   - **Pending**: Shows orders with pending status
   - **Delivered**: Shows completed orders
5. Test search:
   - Search by order ID
   - Search by customer name
   - Search by customer email

## Test 4: Order Details View

### Steps:
1. Click the "eye" icon on any order to view details

### Verification:
- Modal shows order details:
  - Customer information (name, email, phone, address)
  - All order items with quantities
  - Total amount
  - Order and payment status

## Test 5: COD Payment Completion

### Steps:
1. Create a COD order
2. Update order status to "delivered"
3. Click "Mark COD as Paid" button

### Verification:
- Order payment status changes to "SUCCESS" or "Paid"
- Order appears in the transactions page

## Troubleshooting

### Orders Not Appearing
1. Check browser console for errors
2. Open Firebase console and verify:
   - `onlineOrders` collection has the new order
   - Order has `orderSource: "web_storefront"` field
3. Try refreshing the page
4. Check if real-time updates are working (create order, see if it appears without refresh)

### QR Orders Not Creating Transactions
1. Check if webhook is properly configured
2. Verify webhook URL in MyanMyanPay settings
3. Check webhook logs for errors
4. Run diagnostic script:
   ```bash
   cd pos-clothing-store-web
   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json node scripts/check-online-orders.js
   ```

### Orders Appear but with Wrong Status
1. Check the status mapping in the code
2. Verify the `paymentStatus` and `status` fields in Firestore
3. Look for console errors in the owner dashboard

## Success Criteria
✅ COD orders appear immediately in online orders page  
✅ QR scan orders appear immediately in online orders page  
✅ Payment method filter works correctly  
✅ Order status filter works correctly  
✅ Search functionality works  
✅ Order details modal shows complete information  
✅ Both order types show customer information  
✅ Real-time updates work (new orders appear without refresh)

## Notes
- The online orders page shows ALL orders from the `onlineOrders` collection
- No filtering by `orderSource` is applied at the query level
- All filtering happens client-side based on user selections
- Both COD and QR scan orders have `orderSource: "web_storefront"` field
- This field helps distinguish customer orders from POS orders in other views
