/**
 * Fix existing coupons by adding pointsCost field
 * Run with: node src/scripts/fix-coupon-points-cost.js [customerId]
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (error) {
  console.error('Error loading service account:', error.message);
  console.log('Make sure serviceAccountKey.json exists in the root of pos-clothing-store-web');
  process.exit(1);
}

const db = admin.firestore();

async function fixCouponPointsCost(customerId) {
  try {
    console.log('\n=== Fixing Coupon Points Cost ===\n');
    
    // Get customer data
    const customerRef = db.collection('customers').doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      console.error('❌ Customer not found');
      return;
    }

    const customerData = customerSnap.data();
    const coupons = customerData.coupons || [];
    const currentPoints = customerData.loyaltyPoints || 0;

    console.log(`📊 Customer: ${customerData.displayName || customerData.email}`);
    console.log(`💰 Current Points: ${currentPoints}`);
    console.log(`🎟️  Total Coupons: ${coupons.length}`);

    // Get loyalty settings to know default points cost
    const settingsSnap = await db.collection('settings').doc('loyalty').get();
    const loyaltySettings = settingsSnap.exists ? settingsSnap.data() : null;
    const defaultPointsCost = loyaltySettings?.pointsForCoupon || 10;

    console.log(`\n⚙️  Default points per coupon: ${defaultPointsCost}`);

    // Fix coupons missing pointsCost
    let fixedCount = 0;
    const updatedCoupons = coupons.map(coupon => {
      if (!coupon.pointsCost) {
        fixedCount++;
        console.log(`\n🔧 Fixing coupon: ${coupon.code}`);
        console.log(`   Status: ${coupon.status}`);
        console.log(`   Adding pointsCost: ${defaultPointsCost}`);
        return {
          ...coupon,
          pointsCost: defaultPointsCost
        };
      }
      return coupon;
    });

    if (fixedCount > 0) {
      // Update customer document
      await customerRef.update({
        coupons: updatedCoupons,
        updatedAt: new Date()
      });

      console.log(`\n✅ Fixed ${fixedCount} coupon(s)`);
      console.log(`\n📝 Summary:`);
      console.log(`   - Total coupons: ${coupons.length}`);
      console.log(`   - Fixed: ${fixedCount}`);
      console.log(`   - Already had pointsCost: ${coupons.length - fixedCount}`);
    } else {
      console.log(`\n✅ All coupons already have pointsCost field`);
    }

    // Show current coupon status
    console.log(`\n🎟️  Current Coupons Status:`);
    updatedCoupons.forEach((coupon, idx) => {
      console.log(`   ${idx + 1}. ${coupon.code}`);
      console.log(`      - Status: ${coupon.status}`);
      console.log(`      - Points Cost: ${coupon.pointsCost}`);
      console.log(`      - Discount: ${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : ' THB'}`);
    });

    console.log(`\n=== Fix Complete ===\n`);
    
  } catch (error) {
    console.error('❌ Error fixing coupon points cost:', error);
  } finally {
    process.exit(0);
  }
}

// Get customer ID from command line
const customerId = process.argv[2];

if (!customerId) {
  console.error('❌ Please provide a customer ID');
  console.log('Usage: node src/scripts/fix-coupon-points-cost.js [customerId]');
  process.exit(1);
}

console.log(`Fixing coupons for customer ID: ${customerId}`);
fixCouponPointsCost(customerId);
