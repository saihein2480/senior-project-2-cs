# Coupon System Integration Guide

## Overview
The loyalty coupon system allows customers to activate coupons from their membership page and automatically apply discounts at checkout.

## How It Works

### 1. Customer Flow
1. Customer earns loyalty points through purchases
2. When points reach threshold (e.g., 10 points), a coupon is automatically generated
3. Customer visits `/membership` page to see available coupons
4. Customer clicks "Use This Coupon" button on a coupon
5. Coupon is marked as "in use" (highlighted in purple)
6. Customer proceeds to checkout
7. During checkout, the system detects the "in use" coupon and applies discount
8. After successful payment, coupon is marked as "used"

### 2. Coupon States
- **active**: Available to use, not yet selected
- **in use**: Customer has clicked "Use" button, waiting for checkout
- **used**: Applied to a completed transaction
- **expired**: Past expiration date

## API Endpoints

### Mark Coupon for Use
```typescript
POST /api/loyalty/use-coupon
Body: {
  customerId: string,
  couponId: string
}
Response: {
  success: boolean,
  message: string,
  coupon: Coupon
}
```

### Cancel Coupon Selection
```typescript
DELETE /api/loyalty/use-coupon?customerId={id}&couponId={id}
Response: {
  success: boolean,
  message: string
}
```

### Get Active Coupon for Checkout
```typescript
GET /api/loyalty/active-coupon?customerId={id}
Response: {
  success: boolean,
  coupon: {
    id: string,
    code: string,
    discountType: 'percentage' | 'fixed',
    discountValue: number,
    expiresAt: Date
  } | null
}
```

## Integration with Checkout

### Step 1: Check for Active Coupon
When customer reaches checkout page or cart, check if they have an active coupon:

```typescript
import { CouponService } from "@/lib/couponService";

// In your checkout component
const [activeCoupon, setActiveCoupon] = useState<any>(null);
const [discountAmount, setDiscountAmount] = useState(0);

useEffect(() => {
  const fetchActiveCoupon = async () => {
    if (user) {
      const coupon = await CouponService.getActiveCoupon(user.uid);
      if (coupon) {
        setActiveCoupon(coupon);
        
        // Calculate discount
        const { discountAmount, finalAmount } = CouponService.calculateDiscount(
          cartTotal,
          coupon
        );
        setDiscountAmount(discountAmount);
      }
    }
  };
  
  fetchActiveCoupon();
}, [user, cartTotal]);
```

### Step 2: Display Discount in Cart/Checkout
```typescript
<div className="space-y-2">
  <div className="flex justify-between">
    <span>Subtotal:</span>
    <span>฿{cartTotal.toFixed(2)}</span>
  </div>
  
  {activeCoupon && (
    <div className="flex justify-between text-green-600">
      <span>Coupon ({activeCoupon.code}):</span>
      <span>-฿{discountAmount.toFixed(2)}</span>
    </div>
  )}
  
  <div className="flex justify-between font-bold text-lg border-t pt-2">
    <span>Total:</span>
    <span>฿{(cartTotal - discountAmount).toFixed(2)}</span>
  </div>
</div>
```

### Step 3: Apply Coupon at Payment
When creating the order/transaction:

```typescript
const handleCheckout = async () => {
  try {
    // Calculate final amount with coupon
    let finalAmount = cartTotal;
    let appliedCoupon = null;
    
    if (activeCoupon) {
      const { finalAmount: discounted } = CouponService.calculateDiscount(
        cartTotal,
        activeCoupon
      );
      finalAmount = discounted;
      appliedCoupon = activeCoupon;
    }
    
    // Create order with discount
    const orderData = {
      customerId: user.uid,
      items: cartItems,
      subtotal: cartTotal,
      discount: discountAmount,
      total: finalAmount,
      appliedCouponId: appliedCoupon?.id || null,
      appliedCouponCode: appliedCoupon?.code || null,
      // ... other order fields
    };
    
    // Process payment
    const paymentResult = await processPayment(finalAmount);
    
    if (paymentResult.success) {
      // Mark coupon as used
      if (appliedCoupon) {
        await CouponService.useCoupon(
          user.uid,
          appliedCoupon.id,
          orderData.orderId
        );
      }
      
      // Complete order
      await createOrder(orderData);
    }
  } catch (error) {
    console.error("Checkout error:", error);
    
    // If checkout fails, release the coupon
    if (activeCoupon) {
      await CouponService.releaseCoupon(user.uid, activeCoupon.id);
    }
  }
};
```

### Step 4: Handle Checkout Cancellation
If user cancels or checkout fails:

```typescript
const handleCancelCheckout = async () => {
  if (activeCoupon) {
    await CouponService.releaseCoupon(user.uid, activeCoupon.id);
  }
  router.push("/cart");
};
```

## CouponService Methods

### `getActiveCoupon(customerId: string)`
Returns the customer's currently selected coupon (marked as "in use")

### `calculateDiscount(totalAmount: number, coupon: Coupon)`
Calculates discount amount and final amount after discount
```typescript
Returns: {
  discountAmount: number,
  finalAmount: number
}
```

### `useCoupon(customerId: string, couponId: string, transactionId: string)`
Marks coupon as used after successful payment

### `releaseCoupon(customerId: string, couponId: string)`
Removes "in use" flag if checkout is cancelled or fails

## Example: Full Checkout Integration

```typescript
"use client";

import { useState, useEffect } from "react";
import { CouponService } from "@/lib/couponService";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

export default function CheckoutPage() {
  const { user } = useCustomerAuth();
  const [activeCoupon, setActiveCoupon] = useState<any>(null);
  const [cartTotal, setCartTotal] = useState(1000); // Example
  const [finalAmount, setFinalAmount] = useState(1000);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Load active coupon
  useEffect(() => {
    const loadCoupon = async () => {
      if (user) {
        const coupon = await CouponService.getActiveCoupon(user.uid);
        if (coupon) {
          setActiveCoupon(coupon);
          const discount = CouponService.calculateDiscount(cartTotal, coupon);
          setDiscountAmount(discount.discountAmount);
          setFinalAmount(discount.finalAmount);
        }
      }
    };
    loadCoupon();
  }, [user, cartTotal]);

  const handlePayment = async () => {
    try {
      // Create order
      const orderId = `ORD-${Date.now()}`;
      
      // Process payment with final amount
      const paymentSuccess = await processPayment(finalAmount);
      
      if (paymentSuccess && activeCoupon) {
        // Mark coupon as used
        await CouponService.useCoupon(user.uid, activeCoupon.id, orderId);
      }
      
      // Show success message
      alert("Payment successful!");
    } catch (error) {
      console.error("Payment failed:", error);
      
      // Release coupon if payment failed
      if (activeCoupon) {
        await CouponService.releaseCoupon(user.uid, activeCoupon.id);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      
      {/* Order Summary */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold mb-4">Order Summary</h2>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>฿{cartTotal.toFixed(2)}</span>
          </div>
          
          {activeCoupon && (
            <>
              <div className="flex justify-between text-green-600 items-center">
                <div>
                  <span>Coupon Discount</span>
                  <span className="ml-2 text-xs bg-green-100 px-2 py-1 rounded">
                    {activeCoupon.code}
                  </span>
                </div>
                <span>-฿{discountAmount.toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-500">
                {activeCoupon.discountType === "percentage"
                  ? `${activeCoupon.discountValue}% off`
                  : `฿${activeCoupon.discountValue} off`}
              </p>
            </>
          )}
          
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span>฿{finalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
      
      <button
        onClick={handlePayment}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
      >
        Pay ฿{finalAmount.toFixed(2)}
      </button>
    </div>
  );
}
```

## Testing Checklist

- [ ] Customer can see available coupons in membership page
- [ ] "Use" button marks coupon as "in use"
- [ ] Coupon shows as "IN USE" with purple styling
- [ ] Only one coupon can be "in use" at a time
- [ ] Cancel button removes "in use" status
- [ ] Checkout detects "in use" coupon automatically
- [ ] Discount is calculated correctly (percentage and fixed)
- [ ] Successful payment marks coupon as "used"
- [ ] Failed payment releases the coupon
- [ ] Used coupons don't appear in active coupons list
- [ ] Expired coupons cannot be used

## Notes

- Only ONE coupon can be "in use" at a time per customer
- Coupons are automatically validated for expiration
- The "in use" flag is temporary until payment succeeds or fails
- Used coupons store the transaction ID for reference
- Percentage discounts are rounded to 2 decimal places
- Fixed discounts cannot exceed the cart total
