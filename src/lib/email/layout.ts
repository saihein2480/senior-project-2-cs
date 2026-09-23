/**
 * Shared HTML shell for transactional email.
 *
 * Email clients strip <style> blocks and ignore most modern CSS, so everything
 * here is table layout with inline styles — the same constraint that shaped
 * `verificationCodeEmail`. Keeping the chrome in one place means a new
 * notification only has to describe its own body.
 */

/** Escape untrusted values before interpolating them into HTML. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Brand name shown in the header strip and the From address. */
export function brandName() {
  return process.env.EMAIL_FROM_NAME || "Pink Boutique";
}

/**
 * Storefront base URL used for links in outgoing mail.
 *
 * Falls back to the dev port rather than a relative path: a relative href is
 * useless once the message is sitting in somebody's inbox.
 */
export function storefrontUrl(path = "") {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
  ).replace(/\/+$/, "");
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** One label/value row in the details table. */
export interface EmailDetailRow {
  label: string;
  value: string;
  /** Renders bigger and in the brand colour — use for the headline figure. */
  emphasis?: boolean;
}

export interface EmailLayoutOptions {
  /** Small emoji/badge above the heading, e.g. "🎉". */
  badge?: string;
  heading: string;
  /** Recipient's name. Rendered as "Hi <name>," above the intro when present. */
  greetingName?: string;
  /** Sentence under the heading. Plain text; it gets escaped. */
  intro: string;
  detailRows?: EmailDetailRow[];
  /** Pre-escaped HTML block inserted after the details table. */
  extraHtml?: string;
  callToAction?: { label: string; url: string };
  /** Closing line above the footer rule. Plain text; escaped. */
  outro?: string;
  /** Grey small print at the very bottom. Plain text; escaped. */
  footerNote?: string;
}

/**
 * Render the full document for one notification email.
 *
 * Every caller-supplied string except `extraHtml` is escaped here, so template
 * authors cannot accidentally inject a customer-controlled value.
 */
export function renderEmailLayout(options: EmailLayoutOptions): string {
  const brand = escapeHtml(brandName());
  const heading = escapeHtml(options.heading);
  const intro = escapeHtml(options.intro);

  const detailsHtml = options.detailRows?.length
    ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff1f2;border:1px solid #fecdd3;border-radius:16px;padding:8px 20px;">
                  ${options.detailRows
                    .map(
                      (row) => `
                  <tr>
                    <td style="padding:10px 0;font-size:13px;color:#6b7280;">${escapeHtml(row.label)}</td>
                    <td align="right" style="padding:10px 0;font-size:${
                      row.emphasis ? "16px" : "13px"
                    };font-weight:${row.emphasis ? "700" : "600"};color:${
                      row.emphasis ? "#e11d48" : "#111827"
                    };">${escapeHtml(row.value)}</td>
                  </tr>`,
                    )
                    .join("")}
                </table>`
    : "";

  const ctaHtml = options.callToAction
    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
                  <tr>
                    <td align="center" style="border-radius:999px;background-color:#e11d48;">
                      <a href="${escapeHtml(options.callToAction.url)}"
                         style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
                        ${escapeHtml(options.callToAction.label)}
                      </a>
                    </td>
                  </tr>
                </table>`
    : "";

  const outroHtml = options.outro
    ? `<p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#6b7280;">${escapeHtml(options.outro)}</p>`
    : "";

  const footerHtml = options.footerNote
    ? escapeHtml(options.footerNote)
    : `You are receiving this because you have an account with ${brand}. Manage your notification settings in your account page.`;

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#fff5f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff5f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #ffe4e6;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#e11d48;">
                  ${brand}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                ${options.badge ? `<p style="margin:14px 0 0 0;font-size:30px;line-height:1;">${escapeHtml(options.badge)}</p>` : ""}
                <h1 style="margin:10px 0 0 0;font-size:22px;line-height:1.3;color:#111827;">
                  ${heading}
                </h1>
                ${
                  options.greetingName
                    ? `<p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#111827;">Hi ${escapeHtml(options.greetingName)},</p>`
                    : ""
                }
                <p style="margin:${options.greetingName ? "6px" : "12px"} 0 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                ${detailsHtml}
                ${options.extraHtml || ""}
                ${ctaHtml}
                ${outroHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px 32px;">
                <hr style="border:none;border-top:1px solid #ffe4e6;margin:0 0 16px 0;" />
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  ${footerHtml}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Plain-text twin of `renderEmailLayout`.
 *
 * Gmail and most clients fall back to this when HTML is blocked, and a missing
 * text part is a strong spam signal, so every template ships both.
 */
export function renderEmailText(options: {
  heading: string;
  greetingName?: string;
  intro: string;
  detailRows?: EmailDetailRow[];
  extraLines?: string[];
  callToAction?: { label: string; url: string };
  outro?: string;
}): string {
  const lines: string[] = [brandName(), "", options.heading, ""];

  if (options.greetingName) {
    lines.push(`Hi ${options.greetingName},`, "");
  }

  lines.push(options.intro);

  if (options.detailRows?.length) {
    lines.push("");
    options.detailRows.forEach((row) => {
      lines.push(`${row.label}: ${row.value}`);
    });
  }

  if (options.extraLines?.length) {
    lines.push("", ...options.extraLines);
  }

  if (options.callToAction) {
    lines.push("", `${options.callToAction.label}: ${options.callToAction.url}`);
  }

  if (options.outro) {
    lines.push("", options.outro);
  }

  return lines.join("\n");
}
