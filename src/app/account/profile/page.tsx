"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";
import { TelegramLinkCard } from "../../../components/TelegramLinkCard";

export default function CustomerProfilePage() {
  const router = useRouter();
  const { user, profile, loading, updateCustomerProfile, logout } = useCustomerAuth();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login?redirect=/account/profile");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setPhone(profile.phone || "");
    setAddress(profile.address || "");
  }, [profile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateCustomerProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      setMessage("Profile updated successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/50 via-white to-white">
        <div className="mx-auto max-w-2xl px-4 py-10 md:py-14">
          <div className="h-4 w-40 animate-pulse rounded-full bg-rose-100/70" />
          <div className="mt-8 rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 animate-pulse rounded-full bg-rose-100/70" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded-full bg-rose-100/70" />
                <div className="h-3 w-44 animate-pulse rounded-full bg-gray-100" />
              </div>
            </div>
            <div className="mt-8 space-y-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" />
                  <div className="h-11 animate-pulse rounded-2xl bg-gray-100" />
                </div>
              ))}
              <div className="h-12 animate-pulse rounded-full bg-rose-100/70" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const initial = (displayName || profile?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-rose-50/50 via-white to-white">
      {/* Soft decorative blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-rose-200/25 blur-3xl" />
        <div className="absolute top-1/2 -left-24 h-72 w-72 rounded-full bg-pink-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-8 md:py-12">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-xs md:text-sm text-gray-500"
        >
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-rose-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0 6-6m-6 6 6 6" />
            </svg>
            Back
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-900">My Profile</span>
        </nav>

        {/* Profile card */}
        <div className="overflow-hidden rounded-[2rem] border border-rose-100 bg-white shadow-sm">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-rose-100/80 via-pink-50 to-white px-6 pb-6 pt-7 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-2xl font-bold text-white shadow-lg ring-4 ring-white">
              {initial}
            </div>

            <h1 className="mt-4 text-xl md:text-2xl font-semibold tracking-tight text-gray-900">
              {displayName || "Hello there!"}
            </h1>
            <p className="mt-1 text-xs md:text-sm text-gray-500">{profile?.email}</p>

            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-rose-600 backdrop-blur">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2l1.9 5.8H20l-4.7 3.4 1.8 5.8L12 13.6 6.9 17l1.8-5.8L4 7.8h6.1L12 2z" />
              </svg>
              Member Profile
            </span>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-5 px-6 pb-7 pt-6">
            <p className="text-center text-xs text-gray-500">
              Keep your details up to date so your orders arrive safely.
            </p>

            <div>
              <label
                htmlFor="profile-email"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                <svg className="h-3.5 w-3.5 text-rose-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
                </svg>
                Email
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-gray-500">
                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4" />
                  </svg>
                  Locked
                </span>
              </label>
              <input
                id="profile-email"
                value={profile?.email || ""}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
              />
            </div>

            <div>
              <label
                htmlFor="profile-name"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                <svg className="h-3.5 w-3.5 text-rose-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Display Name
              </label>
              <input
                id="profile-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <div>
              <label
                htmlFor="profile-phone"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                <svg className="h-3.5 w-3.5 text-rose-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h2.2a1 1 0 01.95.68l1.1 3.2a1 1 0 01-.27 1.05L7.5 9.5a11 11 0 007 7l1.57-1.48a1 1 0 011.05-.27l3.2 1.1a1 1 0 01.68.95V19a2 2 0 01-2 2h-1A16 16 0 013 6V5z" />
                </svg>
                Phone
              </label>
              <input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xx xxx xxx"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <div>
              <label
                htmlFor="profile-address"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                <svg className="h-3.5 w-3.5 text-rose-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                Address
              </label>
              <textarea
                id="profile-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder="Where should we deliver your order?"
                className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            {message && (
              <p className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-2.5 text-xs font-medium text-gray-700">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l1.9 5.8H20l-4.7 3.4 1.8 5.8L12 13.6 6.9 17l1.8-5.8L4 7.8h6.1L12 2z" />
                </svg>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Link
                href="/account/purchases"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13 5.4 5M7 13l-.7 3.5h11.4M9 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                </svg>
                Purchase History
              </Link>

              <button
                type="button"
                onClick={() => logout()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-500 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5m5 5H9m0-7H6a2 2 0 00-2 2v10a2 2 0 002 2h3" />
                </svg>
                Logout
              </button>
            </div>
          </form>
        </div>

        {/* Notification channels. Email always works from the address above;
            Telegram needs the customer to connect the bot themselves. */}
        <TelegramLinkCard user={user} />

        <p className="mt-5 text-center text-[11px] text-gray-400">
          Your details are only used for your orders.
        </p>
      </div>
    </div>
  );
}
