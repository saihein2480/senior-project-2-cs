"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    profile,
    loading,
    isEmailVerified,
    sendVerificationEmail,
    confirmEmailCode,
    logout,
  } = useCustomerAuth();

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const redirectTo = searchParams.get("redirect") || "/account/profile";

  // Anonymous visitors have nothing to verify; send them to login.
  useEffect(() => {
    if (!loading && !user) {
      router.push(
        `/auth/login?redirect=${encodeURIComponent(`/auth/verify-email?redirect=${redirectTo}`)}`,
      );
    }
  }, [loading, user, router, redirectTo]);

  // Already verified (e.g. arrived via Google sign-in) — nothing to do here.
  useEffect(() => {
    if (!loading && user && isEmailVerified) {
      router.push(redirectTo);
    }
  }, [loading, user, isEmailVerified, router, redirectTo]);

  // Registration already triggered the first send, so start on cooldown and
  // tick down to enable "Resend".
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setNotice(null);

    if (code.length !== 6) {
      setLocalError("Enter the 6-digit code from your email.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmEmailCode(code);
      router.push(redirectTo);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Verification failed",
      );
      setCode("");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setLocalError(null);
    setNotice(null);
    setResending(true);
    try {
      const result = await sendVerificationEmail();
      if (result.alreadyVerified) {
        router.push(redirectTo);
        return;
      }
      setNotice(
        `We sent a new code to ${result.email || "your email"}. It expires in ${result.expiryMinutes ?? 15} minutes.`,
      );
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not send a new code",
      );
    } finally {
      setResending(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white">
        <div className="mx-auto flex max-w-md items-center justify-center px-4 py-20">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-rose-200 border-t-rose-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white px-4 py-12 md:py-16">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="text-center">
          <span className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg shadow-rose-500/25">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.9 5.3a2 2 0 0 0 2.2 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z"
              />
            </svg>
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
            Verify your email
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            We sent a 6-digit code to{" "}
            <span className="font-semibold text-gray-700">
              {profile?.email || user.email}
            </span>
            . Enter it below to activate your account.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-7 space-y-4 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm md:p-7"
        >
          <div>
            <label
              htmlFor="verification-code"
              className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400"
            >
              Verification Code
            </label>
            <input
              id="verification-code"
              ref={inputRef}
              value={code}
              // Keep only digits so a pasted "123 456" still works, and cap at 6.
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-describedby="verification-code-hint"
              className="mt-1.5 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.5em] text-gray-900 placeholder:text-gray-300 transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
            <p
              id="verification-code-hint"
              className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-rose-400" />
              The code expires 15 minutes after it is sent.
            </p>
          </div>

          {notice && (
            <p className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700">
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              {notice}
            </p>
          )}

          {localError && (
            <p className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              {localError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            {submitting ? "Verifying..." : "Verify Email"}
          </button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-rose-100" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Didn&apos;t get it?
            </span>
            <span className="h-px flex-1 bg-rose-100" />
          </div>

          <button
            type="button"
            onClick={onResend}
            disabled={resending || cooldown > 0}
            className="w-full rounded-full border-2 border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {resending
              ? "Sending..."
              : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : "Resend code"}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-gray-500">
          <span>Wrong address?</span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push("/auth/register");
            }}
            className="font-semibold text-rose-600 hover:text-rose-700"
          >
            Register again
          </button>
          <span className="text-gray-300">|</span>
          <Link
            href="/"
            className="font-semibold text-rose-600 hover:text-rose-700"
          >
            Back to shop
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-rose-50/40 via-white to-white" />
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
