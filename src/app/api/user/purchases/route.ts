import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const uid = await getUidFromAuthHeader(authHeader);
    if (!uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const url = new URL(request.url);
    const pageSize = Math.min(Number(url.searchParams.get("limit")) || 20, 50); // Max 50 per request
    const lastDocId = url.searchParams.get("lastDocId");
    const filterStatus = url.searchParams.get("status") || "all";
    const filterPaymentStatus = url.searchParams.get("paymentStatus") || "all";
    const dateRange = url.searchParams.get("dateRange") || "all";
    const search = url.searchParams.get("search") || "";

    // Build the base query using admin SDK
    let baseQuery = adminDb.collection("transactions")
      .where("customer.uid", "==", uid)
      .orderBy("timestamp", "desc")
      .limit(pageSize);

    // Handle pagination with cursor
    if (lastDocId) {
      const lastDoc = await adminDb.collection("transactions").doc(lastDocId).get();
      if (lastDoc.exists) {
        baseQuery = adminDb.collection("transactions")
          .where("customer.uid", "==", uid)
          .orderBy("timestamp", "desc")
          .startAfter(lastDoc)
          .limit(pageSize);
      }
    }

    const snapshot = await baseQuery.get();
    
    const transactions = snapshot.docs.map(doc => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        ...data,
        // Convert Timestamp to string for JSON serialization
        timestamp: data.timestamp && data.timestamp.toDate
          ? data.timestamp.toDate().toISOString() 
          : data.timestamp,
      };
    });

    // Get online order statuses for the returned transactions
    const orderIds = transactions
      .map((t: any) => t.onlineOrderId)
      .filter(Boolean);

    let orderStatuses: Record<string, any> = {};
    
    if (orderIds.length > 0) {
      const ordersQuery = adminDb.collection("onlineOrders")
        .where("customer.uid", "==", uid);
      
      const ordersSnapshot = await ordersQuery.get();
      
      ordersSnapshot.docs.forEach(doc => {
        const order = doc.data();
        orderStatuses[doc.id] = {
          status: order.status,
          paymentStatus: order.paymentStatus,
        };
        if (order.orderId) {
          orderStatuses[order.orderId] = {
            status: order.status,
            paymentStatus: order.paymentStatus,
          };
        }
      });
    }

    const hasMore = snapshot.docs.length === pageSize;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        transactions,
        orderStatuses,
        pagination: {
          hasMore,
          lastDocId: lastDoc?.id || null,
          pageSize,
          total: transactions.length,
        }
      }
    });

  } catch (error) {
    console.error("Error fetching user purchases:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchases" }, 
      { status: 500 }
    );
  }
}