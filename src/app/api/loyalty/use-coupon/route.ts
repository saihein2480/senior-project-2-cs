import { NextRequest, NextResponse } from "next/server";
import { adminDb, getUidFromAuthHeader } from "@/lib/firebase-admin";

/**
 * Mark one of the signed-in customer's coupons for use at checkout, or release it.
 *
 *   POST   /api/loyalty/use-coupon            body: { couponId }
 *   DELETE /api/loyalty/use-coupon?couponId=<id>
 *   headers: Authorization: Bearer <firebase id token>
 *
 * The customer is always the caller identified by the ID token. A `customerId`
 * in the body or query string is ignored: it used to be trusted, which let
 * anyone reserve or release another customer's coupons.
 *
 * Runs on the Admin SDK. The client SDK has no signed-in user on the server, so
 * it could only work while the Firestore rules left customer documents open.
 */

type StoredCoupon = Record<string, unknown> & {
  id?: unknown;
  status?: unknown;
  expiresAt?: unknown;
};

/** A 4xx outcome raised from inside the Firestore transaction. */
class CouponRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Same rule as before: a missing or unparseable expiry never counts as expired. */
function isExpired(expiresAt: unknown): boolean {
  const date =
    expiresAt &&
    typeof expiresAt === "object" &&
    typeof (expiresAt as { toDate?: unknown }).toDate === "function"
      ? (expiresAt as { toDate: () => Date }).toDate()
      : new Date(expiresAt as string | number | Date);
  return date < new Date();
}

function notAuthenticated() {
  return NextResponse.json(
    { success: false, error: "Not authenticated" },
    { status: 401 },
  );
}

/**
 * Read-modify-write the caller's `coupons` array inside a transaction, so a
 * concurrent write (an order consuming a coupon, a new redemption) is not lost.
 * `mutate` returns the updated coupon, or throws `CouponRequestError`.
 */
async function updateCoupon(
  uid: string,
  couponId: string,
  mutate: (coupon: StoredCoupon) => StoredCoupon,
): Promise<StoredCoupon> {
  const db = adminDb!;
  const customerRef = db.collection("customers").doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(customerRef);
    if (!snap.exists) {
      throw new CouponRequestError("Customer not found", 404);
    }

    const stored = snap.data()?.coupons;
    const coupons: StoredCoupon[] = Array.isArray(stored) ? [...stored] : [];
    const index = coupons.findIndex((c) => c?.id === couponId);

    if (index === -1) {
      throw new CouponRequestError("Coupon not found", 404);
    }

    const updated = mutate(coupons[index]);
    coupons[index] = updated;

    tx.update(customerRef, { coupons, updatedAt: new Date() });
    return updated;
  });
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CouponRequestError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    );
  }

  // Callers log the error; the raw text is not sent to the client.
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  );
}

const MAX_COUPON_ID_LENGTH = 200;

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    const uid = await getUidFromAuthHeader(request.headers.get("authorization"));
    if (!uid) return notAuthenticated();

    const body = await request.json().catch(() => null);
    const couponId =
      typeof body?.couponId === "string" ? body.couponId.trim() : "";

    if (!couponId) {
      return NextResponse.json(
        { success: false, error: "Coupon ID is required" },
        { status: 400 }
      );
    }

    if (couponId.length > MAX_COUPON_ID_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Invalid coupon ID" },
        { status: 400 }
      );
    }

    const coupon = await updateCoupon(uid, couponId, (current) => {
      if (current.status === "used") {
        throw new CouponRequestError("Coupon has already been used", 400);
      }

      if (isExpired(current.expiresAt)) {
        throw new CouponRequestError("Coupon has expired", 400);
      }

      return { ...current, inUse: true, markedForUseAt: new Date() };
    });

    return NextResponse.json({
      success: true,
      message: "Coupon marked for use. Apply it at checkout!",
      coupon,
    });
  } catch (error) {
    if (!(error instanceof CouponRequestError)) {
      console.error("Error marking coupon for use:", error);
    }
    return errorResponse(error, "Failed to mark coupon for use");
  }
}

// Cancel using a coupon
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    const uid = await getUidFromAuthHeader(request.headers.get("authorization"));
    if (!uid) return notAuthenticated();

    const couponId = (
      new URL(request.url).searchParams.get("couponId") || ""
    ).trim();

    if (!couponId) {
      return NextResponse.json(
        { success: false, error: "Coupon ID is required" },
        { status: 400 }
      );
    }

    if (couponId.length > MAX_COUPON_ID_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Invalid coupon ID" },
        { status: 400 }
      );
    }

    await updateCoupon(uid, couponId, (current) => {
      const released = { ...current };
      delete released.inUse;
      delete released.markedForUseAt;
      return released;
    });

    return NextResponse.json({
      success: true,
      message: "Coupon unmarked",
    });
  } catch (error) {
    if (!(error instanceof CouponRequestError)) {
      console.error("Error unmarking coupon:", error);
    }
    return errorResponse(error, "Failed to unmark coupon");
  }
}
