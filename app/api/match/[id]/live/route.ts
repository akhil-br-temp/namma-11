import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type MatchParams = {
  params: Promise<{ id: string }>;
};

type MatchRow = {
  id: string;
  status: string;
  match_date: string;
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
    .select("id, status, match_date")
    .eq("id", id)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

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
    leagues: responseLeagues,
    fetchedAt: new Date().toISOString(),
  });
}