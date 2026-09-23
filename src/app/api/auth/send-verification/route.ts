import { NextResponse } from "next/server";
import { adminAuth, getUidFromAuthHeader } from "../../../../lib/firebase-admin";
import { isEmailConfigured, sendMail } from "../../../../lib/email/mailer";
import { verificationCodeEmail } from "../../../../lib/email/templates";
import {
  CODE_TTL_MINUTES,
  issueVerificationCode,
} from "../../../../lib/email/verification-service";

/**
 * Email a fresh verification code to the signed-in customer.
 *
 * The caller is identified from its Firebase ID token, never from the body, so
 * one customer cannot trigger mail to another account. Used both right after
 * registration and by the "Resend" button.
 */
export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Server auth is not configured" },
        { status: 500 },
      );
    }

    // Authenticate before reporting anything about server configuration, so an
    // anonymous caller cannot probe which integrations are enabled.
    const uid = await getUidFromAuthHeader(req.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!isEmailConfigured) {
      return NextResponse.json(
        {
          error:
            "Email sending is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.",
        },
        { status: 500 },
      );
    }

    const authUser = await adminAuth.getUser(uid);

    // Google accounts arrive already verified by the provider; issuing our own
    // code would be busywork the customer cannot act on.
    if (authUser.emailVerified) {
      return NextResponse.json({ alreadyVerified: true });
    }

    const email = authUser.email;
    if (!email) {
      return NextResponse.json(
        { error: "This account has no email address" },
        { status: 400 },
      );
    }

    const issued = await issueVerificationCode(uid, email);
    if (!issued.ok) {
      // 429 so the client can surface the cooldown rather than a generic error.
      return NextResponse.json(
        { error: issued.error, retryAfterSeconds: issued.retryAfterSeconds },
        { status: issued.retryAfterSeconds ? 429 : 500 },
      );
    }

    const message = verificationCodeEmail({
      displayName: authUser.displayName || "",
      code: issued.code,
      expiryMinutes: CODE_TTL_MINUTES,
    });

    const result = await sendMail({
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (!result.sent) {
      return NextResponse.json(
        { error: result.error || "Failed to send verification email" },
        { status: 502 },
      );
    }

    // Echo the masked destination only; the code stays server-side.
    return NextResponse.json({
      sent: true,
      email: maskEmail(email),
      expiresAt: issued.expiresAt.toISOString(),
      expiryMinutes: CODE_TTL_MINUTES,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send verification";
    console.error("send-verification failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** `alexandra@gmail.com` -> `al******@gmail.com`. */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shown = local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
