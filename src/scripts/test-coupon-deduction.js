/**
 * Test script to verify coupon points deduction
 * Run with: node --experimental-modules src/scripts/test-coupon-deduction.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function testCouponDeduction(customerId) {
  try {
    console.log('\n=== Testing Coupon Points Deduction ===\n');
    
    // Get customer data
    const customerRef = db.collection('customers').doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      console.error('❌ Customer not found');
      return;
    }

    const customerData = customerSnap.data();
    console.log('📊 Current customer data:');
    console.log('- Loyalty Points:', customerData.loyaltyPoints || 0);
    console.log('- Total Points Earned:', customerData.totalPointsEarned || 0);
    console.log('- Active Coupons:', customerData.activeCouponsCount || 0);
    
    const coupons = customerData.coupons || [];
    const activeCoupons = coupons.filter(c => c.status === 'active');
    
    console.log('\n🎟️  Active Coupons:');
    activeCoupons.forEach((coupon, idx) => {
      console.log(`  ${idx + 1}. ${coupon.code} - ${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : 'THB'} off`);
      console.log(`     - Points Cost: ${coupon.pointsCost || 'NOT SET'}`);
      console.log(`     - Status: ${coupon.status}`);
      console.log(`     - In Use: ${coupon.inUse || false}`);
    });

    // Check if coupons have pointsCost field
    const missingPointsCost = coupons.filter(c => !c.pointsCost);
    if (missingPointsCost.length > 0) {
      console.log(`\n⚠️  Warning: ${missingPointsCost.length} coupon(s) missing 'pointsCost' field`);
      console.log('   This means points won\'t be deducted when these coupons are used!');
    } else {
      console.log('\n✅ All coupons have pointsCost field set');
    }

    console.log('\n=== Test Complete ===\n');
    
  } catch (error) {
    console.error('❌ Error testing coupon deduction:', error);
  } finally {
    process.exit(0);
  }
}

// Get customer ID from command line or use default
const customerId = process.argv[2] || 'xQX29NSY9IPM5YWfyIPt6cQ1C8B3';

console.log(`Testing for customer ID: ${customerId}`);
testCouponDeduction(customerId);
