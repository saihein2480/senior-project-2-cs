import { NextResponse } from "next/server";

// Proxy GET /api/settings -> http://localhost:3000/api/settings
// No caching for real-time updates
export async function GET() {
  try {
    const upstreamUrl =
      process.env.SETTINGS_API_URL ||
      process.env.NEXT_PUBLIC_SETTINGS_API_URL ||
      "";

    const upstream = await fetch(upstreamUrl, {
      cache: 'no-store', // Disable Next.js caching completely
      next: { revalidate: 0 }, // Never cache
    });
    const data = await upstream.json().catch(() => null);
    const status = upstream.status || 200;
    return NextResponse.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", // Disable all caching
        "Pragma": "no-cache",
        "Expires": "0",
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
