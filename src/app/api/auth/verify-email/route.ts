import { NextResponse } from "next/server";
import { adminAuth, getUidFromAuthHeader } from "../../../../lib/firebase-admin";
import { confirmVerificationCode } from "../../../../lib/email/verification-service";

/**
 * Confirm a customer's email using the 6-digit code that was mailed to them.
 *
 * As with sending, the account is taken from the verified ID token, so a caller
 * can only ever verify itself.
 */
export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Server auth is not configured" },
        { status: 500 },
      );
    }

    const uid = await getUidFromAuthHeader(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      code?: unknown;
    } | null;

    const code = typeof body?.code === "string" ? body.code : "";

    const result = await confirmVerificationCode(uid, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify email";
    console.error("verify-email failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
