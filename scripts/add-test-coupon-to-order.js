/**
 * Script to add test coupon data to an existing transaction
 * This is for testing purposes only
 * 
 * Usage: node scripts/add-test-coupon-to-order.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_ADMIN_KEY || '', 'base64').toString('utf-8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function addCouponToTransaction() {
  try {
    // Transaction ID to update
    const transactionId = 'TXN-0000000000100';
    
    console.log(`Looking for transaction: ${transactionId}`);

    // Find the transaction document
    const transactionsRef = db.collection('transactions');
    const querySnapshot = await transactionsRef
      .where('transactionId', '==', transactionId)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      console.error('❌ Transaction not found:', transactionId);
      process.exit(1);
    }

    const transactionDoc = querySnapshot.docs[0];
    const transactionData = transactionDoc.data();
    
    console.log('✅ Found transaction:', transactionDoc.id);
    console.log('   Total:', transactionData.total);

    // Add test coupon data
    const couponData = {
      couponCode: 'SAVE10',
      appliedCouponCode: 'SAVE10',
      couponId: 'test-coupon-123',
      couponDiscountTHB: 22.00, // 10% of 220 THB
    };

    console.log('\n📝 Adding coupon data:', couponData);

    // Update the transaction
    await transactionDoc.ref.update(couponData);

    console.log('✅ Successfully added coupon data to transaction!');
    console.log('\n🔍 Now check the purchase details at:');
    console.log('   http://localhost:3001/account/purchases');
    console.log('\n   The order should now show:');
    console.log('   Applied Coupon: [SAVE10]');
    console.log('   Discount: -฿22.00');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Run the script
addCouponToTransaction();
