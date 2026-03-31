import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Dictionary = Record<string, unknown>;

type MatchParams = {
  params: Promise<{ id: string }>;
};

type MatchRow = {
  id: string;
  status: string;
  match_date: string;
  api_raw_scorecard: unknown;
};

type FantasyTeamRow = {
  id: string;
  league_id: string;
  team_name: string | null;
  total_points: number | string | null;
};

type LeagueRow = {
  id: string;
  name: string;
};

type LeagueMemberRow = {
  league_id: string;
  user_id: string;
  display_name: string | null;
};

type LeaderboardRow = {
  league_id: string;
  user_id: string;
  total_points: number | string | null;
  rank: number | null;
  updated_at: string | null;
};

type TeamPlayerJoinRow = {
  fantasy_team_id: string;
  player_id: string;
  player:
    | {
        name: string;
        team: { short_name: string } | { short_name: string }[] | null;
      }
    | {
        name: string;
        team: { short_name: string } | { short_name: string }[] | null;
      }[]
    | null;
};

type MatchPlayerPointsRow = {
  player_id: string;
  fantasy_points: number | string | null;
};

type LiveLeaderboardEntry = {
  userId: string;
  displayName: string;
  points: number;
  rank: number | null;
  isMe: boolean;
};

type LivePlayerEntry = {
  playerId: string;
  name: string;
  teamShortName: string;
  points: number;
};

type LiveLeagueSnapshot = {
  leagueId: string;
  leagueName: string;
  myTeamId: string;
  myTeamName: string;
  myPoints: number;
  myRank: number | null;
  updatedAt: string | null;
  leaderboard: LiveLeaderboardEntry[];
  players: LivePlayerEntry[];
};

type LiveBatterSnapshot = {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isStriker: boolean;
};

type LiveBowlerSnapshot = {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
};

type LiveOverBallSnapshot = {
  ballLabel: string;
  outcome: string;
  runs: number;
  isWicket: boolean;
};

type LiveOverSnapshot = {
  overNumber: number | null;
  runs: number;
  wickets: number;
  balls: LiveOverBallSnapshot[];
};

type LiveScoreSummary = {
  battingTeamShortName: string;
  score: number;
  wickets: number;
  overs: string;
  target: number | null;
  requiredRuns: number | null;
  remainingBalls: number | null;
  currentRunRate: number | null;
  requiredRunRate: number | null;
  striker: LiveBatterSnapshot | null;
  nonStriker: LiveBatterSnapshot | null;
  currentBowler: LiveBowlerSnapshot | null;
  thisOver: LiveOverSnapshot | null;
};

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toNumberSafe(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readObject(value: unknown): Dictionary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Dictionary;
}

function readObjectArray(value: unknown): Dictionary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
}

function oversToBalls(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const completedOvers = Math.floor(value);
    const decimal = Math.round((value - completedOvers) * 10);
    return completedOvers * 6 + Math.max(0, Math.min(5, decimal));
  }

  const text = toStringSafe(value).trim();
  if (!text) return 0;

  const [oversRaw, ballsRaw] = text.split(".");
  const completedOvers = Number.parseInt(oversRaw ?? "0", 10);
  const balls = Number.parseInt((ballsRaw ?? "0").slice(0, 1), 10);

  if (!Number.isFinite(completedOvers) || !Number.isFinite(balls)) {
    return 0;
  }

  return completedOvers * 6 + Math.max(0, Math.min(5, balls));
}

function formatOvers(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? `${value}.0` : `${value}`;
  }

  const text = toStringSafe(value).trim();
  if (text) return text;

  return "0.0";
}

function roundToTwo(value: number): number {
  return Number(value.toFixed(2));
}

function readInningsFromScorecard(rawScorecard: unknown): Dictionary[] {
  const root = readObject(rawScorecard);
  if (!root) {
    return [];
  }

  const rootData = readObject(root.data);
  const rootDataContent = readObject(rootData?.content);

  const candidates = [root, rootData, rootDataContent].filter((entry): entry is Dictionary => entry !== null);

  for (const candidate of candidates) {
    const fromInnings = readObjectArray(candidate.innings);
    if (fromInnings.length > 0) return fromInnings;

    const fromScorecard = readObjectArray(candidate.scorecard ?? candidate.scoreCard);
    if (fromScorecard.length > 0) return fromScorecard;
  }

  return [];
}

function readBattingRows(innings: Dictionary): Dictionary[] {
  return readObjectArray(
    innings.inningBatsmen ?? innings.batting ?? innings.batsman ?? innings.batters ?? innings.battingStats
  );
}

function readBowlingRows(innings: Dictionary): Dictionary[] {
  return readObjectArray(innings.inningBowlers ?? innings.bowling ?? innings.bowlers ?? innings.bowlingStats);
}

function readLatestOverRow(innings: Dictionary): Dictionary | null {
  const latestOver = readObject(innings.latestOver);
  if (latestOver) {
    return latestOver;
  }

  const oversRows = readObjectArray(innings.inningOvers ?? innings.overs ?? innings.overHistory ?? innings.recentOvers);
  return oversRows[oversRows.length - 1] ?? null;
}

function playerNameFromStatRow(row: Dictionary): string {
  const player = readObject(row.player);
  const batsman = readObject(row.batsman);
  const bowler = readObject(row.bowler);

  return (
    toStringSafe(row.name) ||
    toStringSafe(row.playerName) ||
    toStringSafe(row.batsmanName) ||
    toStringSafe(row.bowlerName) ||
    toStringSafe(row.player) ||
    toStringSafe(player?.name) ||
    toStringSafe(player?.longName) ||
    toStringSafe(player?.battingName) ||
    toStringSafe(batsman?.name) ||
    toStringSafe(bowler?.name)
  );
}

function isBatterOut(row: Dictionary): boolean {
  if (typeof row.isOut === "boolean") {
    return row.isOut;
  }

  const dismissal = toStringSafe(row.dismissal ?? row.dismissalText ?? row.outDesc ?? row.wicketText).toLowerCase();
  return dismissal !== "" && !dismissal.includes("not out");
}

function readTeamShortName(innings: Dictionary): string {
  const teamObject = readObject(innings.team);

  return (
    toStringSafe(teamObject?.abbreviation) ||
    toStringSafe(teamObject?.shortName) ||
    toStringSafe(teamObject?.name) ||
    toStringSafe(innings.team) ||
    "BAT"
  );
}

function formatBallOutcome(ball: Dictionary): string {
  const wides = toNumberSafe(ball.wides);
  const noballs = toNumberSafe(ball.noballs);
  const byes = toNumberSafe(ball.byes);
  const legByes = toNumberSafe(ball.legbyes);
  const batsmanRuns = toNumberSafe(ball.batsmanRuns ?? ball.runs ?? ball.run);
  const isWicket = Boolean(ball.isWicket);

  if (wides > 0) {
    return `Wd${wides > 1 ? wides : ""}`;
  }

  if (noballs > 0) {
    return batsmanRuns > 0 ? `Nb+${batsmanRuns}` : "Nb";
  }

  if (byes > 0) {
    return `${byes}b`;
  }

  if (legByes > 0) {
    return `${legByes}lb`;
  }

  if (isWicket) {
    return batsmanRuns > 0 ? `${batsmanRuns}W` : "W";
  }

  return batsmanRuns === 0 ? "•" : `${batsmanRuns}`;
}

function selectCurrentInnings(inningsRows: Dictionary[]): Dictionary | null {
  const explicitCurrent = inningsRows.find((innings) => Boolean(innings.isCurrent));
  if (explicitCurrent) {
    return explicitCurrent;
  }

  const withScoring = inningsRows.filter(
    (innings) => toNumberSafe(innings.runs) > 0 || toNumberSafe(innings.overs) > 0 || toNumberSafe(innings.totalRuns) > 0
  );

  if (withScoring.length > 0) {
    return withScoring[withScoring.length - 1] ?? null;
  }

  return inningsRows[inningsRows.length - 1] ?? null;
}

function buildLiveSummary(rawScorecard: unknown): LiveScoreSummary | null {
  const inningsRows = readInningsFromScorecard(rawScorecard);
  const currentInnings = selectCurrentInnings(inningsRows);

  if (!currentInnings) {
    return null;
  }

  const battingRows = readBattingRows(currentInnings).map((row) => {
    const name = playerNameFromStatRow(row);
    if (!name) return null;

    return {
      name,
      runs: toNumberSafe(row.runs ?? row.r),
      balls: toNumberSafe(row.balls ?? row.b),
      fours: toNumberSafe(row.fours ?? row["4s"]),
      sixes: toNumberSafe(row.sixes ?? row["6s"]),
      strikeRate: toNumberSafe(row.strikerate ?? row.strikeRate ?? row.sr),
      currentType: toNumberSafe(row.currentType),
      isOut: isBatterOut(row),
    };
  });

  const activeBatters = battingRows
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .filter((row) => !row.isOut);

  const selectedBatters = (activeBatters.length > 0
    ? activeBatters
    : battingRows.filter((row): row is NonNullable<typeof row> => row !== null)
  )
    .sort((a, b) => {
      const aRank = a.currentType === 1 ? 0 : a.currentType === 2 ? 1 : 2;
      const bRank = b.currentType === 1 ? 0 : b.currentType === 2 ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return b.balls - a.balls;
    })
    .slice(0, 2)
    .map((row, index): LiveBatterSnapshot => ({
      name: row.name,
      runs: row.runs,
      balls: row.balls,
      fours: row.fours,
      sixes: row.sixes,
      strikeRate: row.strikeRate,
      isStriker: row.currentType === 1 || (row.currentType === 0 && index === 0),
    }));

  const striker = selectedBatters.find((row) => row.isStriker) ?? selectedBatters[0] ?? null;
  const nonStriker = selectedBatters.find((row) => row !== striker) ?? selectedBatters[1] ?? null;

  const currentBowlerRow = readBowlingRows(currentInnings)
    .map((row) => {
      const name = playerNameFromStatRow(row);
      if (!name) return null;

      return {
        name,
        overs: toNumberSafe(row.overs ?? row.o),
        maidens: toNumberSafe(row.maidens ?? row.m),
        runs: toNumberSafe(row.conceded ?? row.runsConceded ?? row.runs ?? row.r),
        wickets: toNumberSafe(row.wickets ?? row.w),
        economy: toNumberSafe(row.economy ?? row.eco),
        currentType: toNumberSafe(row.currentType),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      const aRank = a.currentType === 1 ? 0 : a.currentType === 2 ? 1 : 2;
      const bRank = b.currentType === 1 ? 0 : b.currentType === 2 ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return b.overs - a.overs;
    })[0];

  const currentBowler: LiveBowlerSnapshot | null = currentBowlerRow
    ? {
        name: currentBowlerRow.name,
        overs: currentBowlerRow.overs,
        maidens: currentBowlerRow.maidens,
        runs: currentBowlerRow.runs,
        wickets: currentBowlerRow.wickets,
        economy: currentBowlerRow.economy,
      }
    : null;

  const latestOver = readLatestOverRow(currentInnings);
  const thisOverBalls = readObjectArray(latestOver?.balls).map((ball, index): LiveOverBallSnapshot => {
    const overNumber = toNumberSafe(ball.overNumber ?? latestOver?.overNumber);
    const ballNumber = toNumberSafe(ball.ballNumber) || index + 1;

    return {
      ballLabel: overNumber > 0 ? `${overNumber}.${ballNumber}` : `${index + 1}`,
      outcome: formatBallOutcome(ball),
      runs: toNumberSafe(ball.totalRuns ?? ball.runs ?? ball.run),
      isWicket: Boolean(ball.isWicket),
    };
  });

  const thisOver: LiveOverSnapshot | null = latestOver
    ? {
        overNumber: toNumberSafe(latestOver.overNumber) || null,
        runs: toNumberSafe(latestOver.overRuns),
        wickets: toNumberSafe(latestOver.overWickets),
        balls: thisOverBalls,
      }
    : null;

  const runs = toNumberSafe(currentInnings.runs ?? currentInnings.totalRuns);
  const wickets = toNumberSafe(currentInnings.wickets ?? currentInnings.totalWickets);
  const overs = formatOvers(currentInnings.overs);
  const consumedBalls = toNumberSafe(currentInnings.balls) || oversToBalls(currentInnings.overs);

  const targetNumber = toNumberSafe(currentInnings.target);
  const target = targetNumber > 0 ? targetNumber : null;

  const maxBalls =
    toNumberSafe(currentInnings.totalBalls) ||
    toNumberSafe(currentInnings.totalOvers) * (toNumberSafe(currentInnings.ballsPerOver) || 6);

  const remainingBallsFromOver = toNumberSafe(latestOver?.remainingBalls);
  const remainingBallsComputed = maxBalls > 0 && consumedBalls > 0 ? Math.max(0, maxBalls - consumedBalls) : 0;
  const remainingBalls =
    remainingBallsFromOver > 0
      ? remainingBallsFromOver
      : remainingBallsComputed > 0
        ? remainingBallsComputed
        : null;

  const requiredRunsFromOver = toNumberSafe(latestOver?.requiredRuns ?? currentInnings.requiredRuns);
  const computedRequiredRuns = target !== null ? Math.max(0, target - runs) : 0;
  const requiredRuns =
    requiredRunsFromOver > 0
      ? requiredRunsFromOver
      : computedRequiredRuns > 0
        ? computedRequiredRuns
        : target !== null
          ? 0
          : null;

  const currentRunRate = consumedBalls > 0 ? roundToTwo((runs * 6) / consumedBalls) : null;

  const requiredRunRateFromOver = toNumberSafe(latestOver?.requiredRunRate ?? currentInnings.requiredRunRate);
  const requiredRunRate =
    requiredRunRateFromOver > 0
      ? roundToTwo(requiredRunRateFromOver)
      : requiredRuns !== null && remainingBalls !== null && remainingBalls > 0
        ? roundToTwo((requiredRuns * 6) / remainingBalls)
        : null;

  return {
    battingTeamShortName: readTeamShortName(currentInnings),
    score: runs,
    wickets,
    overs,
    target,
    requiredRuns,
    remainingBalls,
    currentRunRate,
    requiredRunRate,
    striker,
    nonStriker,
    currentBowler,
    thisOver,
  };
}

function leaderboardSort(a: LiveLeaderboardEntry, b: LiveLeaderboardEntry): number {
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) {
    return a.rank - b.rank;
  }

  if (a.rank === null && b.rank !== null) return 1;
  if (a.rank !== null && b.rank === null) return -1;

  return b.points - a.points;
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
    .select("id, status, match_date, api_raw_scorecard")
    .eq("id", id)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const liveSummary = buildLiveSummary((matchRow as MatchRow).api_raw_scorecard);

  const { data: teams, error: teamsError } = await supabase
    .from("fantasy_teams")
    .select("id, league_id, team_name, total_points")
    .eq("match_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  const teamRows = (teams ?? []) as FantasyTeamRow[];

  if (teamRows.length === 0) {
    return NextResponse.json({
      match: {
        id: matchRow.id,
        status: matchRow.status,
        matchDate: matchRow.match_date,
      },
      liveSummary,
      leagues: [] as LiveLeagueSnapshot[],
      fetchedAt: new Date().toISOString(),
    });
  }

  const leagueIds = Array.from(new Set(teamRows.map((team) => team.league_id)));
  const teamIds = teamRows.map((team) => team.id);

  const { data: leagues, error: leaguesError } = await supabase
    .from("leagues")
    .select("id, name")
    .in("id", leagueIds);

  if (leaguesError) {
    return NextResponse.json({ error: leaguesError.message }, { status: 500 });
  }

  const { data: leagueMembers, error: membersError } = await supabase
    .from("league_members")
    .select("league_id, user_id, display_name")
    .in("league_id", leagueIds);

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const { data: leaderboardRows, error: leaderboardError } = await supabase
    .from("league_match_leaderboard")
    .select("league_id, user_id, total_points, rank, updated_at")
    .eq("match_id", id)
    .in("league_id", leagueIds)
    .order("rank", { ascending: true })
    .order("updated_at", { ascending: false });

  if (leaderboardError) {
    return NextResponse.json({ error: leaderboardError.message }, { status: 500 });
  }

  const { data: teamPlayers, error: teamPlayersError } = await supabase
    .from("fantasy_team_players")
    .select("fantasy_team_id, player_id, player:players(name, team:ipl_teams!players_ipl_team_id_fkey(short_name))")
    .in("fantasy_team_id", teamIds);

  if (teamPlayersError) {
    return NextResponse.json({ error: teamPlayersError.message }, { status: 500 });
  }

  const selectedPlayerIds = Array.from(
    new Set(((teamPlayers ?? []) as TeamPlayerJoinRow[]).map((row) => row.player_id))
  );

  let matchPlayerPointsRows: MatchPlayerPointsRow[] = [];
  if (selectedPlayerIds.length > 0) {
    const { data: pointRows, error: pointRowsError } = await supabase
      .from("match_players")
      .select("player_id, fantasy_points")
      .eq("match_id", id)
      .in("player_id", selectedPlayerIds);

    if (pointRowsError) {
      return NextResponse.json({ error: pointRowsError.message }, { status: 500 });
    }

    matchPlayerPointsRows = (pointRows ?? []) as MatchPlayerPointsRow[];
  }

  const leagueNameById = new Map<string, string>();
  ((leagues ?? []) as LeagueRow[]).forEach((league) => {
    leagueNameById.set(league.id, league.name);
  });

  const memberDisplayByLeagueUser = new Map<string, string>();
  ((leagueMembers ?? []) as LeagueMemberRow[]).forEach((member) => {
    memberDisplayByLeagueUser.set(
      `${member.league_id}:${member.user_id}`,
      member.display_name?.trim() || "League Member"
    );
  });

  const leaderboardByLeague = new Map<string, LeaderboardRow[]>();
  ((leaderboardRows ?? []) as LeaderboardRow[]).forEach((row) => {
    const current = leaderboardByLeague.get(row.league_id) ?? [];
    current.push(row);
    leaderboardByLeague.set(row.league_id, current);
  });

  const pointsByPlayerId = new Map<string, number>();
  matchPlayerPointsRows.forEach((row) => {
    pointsByPlayerId.set(row.player_id, toNumberSafe(row.fantasy_points));
  });

  const playersByTeam = new Map<string, LivePlayerEntry[]>();
  ((teamPlayers ?? []) as TeamPlayerJoinRow[]).forEach((row) => {
    const player = firstObject(row.player);
    const team = firstObject(player?.team);

    const list = playersByTeam.get(row.fantasy_team_id) ?? [];
    list.push({
      playerId: row.player_id,
      name: player?.name ?? "Player",
      teamShortName: team?.short_name ?? "TBD",
      points: pointsByPlayerId.get(row.player_id) ?? 0,
    });
    playersByTeam.set(row.fantasy_team_id, list);
  });

  playersByTeam.forEach((list) => {
    list.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  });

  const responseLeagues: LiveLeagueSnapshot[] = teamRows.map((team) => {
    const rawLeaderboard = leaderboardByLeague.get(team.league_id) ?? [];
    const leaderboardEntries: LiveLeaderboardEntry[] = rawLeaderboard.map((entry) => ({
      userId: entry.user_id,
      displayName:
        entry.user_id === user.id
          ? "You"
          : memberDisplayByLeagueUser.get(`${entry.league_id}:${entry.user_id}`) ?? "League Member",
      points: toNumberSafe(entry.total_points),
      rank: entry.rank,
      isMe: entry.user_id === user.id,
    }));

    const myEntry = leaderboardEntries.find((entry) => entry.isMe) ?? null;
    const fallbackPoints = toNumberSafe(team.total_points);

    if (!myEntry) {
      leaderboardEntries.push({
        userId: user.id,
        displayName: "You",
        points: fallbackPoints,
        rank: null,
        isMe: true,
      });
    }

    leaderboardEntries.sort(leaderboardSort);

    const myUpdatedAt =
      rawLeaderboard.find((entry) => entry.user_id === user.id)?.updated_at ??
      rawLeaderboard[0]?.updated_at ??
      null;

    return {
      leagueId: team.league_id,
      leagueName: leagueNameById.get(team.league_id) ?? "League",
      myTeamId: team.id,
      myTeamName: team.team_name?.trim() || "My XI",
      myPoints: myEntry?.points ?? fallbackPoints,
      myRank: myEntry?.rank ?? null,
      updatedAt: myUpdatedAt,
      leaderboard: leaderboardEntries,
      players: playersByTeam.get(team.id) ?? [],
    };
  });

  return NextResponse.json({
    match: {
      id: (matchRow as MatchRow).id,
      status: (matchRow as MatchRow).status,
      matchDate: (matchRow as MatchRow).match_date,
    },
    liveSummary,
    leagues: responseLeagues,
    fetchedAt: new Date().toISOString(),
  });
}