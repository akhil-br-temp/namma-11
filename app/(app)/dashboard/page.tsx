import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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
      <article className="overflow-hidden rounded-2xl border border-red-500/35 bg-gradient-to-br from-red-700 via-red-600 to-red-800 p-4 text-white shadow-[0_16px_40px_rgba(127,29,29,0.45)]">
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
      </article>

      <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Quick actions</h3>
        <div className="mt-3 grid gap-2">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-red-500/40 hover:bg-zinc-900">
              {action.label}
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
