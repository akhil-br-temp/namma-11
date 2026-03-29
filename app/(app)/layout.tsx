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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-20 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Namma 11</p>
          <h1 className="text-lg font-bold text-slate-900">IPL Fantasy League</h1>
        </div>
        <SignOutButton />
      </header>
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
