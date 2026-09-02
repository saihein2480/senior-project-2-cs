/**
 * Fix points for customers who used coupons before pointsCost was implemented
 * This script will:
 * 1. Find all "used" coupons
 * 2. Check if they have pointsCost
 * 3. Retroactively deduct points if they weren't deducted
 * 
 * Run with: node src/scripts/fix-used-coupon-points.js [customerId]
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

async function fixUsedCouponPoints(customerId) {
  try {
    console.log('\n=== Fixing Used Coupon Points ===\n');
    
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

    // Get loyalty settings
    const settingsSnap = await db.collection('settings').doc('loyalty').get();
    const loyaltySettings = settingsSnap.exists ? settingsSnap.data() : null;
    const defaultPointsCost = loyaltySettings?.pointsForCoupon || 10;

    // Find used coupons
    const usedCoupons = coupons.filter(c => c.status === 'used');
    console.log(`\n🎟️  Found ${usedCoupons.length} used coupon(s)`);

    let totalPointsToDeduct = 0;

    usedCoupons.forEach((coupon, idx) => {
      const pointsCost = coupon.pointsCost || defaultPointsCost;
      console.log(`\n   ${idx + 1}. ${coupon.code}`);
      console.log(`      - Used at: ${coupon.usedAt ? new Date(coupon.usedAt.seconds * 1000).toLocaleString() : 'Unknown'}`);
      console.log(`      - Points Cost: ${pointsCost}`);
      console.log(`      - Transaction: ${coupon.usedInTransaction || 'N/A'}`);
      
      totalPointsToDeduct += pointsCost;
    });

    if (usedCoupons.length > 0) {
      console.log(`\n📊 Calculation:`);
      console.log(`   Current Points: ${currentPoints}`);
      console.log(`   Total to Deduct: ${totalPointsToDeduct}`);
      console.log(`   New Balance: ${Math.max(0, currentPoints - totalPointsToDeduct)}`);

      const newPoints = Math.max(0, currentPoints - totalPointsToDeduct);

      // Ask for confirmation
      console.log(`\n⚠️  This will deduct ${totalPointsToDeduct} points from the customer's account.`);
      console.log(`   Do you want to proceed? (Run with --confirm flag)`);

      if (process.argv.includes('--confirm')) {
        await customerRef.update({
          loyaltyPoints: newPoints,
          updatedAt: new Date()
        });

        console.log(`\n✅ Points updated successfully!`);
        console.log(`   New balance: ${newPoints} points`);
      } else {
        console.log(`\n   Add --confirm flag to apply changes`);
        console.log(`   Example: node src/scripts/fix-used-coupon-points.js ${customerId} --confirm`);
      }
    } else {
      console.log(`\n✅ No used coupons found - nothing to fix`);
    }

    console.log(`\n=== Fix Complete ===\n`);
    
  } catch (error) {
    console.error('❌ Error fixing used coupon points:', error);
  } finally {
    process.exit(0);
  }
}

// Get customer ID from command line
const customerId = process.argv[2];

if (!customerId || customerId === '--confirm') {
  console.error('❌ Please provide a customer ID');
  console.log('Usage: node src/scripts/fix-used-coupon-points.js [customerId] [--confirm]');
  console.log('Example: node src/scripts/fix-used-coupon-points.js xQX29NSY9IPM5YWfyIPt6cQ1C8B3 --confirm');
  process.exit(1);
}

console.log(`Checking used coupons for customer ID: ${customerId}`);
fixUsedCouponPoints(customerId);
