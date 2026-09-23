/**
 * Transactional email bodies.
 *
 * Email clients strip <style> blocks and ignore most modern CSS, so these use
 * table layout and inline styles on purpose.
 *
 * The verification mail below predates the shared shell in `./layout` and keeps
 * its own bespoke markup (the giant letter-spaced code block does not fit the
 * generic detail-row layout). Notification bodies live in
 * `../notifications/content` and are built from `renderEmailLayout` instead.
 */

import { escapeHtml } from "./layout";

export function verificationCodeEmail(options: {
  displayName: string;
  code: string;
  expiryMinutes: number;
}) {
  const name = escapeHtml(options.displayName || "there");
  const code = escapeHtml(options.code);
  const brand = escapeHtml(process.env.EMAIL_FROM_NAME || "Pink Boutique");

  const subject = `${options.code} is your ${brand} verification code`;

  const text = [
    `Hi ${options.displayName || "there"},`,
    "",
    `Your ${brand} email verification code is: ${options.code}`,
    "",
    `This code expires in ${options.expiryMinutes} minutes.`,
    "",
    "If you did not create an account, you can safely ignore this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#fff5f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff5f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #ffe4e6;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#e11d48;">
                  ${brand}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <h1 style="margin:12px 0 0 0;font-size:22px;line-height:1.3;color:#111827;">
                  Verify your email address
                </h1>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                  Hi ${name}, use the code below to finish setting up your account.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <div style="background-color:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:20px;text-align:center;">
                  <span style="display:block;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#9ca3af;">
                    Verification code
                  </span>
                  <span style="display:block;margin-top:8px;font-size:34px;font-weight:700;letter-spacing:10px;color:#e11d48;font-family:Consolas,Menlo,monospace;">
                    ${code}
                  </span>
                </div>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  This code expires in <strong style="color:#111827;">${options.expiryMinutes} minutes</strong>.
                  Do not share it with anyone.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <hr style="border:none;border-top:1px solid #ffe4e6;margin:0 0 16px 0;" />
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  If you did not create an account, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
