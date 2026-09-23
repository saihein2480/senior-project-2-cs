"use client";

/**
 * Telegram connection panel for the customer profile page.
 *
 * Linking is completed by the bot, not by this page: the customer taps through
 * to Telegram, the bot receives the deep-link `/start` and writes the chat id.
 * Nothing pushes that back to the browser, so after sending the customer off we
 * poll `/api/telegram/link-status` until it flips (or we give up), which is what
 * turns this into a visible confirmation instead of a dead end.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

interface LinkStatus {
  linked: boolean;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  linkedAt: string | null;
  telegramConfigured: boolean;
}

/** How long to keep watching for the link to complete, and how often. */
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

const TelegramIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.717-.962 3.93-1.362 5.214-.168.545-.505.727-.826.745-.703.064-1.237-.464-1.918-.909-1.067-.696-1.669-1.128-2.702-1.806-.996-.671-.345-1.04.226-1.644.149-.158 2.743-2.513 2.793-2.724.006-.027.013-.124-.046-.175-.059-.051-.146-.034-.209-.02-.089.02-1.517.964-4.279 2.831-.405.278-.772.413-1.101.406-.363-.008-1.061-.205-1.579-.374-.635-.206-1.14-.316-1.097-.666.022-.183.279-.37.772-.562 3.024-1.316 5.04-2.183 6.049-2.6 2.881-1.202 3.481-1.411 3.871-1.418.086-.001.278.02.402.121.105.085.134.2.148.281.013.08.03.263.017.407z" />
  </svg>
);

export function TelegramLinkCard({ user }: { user: FirebaseUser }) {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);

  // Polling handles live in refs so the cleanup below can always reach them,
  // regardless of which render scheduled them.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
    setWaiting(false);
  }, []);

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const idToken = await user.getIdToken();
      return fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          ...(init.headers || {}),
        },
      });
    },
    [user],
  );

  const loadStatus = useCallback(async (): Promise<LinkStatus | null> => {
    try {
      const res = await authFetch("/api/telegram/link-status");
      if (!res.ok) return null;
      return (await res.json()) as LinkStatus;
    } catch {
      return null;
    }
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;

    loadStatus().then((next) => {
      if (cancelled) return;
      if (next) setStatus(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  // Always tear polling down when the card unmounts.
  useEffect(() => stopPolling, [stopPolling]);

  const startWatching = useCallback(() => {
    stopPolling();
    setWaiting(true);

    pollRef.current = setInterval(async () => {
      const next = await loadStatus();
      if (next?.linked) {
        setStatus(next);
        setDeepLink(null);
        setNotice("Telegram connected. You'll get order updates in the chat.");
        stopPolling();
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setNotice(null);
      setError(
        "We didn't see the connection complete. Open the link again, then press Start in Telegram.",
      );
    }, POLL_TIMEOUT_MS);
  }, [loadStatus, stopPolling]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const res = await authFetch("/api/telegram/link-code", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.deepLink) {
        setError(data?.error || "Could not start Telegram linking.");
        return;
      }

      setDeepLink(data.deepLink);
      // Opened rather than navigated so the customer keeps this page — it is
      // where the confirmation appears.
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      startWatching();
    } catch {
      setError("Could not start Telegram linking. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        "Disconnect Telegram? You'll stop receiving order notifications in the chat.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    stopPolling();

    try {
      const res = await authFetch("/api/telegram/unlink", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Could not disconnect Telegram.");
        return;
      }

      const next = await loadStatus();
      if (next) setStatus(next);
      setDeepLink(null);
      setNotice("Telegram disconnected.");
    } catch {
      setError("Could not disconnect Telegram. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const linkedLabel = status?.telegramUsername
    ? `@${status.telegramUsername}`
    : status?.telegramFirstName || "Telegram account";

  return (
    <div className="mt-5 overflow-hidden rounded-[2rem] border border-rose-100 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-pink-50 px-6 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80">
          <TelegramIcon className="h-5 w-5 text-[#229ED9]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
            Telegram Notifications
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">
            Connect our bot to get order updates, delivery alerts and offers in
            Telegram.
          </p>
        </div>
      </div>

      <div className="px-6 py-5">
        {loading ? (
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
            <span className="text-sm text-gray-500">Checking connection...</span>
          </div>
        ) : status?.telegramConfigured === false ? (
          <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            Telegram notifications aren&apos;t available right now. Please check
            back later.
          </p>
        ) : status?.linked ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  Connected
                </span>
                <p className="mt-1.5 truncate text-sm font-semibold text-gray-900">
                  {linkedLabel}
                </p>
                {status.linkedAt && (
                  <p className="text-xs text-gray-500">
                    Linked{" "}
                    {new Date(status.linkedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy}
                className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Working..." : "Disconnect"}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              Send /orders in the chat to track a purchase.
            </p>
          </>
        ) : (
          <>
            <ol className="space-y-2 text-xs text-gray-600">
              {[
                "Tap Connect Telegram below.",
                'Press "Start" in the chat that opens.',
                "Come back here — we'll confirm it worked.",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={handleConnect}
              disabled={busy || waiting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
            >
              <TelegramIcon className="h-4 w-4" />
              {busy
                ? "Preparing..."
                : waiting
                  ? "Waiting for Telegram..."
                  : "Connect Telegram"}
            </button>

            {waiting && (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3">
                <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                <div className="min-w-0 text-xs text-gray-600">
                  <p className="font-semibold text-gray-900">
                    Waiting for you to press Start in Telegram...
                  </p>
                  {deepLink && (
                    <p className="mt-1 break-all">
                      Didn&apos;t open?{" "}
                      <a
                        href={deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-rose-600 underline"
                      >
                        Open the link again
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {notice && (
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs font-medium text-emerald-800">
            {notice}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
