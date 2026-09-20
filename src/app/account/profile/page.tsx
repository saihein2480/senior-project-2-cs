"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";

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
    return <div className="mx-auto max-w-3xl px-4 py-12 text-gray-600">Loading account...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-900">My Profile</h1>
      <p className="mt-2 text-sm text-gray-600">Manage your customer information used in online orders.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700">Email</label>
          <input id="profile-email" value={profile?.email || ""} disabled className="mt-1 w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-gray-700" />
        </div>

        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700">Display Name</label>
          <input id="profile-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" />
        </div>

        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700">Phone</label>
          <input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" />
        </div>

        <div>
          <label htmlFor="profile-address" className="block text-sm font-medium text-gray-700">Address</label>
          <textarea id="profile-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" />
        </div>

        {message && <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{message}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-4 py-2 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save Profile"}
          </button>

          <Link href="/account/purchases" className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">
            View Purchase History
          </Link>

          <button type="button" onClick={() => logout()} className="rounded-md border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50">
            Logout
          </button>
        </div>
      </form>
    </div>
  );
}
