import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { ManualSyncButton } from "@/components/matches/manual-sync-button";
import { getTeamLogo } from "@/lib/utils";

type Team = { name: string; short_name: string };

type MatchRow = {
  id: string;
  match_date: string;
  status: string;
  team_a: Team | null;
  team_b: Team | null;
};

type MatchPlayerRow = {
  match_id: string;
};

function statusStyle(status: string): string {
  if (status === "live") {
    return "bg-rose-100 text-rose-700";
  }
  if (status === "completed") {
    return "bg-slate-200 text-slate-700";
  }
  return "bg-sky-100 text-sky-800";
}

function formatMatchTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default async function MatchesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id, match_date, status, team_a:ipl_teams!matches_team_a_id_fkey(name, short_name), team_b:ipl_teams!matches_team_b_id_fkey(name, short_name)")
    .order("match_date", { ascending: true })
    .limit(30);

  const matches = (data ?? []) as unknown as MatchRow[];
  const matchIds = matches.map((match) => match.id);

  let squadCoverage = new Map<string, number>();

  if (matchIds.length > 0) {
    const { data: matchPlayers } = await supabase.from("match_players").select("match_id").in("match_id", matchIds);

    const counts = new Map<string, number>();
    ((matchPlayers ?? []) as MatchPlayerRow[]).forEach((row) => {
      counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1);
    });
    squadCoverage = counts;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Upcoming IPL Matches</h2>
      </div>
      <ManualSyncButton />
      {matches.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No fixtures synced yet. Run sync to load matches.</p> : null}
      {matches.map((match) => {
        const squadCount = squadCoverage.get(match.id) ?? 0;
        return (
          <Link
            key={match.id}
            href={`/match/${match.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center -space-x-2">
                  <div className="relative h-8 w-8 rounded-full border-2 border-white bg-slate-100 p-1">
                    <Image
                      src={getTeamLogo(match.team_a?.short_name)}
                      alt={match.team_a?.name ?? "Team A"}
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                  <div className="relative h-8 w-8 rounded-full border-2 border-white bg-slate-100 p-1">
                    <Image
                      src={getTeamLogo(match.team_b?.short_name)}
                      alt={match.team_b?.name ?? "Team B"}
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                </div>
                <h3 className="font-semibold text-slate-900">
                  {match.team_a?.short_name ?? "T1"} vs {match.team_b?.short_name ?? "T2"}
                </h3>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(match.status)}`}>
                {match.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{formatMatchTime(match.match_date)} IST</p>
            <p className="mt-1 text-xs text-slate-500">Squad records: {squadCount}</p>
          </Link>
        );
      })}
    </section>
  );
}
