import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { D11Surface, d11ActionClass } from "@/components/ui/d11-primitives";
import { cn } from "@/lib/utils";

const quickActions = [
  { href: "/league/create", label: "Create League" },
  { href: "/league/join", label: "Join League" },
  { href: "/matches", label: "View Matches" },
];

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ count: leagueCount }, { count: upcomingCount }] = await Promise.all([
    supabase
      .from("league_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user?.id ?? ""),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("status", ["upcoming", "lineup_announced"]),
  ]);

  return (
    <section className="space-y-4">
      <D11Surface tone="hero" className="overflow-hidden p-4 text-white">
        <h2 className="display-heading text-2xl font-bold">Welcome to Namma 11</h2>
        <p className="mt-1 text-sm text-red-100">Private leagues, live IPL points, and captain multipliers built for friends.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl border border-white/15 bg-black/20 p-2">
            <p className="text-red-100">My Leagues</p>
            <p className="text-base font-bold text-white">{leagueCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/20 p-2">
            <p className="text-red-100">Upcoming Matches</p>
            <p className="text-base font-bold text-white">{upcomingCount ?? 0}</p>
          </div>
        </div>
      </D11Surface>

      <D11Surface className="p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Quick actions</h3>
        <div className="mt-3 grid gap-2">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href} className={cn(d11ActionClass("secondary"), "justify-start")}>
              {action.label}
            </Link>
          ))}
        </div>
      </D11Surface>
    </section>
  );
}
