import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { ManualSyncButton } from "@/components/matches/manual-sync-button";
import { getTeamLogo } from "@/lib/utils";
import { getSeedSquadCountForTeams } from "@/lib/data/seed-squads";

type Team = { name: string; short_name: string };

type MatchRow = {
  id: string;
  match_date: string;
  status: string;
  team_a: Team | null;
  team_b: Team | null;
};

function statusStyle(status: string): string {
  if (status === "live") {
    return "bg-rose-500/20 text-rose-400";
  }
  if (status === "completed") {
    return "bg-zinc-700 text-zinc-200";
  }
  return "bg-zinc-800 text-zinc-200";
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

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-zinc-50">Upcoming IPL Matches</h2>
      </div>
      <ManualSyncButton />
      {matches.length === 0 ? <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">No fixtures synced yet. Run sync to load matches.</p> : null}
      {matches.map((match) => {
        const squadCount = getSeedSquadCountForTeams(match.team_a, match.team_b);
        return (
          <Link
            key={match.id}
            href={`/match/${match.id}`}
            className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-zinc-700"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-1 items-center justify-between gap-2 mr-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 rounded-full bg-zinc-800 p-1">
                    <Image
                      src={getTeamLogo(match.team_a?.short_name)}
                      alt={match.team_a?.name ?? "Team A"}
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                  <span className="font-bold text-zinc-50">{match.team_a?.short_name ?? "T1"}</span>
                </div>

                <span className="text-[10px] font-black tracking-widest text-zinc-500">VS</span>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-zinc-50">{match.team_b?.short_name ?? "T2"}</span>
                  <div className="relative h-10 w-10 rounded-full bg-zinc-800 p-1">
                    <Image
                      src={getTeamLogo(match.team_b?.short_name)}
                      alt={match.team_b?.name ?? "Team B"}
                      fill
                      className="object-contain p-1"
                    />
                  </div>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(match.status)}`}>
                {match.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{formatMatchTime(match.match_date)} IST</p>
            <p className="mt-1 text-xs text-zinc-400">Seed squad players: {squadCount}</p>
          </Link>
        );
      })}
    </section>
  );
}
