/**
 * Helper function to update customer purchase statistics
 * This should be called when an order is completed/paid
 */

import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function updateCustomerStats(
  customerUid: string,
  orderTotal: number,
  incrementPurchases: number = 1
) {
  if (!adminDb || !customerUid) {
    console.warn("Cannot update customer stats: Firebase Admin not configured or no customer UID");
    return;
  }

  try {
    const customerRef = adminDb.collection("customers").doc(customerUid);
    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      console.warn(`Customer document not found for UID: ${customerUid}`);
      // Try to create the customer document from users collection
      const userRef = adminDb.collection("users").doc(customerUid);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        await customerRef.set({
          uid: customerUid,
          email: userData?.email || "",
          displayName: userData?.displayName || "Customer",
          phone: userData?.phone || "",
          address: userData?.address || "",
          customerType: userData?.customerType || "individual",
          customerSource: "online",
          isOnline: true,
          totalPurchases: incrementPurchases,
          totalSpent: orderTotal,
          receivables: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`✅ Created customer document for online user: ${customerUid}`);
        return;
      }
    }

    // Update existing customer document
    await customerRef.update({
      totalPurchases: FieldValue.increment(incrementPurchases),
      totalSpent: FieldValue.increment(orderTotal),
      lastPurchaseDate: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Updated customer stats for ${customerUid}: +${incrementPurchases} purchase(s), +${orderTotal} spent`);
  } catch (error) {
    console.error("Error updating customer stats:", error);
    // Don't throw error - this is a non-critical operation
  }
}

/**
 * Sync customer data from users collection to customers collection
 * Useful for ensuring online customers appear in the POS customer list
 */
export async function syncOnlineCustomerToPos(customerUid: string) {
  if (!adminDb || !customerUid) {
    return;
  }

  try {
    const userRef = adminDb.collection("users").doc(customerUid);
    const customerRef = adminDb.collection("customers").doc(customerUid);

    const [userDoc, customerDoc] = await Promise.all([
      userRef.get(),
      customerRef.get(),
    ]);

    if (!userDoc.exists) {
      console.warn(`User document not found for UID: ${customerUid}`);
      return;
    }

    const userData = userDoc.data();
    
    // Only sync if user is a customer
    if (userData?.role !== "customer") {
      return;
    }

    const baseCustomerData = {
      uid: customerUid,
      email: userData.email || "",
      displayName: userData.displayName || "Customer",
      phone: userData.phone || "",
      address: userData.address || "",
      customerType: userData.customerType || "individual",
      customerSource: "online",
      isOnline: true,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!customerDoc.exists) {
      // Create new customer document
      await customerRef.set({
        ...baseCustomerData,
        totalPurchases: 0,
        totalSpent: 0,
        receivables: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`✅ Synced online customer to POS: ${customerUid}`);
    } else {
      // Update existing customer document (preserving purchase stats)
      await customerRef.update(baseCustomerData);
      console.log(`✅ Updated online customer info in POS: ${customerUid}`);
    }
  } catch (error) {
    console.error("Error syncing online customer to POS:", error);
  }
}
