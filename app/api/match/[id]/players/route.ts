import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IPL_2026_SQUADS } from "@/lib/data/ipl-2026-squads";
import { runIplSquadSeed } from "@/lib/jobs/seed-ipl-squads";

type MatchParams = {
  params: Promise<{ id: string }>;
};

type TeamInfo = {
  id: string;
  name: string;
  short_name: string;
};

type TeamSummary = Pick<TeamInfo, "name" | "short_name">;

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlayerName(value: string): string {
  return normalizeKey(value);
}

function findSeedTeam(teamName: string, teamShortName: string) {
  const normalizedName = normalizeKey(teamName);
  const normalizedShortName = normalizeKey(teamShortName);

  if (!normalizedName && !normalizedShortName) {
    return null;
  }

  return (
    IPL_2026_SQUADS.find((team) => {
      const seedName = normalizeKey(team.name);
      const seedShortName = normalizeKey(team.shortName);

      return (
        (normalizedName && (normalizedName === seedName || normalizedName === seedShortName)) ||
        (normalizedShortName && (normalizedShortName === seedName || normalizedShortName === seedShortName))
      );
    }) ?? null
  );
}

function getMatchTeams(matchRow: {
  team_a_id: string;
  team_b_id: string;
  team_a?: TeamInfo | TeamInfo[] | null;
  team_b?: TeamInfo | TeamInfo[] | null;
}): TeamInfo[] {
  const teams: TeamInfo[] = [];
  const teamA = firstObject(matchRow.team_a);
  const teamB = firstObject(matchRow.team_b);

  if (teamA) {
    teams.push({
      id: teamA.id || matchRow.team_a_id,
      name: teamA.name,
      short_name: teamA.short_name,
    });
  }

  if (teamB) {
    teams.push({
      id: teamB.id || matchRow.team_b_id,
      name: teamB.name,
      short_name: teamB.short_name,
    });
  }

  return teams;
}

function buildSeedRosterLookup(matchTeams: TeamInfo[]): Map<string, Set<string>> {
  const seedRosterByTeamId = new Map<string, Set<string>>();

  matchTeams.forEach((team) => {
    const seedTeam = findSeedTeam(team.name, team.short_name);
    if (!seedTeam) {
      return;
    }

    seedRosterByTeamId.set(
      team.id,
      new Set(seedTeam.players.map((player) => normalizePlayerName(player.name)).filter((name) => name.length > 0))
    );
  });

  return seedRosterByTeamId;
}

function inferTeamFromSeedRoster(
  playerName: string,
  matchTeams: TeamInfo[],
  seedRosterByTeamId: Map<string, Set<string>>
): TeamSummary | null {
  const normalizedName = normalizePlayerName(playerName);
  if (!normalizedName) {
    return null;
  }

  const candidates = matchTeams.filter((team) => seedRosterByTeamId.get(team.id)?.has(normalizedName));
  if (candidates.length !== 1) {
    return null;
  }

  return {
    name: candidates[0].name,
    short_name: candidates[0].short_name,
  };
}

export async function GET(_: Request, { params }: MatchParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, team_a_id, team_b_id, match_date, status, team_lock_time, team_a:ipl_teams!matches_team_a_id_fkey(id, name, short_name), team_b:ipl_teams!matches_team_b_id_fkey(id, name, short_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const matchTeams = getMatchTeams(matchRow);
  const seedRosterByTeamId = buildSeedRosterLookup(matchTeams);

  const { data: matchPlayers, error: matchPlayersError } = await supabase
    .from("match_players")
    .select(
      "is_playing, is_impact_player, is_concussion_substitute, fantasy_points, player:players(id, name, role, credit_value, is_overseas, photo_url, ipl_team_id, team:ipl_teams!players_ipl_team_id_fkey(name, short_name))"
    )
    .eq("match_id", id);

  if (matchPlayersError) {
    return NextResponse.json({ error: matchPlayersError.message }, { status: 500 });
  }

  if ((matchPlayers ?? []).length > 0) {
    const normalized = (matchPlayers ?? [])
      .map((entry) => {
        const player = firstObject(entry.player);
        const team = firstObject(player?.team) ?? inferTeamFromSeedRoster(player?.name ?? "", matchTeams, seedRosterByTeamId);

        if (!player) {
          return null;
        }

        return {
          id: player.id,
          name: player.name,
          role: player.role,
          creditValue: player.credit_value,
          isOverseas: player.is_overseas,
          photoUrl: player.photo_url,
          team,
          isPlaying: entry.is_playing,
          isImpactPlayer: entry.is_impact_player,
          isConcussionSubstitute: entry.is_concussion_substitute,
          fantasyPoints: entry.fantasy_points,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return NextResponse.json({ match: matchRow, players: normalized });
  }

  const loadFallbackPlayers = async () =>
    supabase
      .from("players")
      .select("id, name, role, credit_value, is_overseas, photo_url, team:ipl_teams!players_ipl_team_id_fkey(name, short_name)")
      .in("ipl_team_id", [matchRow.team_a_id, matchRow.team_b_id]);

  const { data: fallbackPlayers, error: fallbackError } = await loadFallbackPlayers();

  if (fallbackError) {
    return NextResponse.json({ error: fallbackError.message }, { status: 500 });
  }

  let resolvedFallbackPlayers = fallbackPlayers ?? [];

  if (resolvedFallbackPlayers.length === 0) {
    await runIplSquadSeed().catch(() => null);

    const { data: seededFallbackPlayers, error: seededFallbackError } = await loadFallbackPlayers();
    if (seededFallbackError) {
      return NextResponse.json({ error: seededFallbackError.message }, { status: 500 });
    }

    resolvedFallbackPlayers = seededFallbackPlayers ?? [];
  }

  const normalizedFallback = resolvedFallbackPlayers.map((entry) => ({
    id: entry.id,
    name: entry.name,
    role: entry.role,
    creditValue: entry.credit_value,
    isOverseas: entry.is_overseas,
    photoUrl: entry.photo_url,
    team: firstObject(entry.team),
    isPlaying: false,
    isImpactPlayer: false,
    isConcussionSubstitute: false,
    fantasyPoints: 0,
  }));

  return NextResponse.json({ match: matchRow, players: normalizedFallback });
}
