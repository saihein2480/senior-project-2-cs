"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { register, signInWithGoogle, error } = useCustomerAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });
      router.push("/account/profile");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogleSignIn = async () => {
    setLocalError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      router.push("/account/profile");
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Google sign-in failed",
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-900">
        Create Customer Account
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Register once and use online checkout with purchase tracking.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="register-name"
            className="block text-sm font-medium text-gray-700"
          >
            Full Name
          </label>
          <input
            id="register-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="register-email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="register-password"
            className="block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="register-confirm-password"
            className="block text-sm font-medium text-gray-700"
          >
            Confirm Password
          </label>
          <input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
          />
        </div>

        {(localError || error) && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError || error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-4 py-2 text-white transition disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Register"}
        </button>

        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={googleSubmitting}
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {googleSubmitting ? "Connecting Google..." : "Continue with Google"}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-medium text-rose-600 hover:text-rose-700"
        >
          Login here
        </Link>
      </p>
    </div>
  );
}
