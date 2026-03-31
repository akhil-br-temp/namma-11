import { redirect } from "next/navigation";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/90 px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-400">Namma 11</p>
          <h1 className="display-heading text-xl font-bold leading-none text-zinc-50">IPL Fantasy League</h1>
        </div>
        <SignOutButton />
      </header>
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
