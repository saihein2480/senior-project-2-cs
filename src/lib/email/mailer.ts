import nodemailer from "nodemailer";

/**
 * Gmail SMTP transport.
 *
 * Gmail refuses a normal account password over SMTP, so `GMAIL_APP_PASSWORD`
 * must be a 16-character App Password generated at
 * https://myaccount.google.com/apppasswords (requires 2-Step Verification on
 * the sending account). See documents/EMAIL_VERIFICATION_SETUP.md.
 *
 * Mirrors the firebase-admin pattern: when the env vars are absent the module
 * exports nulls rather than throwing at import time, so the rest of the app
 * still builds and runs with email disabled.
 */
const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

export const isEmailConfigured = !!(gmailUser && gmailAppPassword);

const transporter = isEmailConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        // Google shows App Passwords as "abcd efgh ijkl mnop"; strip the
        // display spacing so a copy-paste of that form still authenticates.
        pass: (gmailAppPassword as string).replace(/\s+/g, ""),
      },
    })
  : null;

/** Friendly From header, e.g. `Pink Boutique <shop@gmail.com>`. */
function fromHeader() {
  const name = process.env.EMAIL_FROM_NAME || "Pink Boutique";
  return `"${name}" <${gmailUser}>`;
}

export type SendMailResult = { sent: boolean; error?: string };

/**
 * Send one transactional email.
 *
 * Never throws: callers are API routes that must not leak SMTP internals to
 * the client, so failures come back as `{ sent: false, error }`.
 */
export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendMailResult> {
  if (!transporter) {
    return { sent: false, error: "Email is not configured on the server" };
  }

  try {
    await transporter.sendMail({
      from: fromHeader(),
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { sent: true };
  } catch (error) {
    // Log the transport failure for the operator, but keep the detail server-side.
    console.error("Failed to send email:", error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}
