import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamBuilder } from "@/components/match/team-builder";
import { LiveScoreStrip } from "@/components/match/live-score-strip";

type MatchPageProps = {
  params: Promise<{ id: string }>;
};

type SquadPlayer = {
  id: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  teamShortName: string;
  isOverseas: boolean;
};

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function getLeagueName(value: unknown): string {
  if (Array.isArray(value)) {
    return (value[0] as { name?: string } | undefined)?.name ?? "Unnamed League";
  }

  return (value as { name?: string } | null)?.name ?? "Unnamed League";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: leagueMemberships } = await supabase
    .from("league_members")
    .select("league_id, leagues(name)")
    .eq("user_id", user?.id ?? "")
    .order("joined_at", { ascending: false });

  const leagueOptions = (leagueMemberships ?? []).map((entry) => ({
    id: entry.league_id,
    name: getLeagueName(entry.leagues),
  }));

  const { data: match } = await supabase.from("matches").select("id, team_a_id, team_b_id").eq("id", id).maybeSingle();

  const { data: matchPlayers } = await supabase
    .from("match_players")
    .select("player:players(id, name, role, is_overseas, team:ipl_teams!players_ipl_team_id_fkey(short_name))")
    .eq("match_id", id);

  let squadPlayers: SquadPlayer[] = [];

  if ((matchPlayers ?? []).length > 0) {
    squadPlayers = (matchPlayers ?? [])
      .map((entry) => {
        const player = firstObject(entry.player);
        const team = firstObject(player?.team);
        if (!player) return null;

        return {
          id: player.id,
          name: player.name,
          role: player.role,
          teamShortName: team?.short_name ?? "TBD",
          isOverseas: player.is_overseas,
        };
      })
      .filter((player): player is NonNullable<typeof player> => player !== null);
  } else if (match) {
    const { data: fallbackPlayers } = await supabase
      .from("players")
      .select("id, name, role, is_overseas, team:ipl_teams!players_ipl_team_id_fkey(short_name)")
      .in("ipl_team_id", [match.team_a_id, match.team_b_id]);

    squadPlayers = (fallbackPlayers ?? []).map((player) => {
      const team = firstObject(player.team);
      return {
        id: player.id,
        name: player.name,
        role: player.role,
        teamShortName: team?.short_name ?? "TBD",
        isOverseas: player.is_overseas,
      };
    });
  }

  const squadGroups = Array.from(
    squadPlayers.reduce((grouped, player) => {
      const teamKey = player.teamShortName || "TBD";
      const existing = grouped.get(teamKey) ?? [];
      existing.push(player);
      grouped.set(teamKey, existing);
      return grouped;
    }, new Map<string, SquadPlayer[]>())
  );

  return (
    <section className="space-y-3">
      <LiveScoreStrip matchId={id} />

      {leagueOptions.length === 0 ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-lg font-bold text-zinc-50">Team Builder</h2>
          <p className="mt-2 text-sm text-zinc-300">Join or create a league before creating your fantasy team.</p>
        </article>
      ) : (
        <TeamBuilder matchId={id} leagueOptions={leagueOptions} />
      )}

      <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Match Squad</h3>
        {squadPlayers.length === 0 ? <p className="mt-2 text-sm text-zinc-300">Squad not synced yet. Run sync from the matches page.</p> : null}
        {squadPlayers.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {squadGroups.map(([teamShortName, players]) => (
              <div key={teamShortName} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                <h4 className="text-sm font-bold text-zinc-50">{teamShortName}</h4>
                <div className="mt-2 space-y-2">
                  {players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-200">
                          {getInitials(player.name)}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-50">{player.name}</p>
                          <p className="text-xs text-zinc-300">
                            {player.role}
                            {player.isOverseas ? " • Overseas" : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </article>

      <Link href={`/match/${id}/live`} className="inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
        Open Live Tracker
      </Link>
    </section>
  );
}
