"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Preserve query parameters (branch, currency)
    const branch = searchParams?.get("branch");
    const currency = searchParams?.get("currency");
    
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (currency) params.set("currency", currency);
    
    const queryString = params.toString();
    const redirectUrl = queryString 
      ? `/account/profile?${queryString}` 
      : "/account/profile";
    
    router.replace(redirectUrl);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
    </div>
  );
}
