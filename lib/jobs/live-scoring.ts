import { createAdminClient } from "@/lib/supabase/admin";
import { getMatchScorecardForScoring } from "@/lib/cricket-api/scorecard-adapter";

type Dictionary = Record<string, unknown>;

type MatchRow = {
  id: string;
  api_match_id: string;
  status: "upcoming" | "lineup_announced" | "live" | "completed";
  match_date: string;
  team_a: { name: string; short_name: string } | { name: string; short_name: string }[] | null;
  team_b: { name: string; short_name: string } | { name: string; short_name: string }[] | null;
};

type MatchPlayerRow = {
  player_id: string;
  is_playing: boolean;
  player: { id: string; name: string; api_player_id: string } | { id: string; name: string; api_player_id: string }[] | null;
};

type FantasyTeamRow = {
  id: string;
  league_id: string;
  user_id: string;
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
};

type TeamPlayerJoin = {
  fantasy_team_id: string;
  player_id: string;
};

type LeaderboardRow = {
  id: string;
  fantasy_team_id: string;
  total_points: number;
};

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumberSafe(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function readScorecardRows(payload: unknown): Dictionary[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Dictionary;
  const data = (root.data as Dictionary | undefined) ?? root;

  if (Array.isArray(data.scorecard)) {
    return data.scorecard.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }

  if (Array.isArray(data.scoreCard)) {
    return data.scoreCard.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }

  if (Array.isArray(data.innings)) {
    return data.innings.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }

  return [];
}

function readBattingRows(innings: Dictionary): Dictionary[] {
  const candidates: unknown[] = [innings.batting, innings.batsman, innings.batters, innings.battingStats];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
    }
  }
  return [];
}

function readBowlingRows(innings: Dictionary): Dictionary[] {
  const candidates: unknown[] = [innings.bowling, innings.bowlers, innings.bowlingStats];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
    }
  }
  return [];
}

function playerNameFromStat(row: Dictionary): string {
  return (
    toStringSafe(row.name) ||
    toStringSafe(row.playerName) ||
    toStringSafe(row.batsmanName) ||
    toStringSafe(row.bowlerName) ||
    toStringSafe(row.player) ||
    toStringSafe((row.batsman as Dictionary | undefined)?.name) ||
    toStringSafe((row.bowler as Dictionary | undefined)?.name)
  );
}

function computeBattingPoints(row: Dictionary): { total: number; breakdown: Dictionary } {
  const runs = toNumberSafe(row.r ?? row.runs ?? row.run);
  const balls = toNumberSafe(row.b ?? row.balls);
  const fours = toNumberSafe(row["4s"] ?? row.fours);
  const sixes = toNumberSafe(row["6s"] ?? row.sixes);
  const strikeRate = toNumberSafe(row.sr ?? row.strikeRate);
  const dismissal = toStringSafe(row.dismissal ?? row.outDesc ?? row.wicketText).toLowerCase();
  const out = dismissal !== "" && !dismissal.includes("not out");

  let points = 0;
  points += runs;
  points += fours;
  points += sixes * 2;

  if (runs >= 100) {
    points += 16;
  } else if (runs >= 50) {
    points += 8;
  }

  if (out && runs === 0 && balls > 0) {
    points -= 2;
  }

  if (balls >= 10) {
    if (strikeRate < 70) points -= 6;
    else if (strikeRate < 80) points -= 4;
    else if (strikeRate < 100) points -= 2;
  }

  return {
    total: points,
    breakdown: {
      runs,
      fours,
      sixes,
      strikeRate,
      battingPoints: points,
    },
  };
}

function computeBowlingPoints(row: Dictionary): { total: number; breakdown: Dictionary } {
  const wickets = toNumberSafe(row.w ?? row.wickets);
  const maidens = toNumberSafe(row.m ?? row.maidens);
  const overs = toNumberSafe(row.o ?? row.overs);
  const runsConceded = toNumberSafe(row.r ?? row.runs ?? row.runsConceded);

  let points = 0;
  points += wickets * 25;
  points += maidens * 12;

  if (wickets >= 5) points += 16;
  else if (wickets === 4) points += 8;
  else if (wickets === 3) points += 4;

  if (overs >= 2) {
    const economy = overs > 0 ? runsConceded / overs : 0;
    if (economy < 5) points += 6;
    else if (economy < 6) points += 4;
    else if (economy <= 7) points += 2;
    else if (economy >= 10 && economy < 11) points -= 2;
    else if (economy >= 11 && economy < 12) points -= 4;
    else if (economy >= 12) points -= 6;
  }

  return {
    total: points,
    breakdown: {
      wickets,
      maidens,
      overs,
      runsConceded,
      bowlingPoints: points,
    },
  };
}

function addToPlayerScore(
  store: Map<string, { points: number; breakdown: Dictionary }>,
  key: string,
  deltaPoints: number,
  deltaBreakdown: Dictionary
) {
  const current = store.get(key) ?? { points: 0, breakdown: {} };
  const merged = { ...current.breakdown, ...deltaBreakdown };
  store.set(key, { points: current.points + deltaPoints, breakdown: merged });
}

function rankDescending(rows: Array<{ id: string; total: number }>): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const rankMap = new Map<string, number>();

  let prevScore: number | null = null;
  let prevRank = 0;

  sorted.forEach((row, index) => {
    const rank = prevScore !== null && row.total === prevScore ? prevRank : index + 1;
    rankMap.set(row.id, rank);
    prevScore = row.total;
    prevRank = rank;
  });

  return rankMap;
}

export async function runLiveScoringPipeline() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const completedThresholdIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: newlyLive, error: liveError } = await admin
    .from("matches")
    .update({ status: "live" })
    .lte("match_date", nowIso)
    .in("status", ["upcoming", "lineup_announced"])
    .select("id");
  if (liveError) throw liveError;

  const { data: newlyCompleted, error: completedError } = await admin
    .from("matches")
    .update({ status: "completed" })
    .lt("match_date", completedThresholdIso)
    .eq("status", "live")
    .select("id");
  if (completedError) throw completedError;

  const { data: lockableMatches, error: lockableMatchesError } = await admin
    .from("matches")
    .select("id")
    .not("team_lock_time", "is", null)
    .lte("team_lock_time", nowIso);
  if (lockableMatchesError) throw lockableMatchesError;

  let lockedTeamsCount = 0;
  const lockableMatchIds = (lockableMatches ?? []).map((row) => row.id);
  if (lockableMatchIds.length > 0) {
    const { data: lockedTeams, error: lockError } = await admin
      .from("fantasy_teams")
      .update({ is_locked: true })
      .eq("is_locked", false)
      .in("match_id", lockableMatchIds)
      .select("id");
    if (lockError) throw lockError;
    lockedTeamsCount = lockedTeams?.length ?? 0;
  }

  const { data: scoringMatches, error: scoringMatchesError } = await admin
    .from("matches")
    .select(
      "id, api_match_id, status, match_date, team_a:ipl_teams!matches_team_a_id_fkey(name, short_name), team_b:ipl_teams!matches_team_b_id_fkey(name, short_name)"
    )
    .in("status", ["live", "lineup_announced", "completed"])
    .order("match_date", { ascending: false })
    .limit(30);
  if (scoringMatchesError) throw scoringMatchesError;

  let scoredMatches = 0;
  let updatedMatchPlayers = 0;
  let updatedFantasyTeams = 0;
  let updatedLeaderboardRows = 0;

  for (const match of (scoringMatches ?? []) as MatchRow[]) {
    const teamA = firstObject(match.team_a);
    const teamB = firstObject(match.team_b);
    if (!teamA || !teamB) {
      continue;
    }

    let scorecardPayload: unknown;
    try {
      const scorecard = await getMatchScorecardForScoring({
        apiMatchId: match.api_match_id,
        matchDate: match.match_date,
        teamAName: teamA.name,
        teamBName: teamB.name,
        teamAShortName: teamA.short_name,
        teamBShortName: teamB.short_name,
      });
      scorecardPayload = scorecard.payload;
    } catch {
      continue;
    }

    const { error: rawScoreError } = await admin
      .from("matches")
      .update({ api_raw_scorecard: scorecardPayload })
      .eq("id", match.id);
    if (rawScoreError) throw rawScoreError;

    const { data: matchPlayers, error: matchPlayersError } = await admin
      .from("match_players")
      .select("player_id, is_playing, player:players(id, name, api_player_id)")
      .eq("match_id", match.id);
    if (matchPlayersError) throw matchPlayersError;

    const rows = (matchPlayers ?? []) as MatchPlayerRow[];
    if (rows.length === 0) continue;

    const idByApi = new Map<string, string>();
    const idByName = new Map<string, string>();
    rows.forEach((row) => {
      const player = firstObject(row.player);
      if (!player) return;
      if (player.api_player_id) idByApi.set(player.api_player_id, row.player_id);
      idByName.set(normalizeName(player.name), row.player_id);
    });

    const scoreByPlayerId = new Map<string, { points: number; breakdown: Dictionary }>();

    rows.forEach((row) => {
      if (row.is_playing) {
        addToPlayerScore(scoreByPlayerId, row.player_id, 4, { appearance: 4 });
      }
    });

    const inningsRows = readScorecardRows(scorecardPayload);

    inningsRows.forEach((innings) => {
      readBattingRows(innings).forEach((bat) => {
        const name = normalizeName(playerNameFromStat(bat));
        if (!name) return;
        const playerId = idByApi.get(toStringSafe(bat.id ?? bat.playerId ?? bat.apiPlayerId)) ?? idByName.get(name);
        if (!playerId) return;

        const { total, breakdown } = computeBattingPoints(bat);
        addToPlayerScore(scoreByPlayerId, playerId, total, breakdown);
      });

      readBowlingRows(innings).forEach((bowl) => {
        const name = normalizeName(playerNameFromStat(bowl));
        if (!name) return;
        const playerId = idByApi.get(toStringSafe(bowl.id ?? bowl.playerId ?? bowl.apiPlayerId)) ?? idByName.get(name);
        if (!playerId) return;

        const { total, breakdown } = computeBowlingPoints(bowl);
        addToPlayerScore(scoreByPlayerId, playerId, total, breakdown);
      });
    });

    const pointRows = rows.map((row) => {
      const score = scoreByPlayerId.get(row.player_id) ?? { points: 0, breakdown: {} };
      return {
        match_id: match.id,
        player_id: row.player_id,
        fantasy_points: score.points,
        point_breakdown: score.breakdown,
        last_updated: new Date().toISOString(),
      };
    });

    const { error: updatePointsError } = await admin
      .from("match_players")
      .upsert(pointRows, { onConflict: "match_id,player_id" });
    if (updatePointsError) throw updatePointsError;

    updatedMatchPlayers += pointRows.length;

    const { data: fantasyTeams, error: teamsError } = await admin
      .from("fantasy_teams")
      .select("id, league_id, user_id, captain_player_id, vice_captain_player_id")
      .eq("match_id", match.id);
    if (teamsError) throw teamsError;

    const teamRows = (fantasyTeams ?? []) as FantasyTeamRow[];
    if (teamRows.length === 0) {
      scoredMatches += 1;
      continue;
    }

    const fantasyTeamIds = teamRows.map((team) => team.id);

    const { data: selections, error: selectionError } = await admin
      .from("fantasy_team_players")
      .select("fantasy_team_id, player_id")
      .in("fantasy_team_id", fantasyTeamIds);
    if (selectionError) throw selectionError;

    const selectionsByTeam = new Map<string, string[]>();
    ((selections ?? []) as TeamPlayerJoin[]).forEach((selection) => {
      const current = selectionsByTeam.get(selection.fantasy_team_id) ?? [];
      current.push(selection.player_id);
      selectionsByTeam.set(selection.fantasy_team_id, current);
    });

    const teamUpdates: Array<{ id: string; total_points: number }> = [];
    const leaderboardRows: Array<{ league_id: string; match_id: string; user_id: string; fantasy_team_id: string; total_points: number }> = [];

    teamRows.forEach((team) => {
      const pickedPlayerIds = selectionsByTeam.get(team.id) ?? [];
      let total = 0;

      pickedPlayerIds.forEach((playerId) => {
        const score = scoreByPlayerId.get(playerId)?.points ?? 0;
        if (playerId === team.captain_player_id) {
          total += score * 2;
        } else if (playerId === team.vice_captain_player_id) {
          total += score * 1.5;
        } else {
          total += score;
        }
      });

      const rounded = Number(total.toFixed(1));
      teamUpdates.push({ id: team.id, total_points: rounded });
      leaderboardRows.push({
        league_id: team.league_id,
        match_id: match.id,
        user_id: team.user_id,
        fantasy_team_id: team.id,
        total_points: rounded,
      });
    });

    if (teamUpdates.length > 0) {
      const { error: teamUpdateError } = await admin.from("fantasy_teams").upsert(teamUpdates, { onConflict: "id" });
      if (teamUpdateError) throw teamUpdateError;
      updatedFantasyTeams += teamUpdates.length;
    }

    if (leaderboardRows.length > 0) {
      const { error: leaderboardUpsertError } = await admin
        .from("league_match_leaderboard")
        .upsert(leaderboardRows, { onConflict: "league_id,match_id,user_id" });
      if (leaderboardUpsertError) throw leaderboardUpsertError;
      updatedLeaderboardRows += leaderboardRows.length;

      const uniqueLeagueIds = Array.from(new Set(leaderboardRows.map((row) => row.league_id)));
      for (const leagueId of uniqueLeagueIds) {
        const { data: boardRows, error: boardError } = await admin
          .from("league_match_leaderboard")
          .select("id, fantasy_team_id, total_points")
          .eq("league_id", leagueId)
          .eq("match_id", match.id);
        if (boardError) throw boardError;

        const rankMap = rankDescending(
          ((boardRows ?? []) as LeaderboardRow[]).map((row) => ({ id: row.id, total: row.total_points }))
        );

        for (const row of (boardRows ?? []) as LeaderboardRow[]) {
          const rank = rankMap.get(row.id);
          if (!rank) continue;
          const { error: rankError } = await admin
            .from("league_match_leaderboard")
            .update({ rank, updated_at: new Date().toISOString() })
            .eq("id", row.id);
          if (rankError) throw rankError;
        }
      }
    }

    scoredMatches += 1;
  }

  return {
    movedToLive: newlyLive?.length ?? 0,
    movedToCompleted: newlyCompleted?.length ?? 0,
    lockedTeams: lockedTeamsCount,
    scoredMatches,
    updatedMatchPlayers,
    updatedFantasyTeams,
    updatedLeaderboardRows,
  };
}
