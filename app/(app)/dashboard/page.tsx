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
      <article className="rounded-2xl bg-teal-700 p-4 text-teal-50">
        <h2 className="text-xl font-bold">Welcome to Namma 11</h2>
        <p className="mt-1 text-sm text-teal-100">Private leagues, live IPL points, and captain multipliers built for friends.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl bg-teal-800/60 p-2">
            <p className="text-teal-100">My Leagues</p>
            <p className="text-base font-bold text-white">{leagueCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-teal-800/60 p-2">
            <p className="text-teal-100">Upcoming Matches</p>
            <p className="text-base font-bold text-white">{upcomingCount ?? 0}</p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quick actions</h3>
        <div className="mt-3 grid gap-2">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              {action.label}
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
