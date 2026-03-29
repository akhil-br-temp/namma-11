import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { getPlayingXI } from "@/lib/cricket-api/cricdata";
import { createAdminClient } from "@/lib/supabase/admin";

type MatchCandidate = {
  id: string;
  api_match_id: string;
  status: "upcoming" | "lineup_announced" | "live" | "completed";
  match_date: string;
  team_lock_time: string | null;
};

type TeamRow = {
  id: string;
  api_team_id: string;
};

type PlayerRow = {
  id: string;
  api_player_id: string;
  ipl_team_id: string | null;
};

function withinLineupWindow(matchDateIso: string): boolean {
  const now = Date.now();
  const matchTime = new Date(matchDateIso).getTime();
  const threeHoursBefore = matchTime - 3 * 60 * 60 * 1000;
  const oneHourAfter = matchTime + 60 * 60 * 1000;
  return now >= threeHoursBefore && now <= oneHourAfter;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: matches, error: matchError } = await admin
      .from("matches")
      .select("id, api_match_id, status, match_date, team_lock_time")
      .in("status", ["upcoming", "lineup_announced", "live"])
      .order("match_date", { ascending: true })
      .limit(30);

    if (matchError) {
      throw matchError;
    }

    const candidates = ((matches ?? []) as MatchCandidate[]).filter((match) => withinLineupWindow(match.match_date));

    if (candidates.length === 0) {
      return NextResponse.json({ polledMatches: 0, lineupAnnouncements: 0, affectedUsers: 0 });
    }

    const { data: teams, error: teamError } = await admin.from("ipl_teams").select("id, api_team_id");
    if (teamError) {
      throw teamError;
    }

    const teamMap = new Map<string, string>();
    ((teams ?? []) as TeamRow[]).forEach((team) => {
      teamMap.set(team.api_team_id, team.id);
    });

    let lineupAnnouncements = 0;
    const notifiedUsers = new Set<string>();

    for (const match of candidates) {
      const lineup = await getPlayingXI(match.api_match_id);

      if (!lineup.announced || lineup.players.length < 11) {
        continue;
      }

      const playerUpserts = lineup.players.map((player) => ({
        api_player_id: player.apiPlayerId ?? `${match.api_match_id}-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: player.name,
        role: player.role,
        ipl_team_id: player.teamApiId ? (teamMap.get(player.teamApiId) ?? null) : null,
        is_overseas: player.isOverseas,
      }));

      const { error: playerUpsertError } = await admin
        .from("players")
        .upsert(playerUpserts, { onConflict: "api_player_id" });

      if (playerUpsertError) {
        throw playerUpsertError;
      }

      const playerApiIds = playerUpserts.map((entry) => entry.api_player_id);
      const { data: savedPlayers, error: savedPlayersError } = await admin
        .from("players")
        .select("id, api_player_id, ipl_team_id")
        .in("api_player_id", playerApiIds);

      if (savedPlayersError) {
        throw savedPlayersError;
      }

      const playerByApiId = new Map<string, PlayerRow>();
      ((savedPlayers ?? []) as PlayerRow[]).forEach((player) => {
        playerByApiId.set(player.api_player_id, player);
      });

      const matchPlayerRows = playerUpserts
        .map((entry) => {
          const saved = playerByApiId.get(entry.api_player_id);
          if (!saved) {
            return null;
          }

          return {
            match_id: match.id,
            player_id: saved.id,
            is_playing: true,
            is_impact_player: false,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      const { error: resetError } = await admin
        .from("match_players")
        .update({ is_playing: false })
        .eq("match_id", match.id);

      if (resetError) {
        throw resetError;
      }

      if (matchPlayerRows.length > 0) {
        const { error: matchPlayersError } = await admin
          .from("match_players")
          .upsert(matchPlayerRows, { onConflict: "match_id,player_id" });

        if (matchPlayersError) {
          throw matchPlayersError;
        }
      }

      const isAlreadyAnnounced = match.status === "lineup_announced";
      const lockTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: updateMatchError } = await admin
        .from("matches")
        .update({
          status: "lineup_announced",
          lineup_announced_at: new Date().toISOString(),
          team_lock_time: lockTime,
        })
        .eq("id", match.id);

      if (updateMatchError) {
        throw updateMatchError;
      }

      if (!isAlreadyAnnounced) {
        lineupAnnouncements += 1;

        const { data: targetUsers, error: targetUsersError } = await admin
          .from("fantasy_teams")
          .select("user_id")
          .eq("match_id", match.id);

        if (targetUsersError) {
          throw targetUsersError;
        }

        const uniqueUserIds = Array.from(new Set((targetUsers ?? []).map((entry) => entry.user_id as string)));

        if (uniqueUserIds.length > 0) {
          const notifications = uniqueUserIds.map((userId) => ({
            user_id: userId,
            type: "lineup_announced" as const,
            match_id: match.id,
            payload: {
              title: "Lineups are out!",
              body: "You have 30 minutes to edit your team.",
              matchId: match.id,
            },
          }));

          const { error: notificationError } = await admin.from("notifications").insert(notifications);
          if (notificationError) {
            throw notificationError;
          }

          uniqueUserIds.forEach((userId) => notifiedUsers.add(userId));
        }
      }
    }

    return NextResponse.json({
      polledMatches: candidates.length,
      lineupAnnouncements,
      affectedUsers: notifiedUsers.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected lineup sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
