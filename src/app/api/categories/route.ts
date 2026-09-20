import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Categories are owned by the POS app, which stores them as a single array on
 * `settings/categories` (see CategoryService in pos-clothing-store).
 *
 * This is read with the admin SDK rather than from the browser so the
 * storefront doesn't depend on `settings` being publicly readable by Firestore
 * security rules. The client also opens a realtime listener on the same
 * document as an optimisation; if the rules deny it, this route is the
 * guaranteed source of truth.
 */
export async function GET() {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not available", data: [] },
        { status: 500 },
      );
    }

    const snap = await adminDb.collection("settings").doc("categories").get();

    const raw = snap.exists ? snap.data()?.categories : [];
    const categories = Array.isArray(raw)
      ? raw.map((c) => String(c ?? "").trim()).filter((c) => c.length > 0)
      : [];

    return NextResponse.json(
      { success: true, data: categories },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch categories",
        details: error instanceof Error ? error.message : String(error),
        data: [],
      },
      { status: 500 },
    );
  }
}
