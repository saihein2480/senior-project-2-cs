/**
 * The publicly reachable base URL of the storefront.
 *
 * Anything that leaves the app — a Telegram inline button, a link in an email —
 * has to point at the deployed site, because it is opened on someone else's
 * device. `NEXT_PUBLIC_APP_URL` alone cannot be trusted for that: it is baked in
 * at build time and reads `http://localhost:3001` in local `.env.local`, so
 * Telegram buttons ended up pointing at the developer's own machine. Telegram
 * also refuses a non-public button URL outright, failing the whole message.
 *
 * Resolution order:
 *  1. `PUBLIC_SITE_URL` — explicit override, read at runtime rather than inlined,
 *     so a local bot session can emit links to the live site.
 *  2. `NEXT_PUBLIC_APP_URL`, but only when it is not a localhost address.
 *  3. Vercel's own domain variables, so a deployment is correct with no extra
 *     configuration at all. `VERCEL_PROJECT_PRODUCTION_URL` is the project's
 *     production domain and is set even on preview builds;`VERCEL_URL` is the
 *     per-deployment host and is the fallback.
 *  4. Whatever `NEXT_PUBLIC_APP_URL` said, or the local default — only reached
 *     when nothing public is known, i.e. plain local development.
 */

/** Trim trailing slashes and add a scheme; Vercel supplies a bare hostname. */
function normalise(value: string | undefined | null): string {
  if (!value) return "";

  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Is this URL only reachable from the machine that served it? */
function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost")
    );
  } catch {
    // Unparseable is no use as a public link either.
    return true;
  }
}

export function publicSiteUrl(): string {
  const override = normalise(process.env.PUBLIC_SITE_URL);
  if (override) return override;

  const configured = normalise(process.env.NEXT_PUBLIC_APP_URL);
  if (configured && !isLoopback(configured)) return configured;

  const fromVercel =
    normalise(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalise(process.env.VERCEL_URL);
  if (fromVercel) return fromVercel;

  return configured || "http://localhost:3001";
}

/** `publicSiteUrl()` joined with a path, e.g. `publicSiteUrlFor("/cart")`. */
export function publicSiteUrlFor(path = ""): string {
  const base = publicSiteUrl();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
