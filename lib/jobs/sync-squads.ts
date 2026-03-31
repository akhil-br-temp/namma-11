import { createAdminClient } from "@/lib/supabase/admin";

type MatchRow = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  match_date: string;
  status: "upcoming" | "lineup_announced" | "live" | "completed";
};

type PlayerRow = {
  id: string;
  ipl_team_id: string | null;
};

function isWithinSyncWindow(matchDateIso: string, now: number): boolean {
  const matchTs = new Date(matchDateIso).getTime();
  if (!Number.isFinite(matchTs)) {
    return false;
  }

  const lookbackMs = 45 * 24 * 60 * 60 * 1000;
  const lookaheadMs = 120 * 24 * 60 * 60 * 1000;
  return matchTs >= now - lookbackMs && matchTs <= now + lookaheadMs;
}

export async function runSquadSync() {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: matches, error: matchesError } = await admin
    .from("matches")
    .select("id, team_a_id, team_b_id, match_date, status")
    .in("status", ["upcoming", "lineup_announced", "live", "completed"])
    .order("match_date", { ascending: true })
    .limit(200);

  if (matchesError) {
    throw matchesError;
  }

  const windowMatches = ((matches ?? []) as MatchRow[]).filter((match) => isWithinSyncWindow(match.match_date, now));

  const teamIds = Array.from(
    new Set(
      windowMatches
        .flatMap((match) => [match.team_a_id, match.team_b_id])
        .filter((teamId): teamId is string => Boolean(teamId))
    )
  );

  if (teamIds.length === 0) {
    return {
      scannedMatches: windowMatches.length,
      syncedMatches: 0,
      upsertedPlayers: 0,
      promotedSeededPlayers: 0,
      upsertedMatchPlayers: 0,
      preloadedMatches: 0,
      preloadedMatchPlayers: 0,
    };
  }

  const { data: playersByTeam, error: playersByTeamError } = await admin
    .from("players")
    .select("id, ipl_team_id")
    .in("ipl_team_id", teamIds);

  if (playersByTeamError) {
    throw playersByTeamError;
  }

  const rosterByTeamId = new Map<string, string[]>();
  ((playersByTeam ?? []) as PlayerRow[]).forEach((player) => {
    if (!player.ipl_team_id) {
      return;
    }

    const current = rosterByTeamId.get(player.ipl_team_id) ?? [];
    current.push(player.id);
    rosterByTeamId.set(player.ipl_team_id, current);
  });

  let syncedMatches = 0;
  let upsertedMatchPlayers = 0;
  let preloadedMatches = 0;
  let preloadedMatchPlayers = 0;

  for (const match of windowMatches) {
    const playerIds = Array.from(
      new Set([...(rosterByTeamId.get(match.team_a_id) ?? []), ...(rosterByTeamId.get(match.team_b_id) ?? [])])
    );

    if (playerIds.length === 0) {
      continue;
    }

    const rows = playerIds.map((playerId) => ({
      match_id: match.id,
      player_id: playerId,
      is_playing: false,
      is_impact_player: false,
      is_concussion_substitute: false,
    }));

    const { error: upsertError } = await admin
      .from("match_players")
      .upsert(rows, { onConflict: "match_id,player_id", ignoreDuplicates: true });

    if (upsertError) {
      throw upsertError;
    }

    syncedMatches += 1;
    upsertedMatchPlayers += rows.length;

    if (match.status === "upcoming" || match.status === "lineup_announced" || match.status === "live") {
      preloadedMatches += 1;
      preloadedMatchPlayers += rows.length;
    }
  }

  return {
    scannedMatches: windowMatches.length,
    syncedMatches,
    upsertedPlayers: 0,
    promotedSeededPlayers: 0,
    upsertedMatchPlayers,
    preloadedMatches,
    preloadedMatchPlayers,
  };
}
