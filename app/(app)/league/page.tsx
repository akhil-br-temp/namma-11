import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type LeagueSummary = {
  league_id: string;
  leagues: {
    name: string;
    invite_code: string;
  } | null;
};

export default async function LeagueHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("league_members")
    .select("league_id, leagues(name, invite_code)")
    .eq("user_id", user?.id ?? "")
    .order("joined_at", { ascending: false })
    .limit(20);

  const leagues = (data ?? []) as unknown as LeagueSummary[];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900">Private Leagues</h2>
      <p className="text-sm text-slate-600">Create a league for your friends or join using an invite code.</p>
      <div className="grid gap-2">
        <Link href="/league/create" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Create League
        </Link>
        <Link href="/league/join" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Join League
        </Link>
      </div>

      <div className="space-y-2 pt-1">
        {leagues.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">You have not joined any leagues yet.</p> : null}
        {leagues.map((entry) => (
          <Link
            key={entry.league_id}
            href={`/league/${entry.league_id}`}
            className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300"
          >
            <p className="font-semibold text-slate-900">{entry.leagues?.name ?? "Unnamed League"}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Invite code: {entry.leagues?.invite_code ?? "-"}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
