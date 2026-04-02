import type { NextApiRequest, NextApiResponse } from "next";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import app from "../../lib/firebase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (!app) {
      res.status(500).json({
        items: [],
        error: "Firebase is not configured",
      });
      return;
    }

    const db = getFirestore(app);
    const q = query(
      collection(db, "products"),
      orderBy("createdAt", "desc"),
      limit(4),
    );
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ items });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error) || "Failed to fetch new items";
    res.status(500).json({
      items: [],
      error: errorMessage,
    });
  }
}
