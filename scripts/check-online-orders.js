/**
 * Diagnostic script to check online orders in Firestore
 * Run with: node scripts/check-online-orders.js
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

if (!serviceAccountPath) {
  console.error("Error: FIREBASE_SERVICE_ACCOUNT_KEY_PATH environment variable not set");
  process.exit(1);
}

try {
  const serviceAccount = require(path.resolve(serviceAccountPath));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  
  console.log("✓ Firebase Admin initialized");
} catch (error) {
  console.error("Error initializing Firebase Admin:", error.message);
  process.exit(1);
}

const db = admin.firestore();

async function checkOnlineOrders() {
  try {
    console.log("\n=== Checking onlineOrders Collection ===\n");
    
    const snapshot = await db.collection("onlineOrders")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    
    if (snapshot.empty) {
      console.log("No online orders found.");
      return;
    }
    
    console.log(`Found ${snapshot.size} recent orders:\n`);
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Order ID: ${doc.id}`);
      console.log(`  Order Source: ${data.orderSource || "NOT SET"}`);
      console.log(`  Payment Method: ${data.paymentMethod || "NOT SET"}`);
      console.log(`  Payment Status: ${data.paymentStatus || "NOT SET"}`);
      console.log(`  Status: ${data.status || "NOT SET"}`);
      console.log(`  Provider: ${data.provider || "NOT SET"}`);
      console.log(`  Customer: ${data.customer?.displayName || "N/A"}`);
      console.log(`  Amount: ${data.amountMmk || 0} MMK`);
      console.log(`  Created: ${data.createdAt}`);
      console.log(`  Updated: ${data.updatedAt}`);
      console.log("");
    });
    
    // Check for orders missing orderSource
    const missingSourceSnapshot = await db.collection("onlineOrders")
      .where("orderSource", "==", null)
      .limit(5)
      .get();
    
    if (!missingSourceSnapshot.empty) {
      console.log(`\n⚠ Found ${missingSourceSnapshot.size} orders without orderSource field`);
      console.log("These orders might not show up correctly in filtered views.");
    }
    
  } catch (error) {
    console.error("Error checking online orders:", error);
  }
}

async function checkTransactions() {
  try {
    console.log("\n=== Checking transactions Collection (Web Orders) ===\n");
    
    const snapshot = await db.collection("transactions")
      .where("orderSource", "==", "web_storefront")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    
    if (snapshot.empty) {
      console.log("No web storefront transactions found.");
      return;
    }
    
    console.log(`Found ${snapshot.size} web storefront transactions:\n`);
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Transaction ID: ${data.transactionId || doc.id}`);
      console.log(`  Order Source: ${data.orderSource}`);
      console.log(`  Payment Method: ${data.paymentMethod || "NOT SET"}`);
      console.log(`  Status: ${data.status || "NOT SET"}`);
      console.log(`  Total: ${data.total || 0} THB`);
      console.log(`  Customer: ${data.customer?.displayName || "N/A"}`);
      console.log("");
    });
    
  } catch (error) {
    console.error("Error checking transactions:", error);
  }
}

async function main() {
  await checkOnlineOrders();
  await checkTransactions();
  
  console.log("\n✓ Diagnostic complete\n");
  process.exit(0);
}

main();
