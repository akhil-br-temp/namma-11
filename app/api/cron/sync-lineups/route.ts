import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { getMatchScorecardForScoring } from "@/lib/cricket-api/scorecard-adapter";
import { buildSyncHealthReport } from "@/lib/jobs/sync-report";
import { createAdminClient } from "@/lib/supabase/admin";

type MatchCandidate = {
  id: string;
  api_match_id: string;
  status: "upcoming" | "lineup_announced" | "live" | "completed";
  match_date: string;
  team_lock_time: string | null;
  team_a_id: string;
  team_b_id: string;
  team_a: TeamRelation | TeamRelation[] | null;
  team_b: TeamRelation | TeamRelation[] | null;
};

type TeamRelation = {
  name: string;
  short_name: string;
};

type PlayerRow = {
  id: string;
  api_player_id: string;
  ipl_team_id: string | null;
  normalized_name: string | null;
};

type ScrapedLineupPlayer = {
  apiPlayerId: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  iplTeamId: string | null;
  isOverseas: boolean;
};

type MutableLineupPlayer = ScrapedLineupPlayer & {
  seenBatting: boolean;
  seenBowling: boolean;
  wicketKeeperHint: boolean;
};

type Dictionary = Record<string, unknown>;

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readObject(value: unknown): Dictionary | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dictionary) : null;
}

function readObjectArray(value: unknown): Dictionary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
}

function normalizePlayerName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isDerivedLineupPlayerId(matchApiId: string, apiPlayerId: string): boolean {
  return apiPlayerId.startsWith(`derived-${matchApiId}-`) || apiPlayerId.startsWith(`${matchApiId}-`);
}

function withinLineupWindow(matchDateIso: string): boolean {
  const now = Date.now();
  const matchTime = new Date(matchDateIso).getTime();
  const threeHoursBefore = matchTime - 3 * 60 * 60 * 1000;
  const oneHourAfter = matchTime + 60 * 60 * 1000;
  return now >= threeHoursBefore && now <= oneHourAfter;
}

function normalizeTeamToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hasWicketKeeperHint(name: string, row: Dictionary): boolean {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes("(wk)") || normalizedName.includes("wk")) {
    return true;
  }

  const keeperHints = [row.keeper, row.isKeeper, row.isWicketKeeper, row.wicketkeeper, row.wicketKeeper];
  return keeperHints.some((value) => value === true || value === 1 || value === "1" || value === "true");
}

function resolveInningTeamId(
  rawTeam: string,
  match: MatchCandidate,
  teamA: TeamRelation,
  teamB: TeamRelation
): string | null {
  const token = normalizeTeamToken(rawTeam);
  if (!token) {
    return null;
  }

  const teamATokens = [teamA.name, teamA.short_name].map(normalizeTeamToken).filter((value) => value.length > 0);
  const teamBTokens = [teamB.name, teamB.short_name].map(normalizeTeamToken).filter((value) => value.length > 0);

  const matchATeam = teamATokens.some((candidate) => token === candidate || token.includes(candidate) || candidate.includes(token));
  if (matchATeam) {
    return match.team_a_id;
  }

  const matchBTeam = teamBTokens.some((candidate) => token === candidate || token.includes(candidate) || candidate.includes(token));
  if (matchBTeam) {
    return match.team_b_id;
  }

  return null;
}

function deriveRole(player: MutableLineupPlayer): "WK" | "BAT" | "AR" | "BOWL" {
  if (player.wicketKeeperHint) return "WK";
  if (player.seenBatting && player.seenBowling) return "AR";
  if (player.seenBowling) return "BOWL";
  return "BAT";
}

function buildScrapedLineup(
  payload: unknown,
  match: MatchCandidate,
  teamA: TeamRelation,
  teamB: TeamRelation
): { announced: boolean; players: ScrapedLineupPlayer[] } {
  const payloadObject = readObject(payload);
  const dataObject = readObject(payloadObject?.data);
  const inningsRows = readObjectArray(dataObject?.innings);

  const byPlayerKey = new Map<string, MutableLineupPlayer>();

  for (const inning of inningsRows) {
    const inningTeamLabel = toStringSafe(inning.team);
    const inningTeamId = resolveInningTeamId(inningTeamLabel, match, teamA, teamB);
    const battingRows = readObjectArray(inning.batting);
    const bowlingRows = readObjectArray(inning.bowling);

    for (const row of battingRows) {
      const name = toStringSafe(row.name);
      const normalized = normalizePlayerName(name);
      if (!normalized) {
        continue;
      }

      const extractedPlayerId = toStringSafe(row.apiPlayerId) || toStringSafe(row.playerId) || toStringSafe(row.id);
      const key = `${inningTeamId ?? "unknown"}:${normalized}`;
      const existing = byPlayerKey.get(key);

      const merged: MutableLineupPlayer = {
        apiPlayerId: extractedPlayerId || existing?.apiPlayerId || `derived-${match.api_match_id}-${normalized}`,
        name,
        role: existing?.role ?? "BAT",
        iplTeamId: inningTeamId ?? existing?.iplTeamId ?? null,
        isOverseas: existing?.isOverseas ?? false,
        seenBatting: true,
        seenBowling: existing?.seenBowling ?? false,
        wicketKeeperHint: (existing?.wicketKeeperHint ?? false) || hasWicketKeeperHint(name, row),
      };

      byPlayerKey.set(key, merged);
    }

    for (const row of bowlingRows) {
      const name = toStringSafe(row.name);
      const normalized = normalizePlayerName(name);
      if (!normalized) {
        continue;
      }

      const extractedPlayerId = toStringSafe(row.apiPlayerId) || toStringSafe(row.playerId) || toStringSafe(row.id);
      const key = `${inningTeamId ?? "unknown"}:${normalized}`;
      const existing = byPlayerKey.get(key);

      const merged: MutableLineupPlayer = {
        apiPlayerId: extractedPlayerId || existing?.apiPlayerId || `derived-${match.api_match_id}-${normalized}`,
        name,
        role: existing?.role ?? "BAT",
        iplTeamId: inningTeamId ?? existing?.iplTeamId ?? null,
        isOverseas: existing?.isOverseas ?? false,
        seenBatting: existing?.seenBatting ?? false,
        seenBowling: true,
        wicketKeeperHint: (existing?.wicketKeeperHint ?? false) || hasWicketKeeperHint(name, row),
      };

      byPlayerKey.set(key, merged);
    }
  }

  const players = Array.from(byPlayerKey.values())
    .map<ScrapedLineupPlayer>((player) => ({
      apiPlayerId: player.apiPlayerId,
      name: player.name,
      role: deriveRole(player),
      iplTeamId: player.iplTeamId,
      isOverseas: player.isOverseas,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    announced: players.length >= 11,
    players,
  };
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: matches, error: matchError } = await admin
      .from("matches")
      .select(
        "id, api_match_id, status, match_date, team_lock_time, team_a_id, team_b_id, team_a:ipl_teams!matches_team_a_id_fkey(name, short_name), team_b:ipl_teams!matches_team_b_id_fkey(name, short_name)"
      )
      .in("status", ["upcoming", "lineup_announced", "live"])
      .order("match_date", { ascending: true })
      .limit(30);

    if (matchError) {
      throw matchError;
    }

    const candidates = ((matches ?? []) as MatchCandidate[]).filter((match) => withinLineupWindow(match.match_date));

    if (candidates.length === 0) {
      const report = await buildSyncHealthReport().catch((reportError: unknown) => ({
        error: reportError instanceof Error ? reportError.message : "Failed to generate sync report",
      }));
      return NextResponse.json({ polledMatches: 0, lineupAnnouncements: 0, affectedUsers: 0, report });
    }

    let lineupAnnouncements = 0;
    const notifiedUsers = new Set<string>();
    let promotedSeededPlayers = 0;

    for (const match of candidates) {
      const teamA = firstObject(match.team_a);
      const teamB = firstObject(match.team_b);
      if (!teamA || !teamB) {
        continue;
      }

      let lineup: { announced: boolean; players: ScrapedLineupPlayer[] };
      try {
        const scorecard = await getMatchScorecardForScoring({
          apiMatchId: match.api_match_id,
          matchDate: match.match_date,
          teamAName: teamA.name,
          teamBName: teamB.name,
          teamAShortName: teamA.short_name,
          teamBShortName: teamB.short_name,
        });

        lineup = buildScrapedLineup(scorecard.payload, match, teamA, teamB);
      } catch {
        continue;
      }

      if (!lineup.announced || lineup.players.length < 11) {
        continue;
      }

      const playerUpserts = lineup.players.map((player) => ({
        api_player_id: player.apiPlayerId,
        name: player.name,
        role: player.role,
        ipl_team_id: player.iplTeamId,
        is_overseas: player.isOverseas,
      }));

      const teamIds = Array.from(
        new Set(playerUpserts.map((player) => player.ipl_team_id).filter((teamId): teamId is string => Boolean(teamId)))
      );
      const normalizedNames = Array.from(
        new Set(playerUpserts.map((player) => normalizePlayerName(player.name)).filter((name) => name.length > 0))
      );

      let reconciledUpserts = playerUpserts;

      if (teamIds.length > 0 && normalizedNames.length > 0) {
        const { data: existingPlayers, error: existingPlayersError } = await admin
          .from("players")
          .select("id, api_player_id, ipl_team_id, normalized_name")
          .in("ipl_team_id", teamIds)
          .in("normalized_name", normalizedNames);

        if (existingPlayersError) {
          throw existingPlayersError;
        }

        const existingByKey = new Map<string, PlayerRow>();
        ((existingPlayers ?? []) as PlayerRow[]).forEach((player) => {
          if (!player.ipl_team_id || !player.normalized_name) return;
          const key = `${player.ipl_team_id}:${player.normalized_name}`;
          if (!existingByKey.has(key)) {
            existingByKey.set(key, player);
          }
        });

        const promoteRows: Array<{
          id: string;
          api_player_id: string;
          name: string;
          role: "WK" | "BAT" | "AR" | "BOWL";
          is_overseas: boolean;
          source_provider: string;
          source_updated_at: string;
        }> = [];
        const resolved: typeof playerUpserts = [];
        const providerTimestamp = new Date().toISOString();

        playerUpserts.forEach((player) => {
          if (!player.ipl_team_id) {
            resolved.push(player);
            return;
          }

          const key = `${player.ipl_team_id}:${normalizePlayerName(player.name)}`;
          const existing = existingByKey.get(key);

          if (!existing) {
            resolved.push(player);
            return;
          }

          const derivedIncoming = isDerivedLineupPlayerId(match.api_match_id, player.api_player_id);

          if (existing.api_player_id.startsWith("seed-ipl-") && !derivedIncoming && existing.api_player_id !== player.api_player_id) {
            promoteRows.push({
              id: existing.id,
              api_player_id: player.api_player_id,
              name: player.name,
              role: player.role,
              is_overseas: player.is_overseas,
              source_provider: "espn",
              source_updated_at: providerTimestamp,
            });
            resolved.push(player);
            return;
          }

          if (existing.api_player_id !== player.api_player_id) {
            resolved.push({
              ...player,
              api_player_id: existing.api_player_id,
            });
            return;
          }

          resolved.push(player);
        });

        if (promoteRows.length > 0) {
          const { error: promoteError } = await admin.from("players").upsert(promoteRows, { onConflict: "id" });
          if (promoteError) {
            throw promoteError;
          }
          promotedSeededPlayers += promoteRows.length;
        }

        const dedupByApiId = new Map<string, (typeof playerUpserts)[number]>();
        resolved.forEach((player) => dedupByApiId.set(player.api_player_id, player));
        reconciledUpserts = Array.from(dedupByApiId.values());
      }

      const { error: playerUpsertError } = await admin
        .from("players")
        .upsert(
          reconciledUpserts.map((player) => ({
            ...player,
            source_provider: "espn",
            source_updated_at: new Date().toISOString(),
          })),
          { onConflict: "api_player_id" }
        );

      if (playerUpsertError) {
        throw playerUpsertError;
      }

      const playerApiIds = reconciledUpserts.map((entry) => entry.api_player_id);
      const { data: savedPlayers, error: savedPlayersError } = await admin
        .from("players")
        .select("id, api_player_id, ipl_team_id, normalized_name")
        .in("api_player_id", playerApiIds);

      if (savedPlayersError) {
        throw savedPlayersError;
      }

      const playerByApiId = new Map<string, PlayerRow>();
      ((savedPlayers ?? []) as PlayerRow[]).forEach((player) => {
        playerByApiId.set(player.api_player_id, player);
      });

      const matchPlayerRows = reconciledUpserts
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
      // Lock teams at match start time (match_date), not 30 min after lineup announcement
      const lockTime = match.match_date;

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
              body: "Edit your team before the match starts.",
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

    const report = await buildSyncHealthReport().catch((reportError: unknown) => ({
      error: reportError instanceof Error ? reportError.message : "Failed to generate sync report",
    }));

    return NextResponse.json({
      polledMatches: candidates.length,
      lineupAnnouncements,
      affectedUsers: notifiedUsers.size,
      promotedSeededPlayers,
      report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected lineup sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
