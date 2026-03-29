import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type MatchParams = {
  params: Promise<{ id: string }>;
};

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
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
    .select("id, team_a_id, team_b_id, match_date, status, team_lock_time")
    .eq("id", id)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

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
        const team = firstObject(player?.team);

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

  const { data: fallbackPlayers, error: fallbackError } = await supabase
    .from("players")
    .select("id, name, role, credit_value, is_overseas, photo_url, team:ipl_teams!players_ipl_team_id_fkey(name, short_name)")
    .in("ipl_team_id", [matchRow.team_a_id, matchRow.team_b_id]);

  if (fallbackError) {
    return NextResponse.json({ error: fallbackError.message }, { status: 500 });
  }

  const normalizedFallback = (fallbackPlayers ?? []).map((entry) => ({
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
