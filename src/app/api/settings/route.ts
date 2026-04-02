import { NextResponse } from "next/server";

// Proxy GET /api/settings -> http://localhost:3000/api/settings
export async function GET() {
  try {
    const upstreamUrl =
      process.env.SETTINGS_API_URL ||
      process.env.NEXT_PUBLIC_SETTINGS_API_URL ||
      "";

    const upstream = await fetch(upstreamUrl, {
      next: { revalidate: 600 }, // Cache for 10 minutes (settings change less frequently)
    });
    const data = await upstream.json().catch(() => null);
    const status = upstream.status || 200;
    return NextResponse.json(data, {
      status,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
      },
    });
  } catch (error) {
    console.error("Error proxying /api/settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}
