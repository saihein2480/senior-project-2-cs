import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";
import {
  validateOptionalImage,
  validateOptionalText,
  validateTransactionRef,
} from "@/lib/server/requestValidation";
import { requestOrderCancellation } from "@/lib/server/cancellationRequest";

/**
 * POST /api/transactions/request-cancel
 *   headers: Authorization: Bearer <firebase id token>
 *   body: { transactionId, reason?, qrCodeImage? }
 *
 * The requesting customer is taken from the ID token only. A `customerUid` in
 * the body (sent by older clients) is ignored; it used to be trusted, so anyone
 * could file a cancellation against another customer's order.
 *
 * The checks and the write live in lib/server/cancellationRequest.ts, shared
 * with the Telegram bot so both refuse and accept the same orders. Responses:
 *   200 { success, message }   request filed (owner approves it in the POS)
 *   400 { error }              invalid input, or the order is not cancellable
 *                              (already cancelled/refunded, request pending,
 *                              delivered, out for delivery, payment/stock
 *                              problem, scan/wallet without a QR image)
 *   401 / 403 / 404 / 413 / 500 as before
 */
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const customerUid = await getUidFromAuthHeader(
      request.headers.get("authorization"),
    );
    if (!customerUid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const {
      transactionId: rawTransactionId,
      reason: rawReason,
      qrCodeImage: rawQrCodeImage,
    } = body ?? {};

    // Validate required fields
    if (
      !rawTransactionId ||
      (typeof rawTransactionId !== "string" && typeof rawTransactionId !== "number")
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // The QR screenshot is a JPEG data URL from the purchases page (or an
    // image on the store's own storage host); anything else is refused.
    const transactionRef = validateTransactionRef(rawTransactionId);
    if (!transactionRef.ok) {
      return NextResponse.json({ error: transactionRef.error }, { status: 400 });
    }
    const reasonCheck = validateOptionalText(rawReason, "Reason");
    if (!reasonCheck.ok) {
      return NextResponse.json({ error: reasonCheck.error }, { status: 400 });
    }
    const qrCheck = validateOptionalImage(rawQrCodeImage, "QR code image");
    if (!qrCheck.ok) {
      return NextResponse.json({ error: qrCheck.error }, { status: 400 });
    }

    const result = await requestOrderCancellation(
      {
        uid: customerUid,
        transactionId: transactionRef.value,
        reason: reasonCheck.value,
        qrCodeImage: qrCheck.value,
        channel: "web",
      },
      { db: adminDb },
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Error creating cancellation request:", error);
    return NextResponse.json(
      { error: "Failed to create cancellation request" },
      { status: 500 }
    );
  }
}
