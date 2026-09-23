"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, signInWithGoogle, error } = useCustomerAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirect") || "/account/profile";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.push(redirectTo);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogleSignIn = async () => {
    setLocalError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      router.push(redirectTo);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Google login failed");
    } finally {
      setGoogleSubmitting(false);
    }
  };

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
                d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z"
              />
            </svg>
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-500">
            Customer Login
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Login to checkout and view your purchase history.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-7 space-y-4 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm md:p-7"
        >
          <div>
            <label
              htmlFor="login-email"
              className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 w-full rounded-full border border-rose-200 bg-rose-50/40 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5 w-full rounded-full border border-rose-200 bg-rose-50/40 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          {(localError || error) && (
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
              {localError || error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
          >
            {submitting ? "Signing in..." : "Login"}
          </button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-rose-100" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              or
            </span>
            <span className="h-px flex-1 bg-rose-100" />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={googleSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-all hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
              />
            </svg>
            {googleSubmitting ? "Connecting Google..." : "Continue with Google"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          New customer?{" "}
          <Link
            href="/auth/register"
            className="font-semibold text-rose-600 hover:text-rose-700"
          >
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
