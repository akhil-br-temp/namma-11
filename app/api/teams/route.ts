import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SaveTeamPayload = {
  leagueId?: string;
  matchId?: string;
  teamName?: string;
  captainPlayerId?: string;
  viceCaptainPlayerId?: string;
  playerIds?: string[];
};

function dedupeIds(playerIds: string[]): string[] {
  return Array.from(new Set(playerIds));
}

function utcNowIso(): string {
  return new Date().toISOString();
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leagueId = request.nextUrl.searchParams.get("leagueId");
  const matchId = request.nextUrl.searchParams.get("matchId");

  if (!leagueId || !matchId) {
    return NextResponse.json({ error: "leagueId and matchId are required" }, { status: 400 });
  }

  const { data: team, error: teamError } = await supabase
    .from("fantasy_teams")
    .select(
      "id, league_id, match_id, team_name, captain_player_id, vice_captain_player_id, total_credits_used, total_points, is_locked, updated_at, players:fantasy_team_players(player_id)"
    )
    .eq("user_id", user.id)
    .eq("league_id", leagueId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 });
  }

  return NextResponse.json({ team });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as SaveTeamPayload;
  const leagueId = payload.leagueId;
  const matchId = payload.matchId;
  const teamName = payload.teamName?.trim() || "My XI";
  const playerIds = dedupeIds(payload.playerIds ?? []);
  const captainPlayerId = payload.captainPlayerId;
  const viceCaptainPlayerId = payload.viceCaptainPlayerId;

  if (!leagueId || !matchId) {
    return NextResponse.json({ error: "leagueId and matchId are required" }, { status: 400 });
  }

  if (playerIds.length !== 11) {
    return NextResponse.json({ error: "Exactly 11 players must be selected" }, { status: 400 });
  }

  if (!captainPlayerId || !viceCaptainPlayerId) {
    return NextResponse.json({ error: "Captain and vice-captain are required" }, { status: 400 });
  }

  if (captainPlayerId === viceCaptainPlayerId) {
    return NextResponse.json({ error: "Captain and vice-captain must be different players" }, { status: 400 });
  }

  if (!playerIds.includes(captainPlayerId) || !playerIds.includes(viceCaptainPlayerId)) {
    return NextResponse.json({ error: "Captain and vice-captain must be selected in the team" }, { status: 400 });
  }

  const { data: member, error: memberError } = await supabase
    .from("league_members")
    .select("id")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (!member) {
    return NextResponse.json({ error: "You are not a member of this league" }, { status: 403 });
  }

  const { data: matchRow, error: matchError } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, team_lock_time")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (matchRow.team_lock_time && new Date(utcNowIso()) >= new Date(matchRow.team_lock_time)) {
    return NextResponse.json({ error: "Teams are locked for this match" }, { status: 409 });
  }

  const { data: validPlayers, error: validPlayersError } = await supabase
    .from("players")
    .select("id")
    .in("id", playerIds)
    .in("ipl_team_id", [matchRow.team_a_id, matchRow.team_b_id]);

  if (validPlayersError) {
    return NextResponse.json({ error: validPlayersError.message }, { status: 500 });
  }

  if ((validPlayers ?? []).length !== playerIds.length) {
    return NextResponse.json({ error: "Selected players must belong to this match" }, { status: 400 });
  }

  const { data: team, error: upsertError } = await supabase
    .from("fantasy_teams")
    .upsert(
      {
        user_id: user.id,
        league_id: leagueId,
        match_id: matchId,
        team_name: teamName,
        captain_player_id: captainPlayerId,
        vice_captain_player_id: viceCaptainPlayerId,
        is_locked: false,
      },
      { onConflict: "user_id,league_id,match_id" }
    )
    .select("id, team_name, captain_player_id, vice_captain_player_id, total_credits_used, total_points, is_locked")
    .single();

  if (upsertError || !team) {
    return NextResponse.json({ error: upsertError?.message ?? "Unable to save team" }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("fantasy_team_players")
    .delete()
    .eq("fantasy_team_id", team.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const rows = playerIds.map((playerId) => ({
    fantasy_team_id: team.id,
    player_id: playerId,
  }));

  const { error: playersError } = await supabase
    .from("fantasy_team_players")
    .upsert(rows, { onConflict: "fantasy_team_id,player_id" });

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const { data: latestTeam, error: latestError } = await supabase
    .from("fantasy_teams")
    .select(
      "id, team_name, captain_player_id, vice_captain_player_id, total_credits_used, total_points, is_locked, players:fantasy_team_players(player_id)"
    )
    .eq("id", team.id)
    .single();

  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }

  return NextResponse.json({ team: latestTeam }, { status: 201 });
}
