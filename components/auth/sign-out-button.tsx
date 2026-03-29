"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
