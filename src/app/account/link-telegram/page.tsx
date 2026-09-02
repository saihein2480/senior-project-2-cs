"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useCustomerAuth } from "../../../contexts/CustomerAuthContext";

function LinkTelegramContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useCustomerAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const linkAccount = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Invalid link token. Please try again from Telegram.");
        return;
      }

      if (authLoading) {
        return; // Wait for auth to load
      }

      if (!user) {
        // Redirect to login with return URL
        const returnUrl = `/account/link-telegram?token=${token}`;
        router.push(`/account/login?returnUrl=${encodeURIComponent(returnUrl)}`);
        return;
      }

      try {
        // Call API to link Telegram account
        const response = await fetch("/api/telegram/link-account", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            customerId: user.uid,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setStatus("success");
          setMessage("Your Telegram account has been linked successfully!");

          // Redirect to profile after 3 seconds
          setTimeout(() => {
            router.push("/account/profile");
          }, 3000);
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to link account. Please try again.");
        }
      } catch (error) {
        console.error("Link error:", error);
        setStatus("error");
        setMessage("An error occurred. Please try again.");
      }
    };

    linkAccount();
  }, [searchParams, user, authLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {status === "loading" && (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Linking Your Account
            </h2>
            <p className="text-gray-600">
              Please wait while we connect your Telegram account...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Successfully Linked!
            </h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">
              You can now receive order updates and notifications via Telegram.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Redirecting to your profile...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Link Failed
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push("/account/profile")}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
              >
                Go to Profile
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center text-sm text-gray-500">
            <svg
              className="w-5 h-5 mr-2 text-blue-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.717-.962 3.93-1.362 5.214-.168.545-.505.727-.826.745-.703.064-1.237-.464-1.918-.909-1.067-.696-1.669-1.128-2.702-1.806-.996-.671-.345-1.04.226-1.644.149-.158 2.743-2.513 2.793-2.724.006-.027.013-.124-.046-.175-.059-.051-.146-.034-.209-.02-.089.02-1.517.964-4.279 2.831-.405.278-.772.413-1.101.406-.363-.008-1.061-.205-1.579-.374-.635-.206-1.14-.316-1.097-.666.022-.183.279-.37.772-.562 3.024-1.316 5.04-2.183 6.049-2.6 2.881-1.202 3.481-1.411 3.871-1.418.086-.001.278.02.402.121.105.085.134.2.148.281.013.08.03.263.017.407z" />
            </svg>
            <span>Telegram Integration</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LinkTelegramPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    }>
      <LinkTelegramContent />
    </Suspense>
  );
}
