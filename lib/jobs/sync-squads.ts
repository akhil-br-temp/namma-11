import { createAdminClient } from "@/lib/supabase/admin";

type Dictionary = Record<string, unknown>;

type MatchRow = {
  id: string;
  api_match_id: string;
  team_a_id: string;
  team_b_id: string;
  match_date: string;
  status: "upcoming" | "lineup_announced" | "live" | "completed";
};

type TeamApiRow = { id: string; api_team_id: string | null; name: string; short_name: string };

type PlayerRow = {
  id: string;
  ipl_team_id: string | null;
};

type PlayerInput = {
  api_player_id: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  ipl_team_id: string | null;
  is_overseas: boolean;
  photo_url: string | null;
};

type ExistingPlayerRow = {
  id: string;
  api_player_id: string;
  normalized_name: string | null;
  ipl_team_id: string | null;
};

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeTeamKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlayerName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeRole(value: unknown): "WK" | "BAT" | "AR" | "BOWL" {
  const role = toStringSafe(value).toLowerCase();
  if (role.includes("wicket") || role === "wk") return "WK";
  if (role.includes("all") || role === "ar") return "AR";
  if (role.includes("bowl")) return "BOWL";
  return "BAT";
}

function parseSquadRows(payload: unknown): Dictionary[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Dictionary;
  if (Array.isArray(root.data)) {
    return root.data.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }
  return [];
}

function isOverseas(teamName: string, playerCountry: string): boolean {
  const tn = teamName.trim().toLowerCase();
  const pc = playerCountry.trim().toLowerCase();
  if (!tn || !pc) return false;
  if (pc.includes("india")) return false;
  return true;
}

async function fetchMatchSquad(apiKey: string, apiMatchId: string): Promise<Dictionary[]> {
  const endpoint = `https://api.cricapi.com/v1/match_squad?apikey=${encodeURIComponent(apiKey)}&offset=0&id=${encodeURIComponent(apiMatchId)}`;
  const response = await fetch(endpoint, { method: "GET", headers: { "Content-Type": "application/json" }, next: { revalidate: 0 } });
  if (!response.ok) {
    throw new Error(`match_squad failed (${response.status}) for ${apiMatchId}`);
  }
  const payload = await response.json();
  return parseSquadRows(payload);
}

async function reconcileSeededPlayers(
  admin: ReturnType<typeof createAdminClient>,
  players: PlayerInput[]
): Promise<{ players: PlayerInput[]; promotedCount: number }> {
  const teamIds = Array.from(
    new Set(players.map((player) => player.ipl_team_id).filter((teamId): teamId is string => Boolean(teamId)))
  );
  const normalizedNames = Array.from(
    new Set(players.map((player) => normalizePlayerName(player.name)).filter((name) => name.length > 0))
  );

  if (teamIds.length === 0 || normalizedNames.length === 0) {
    return { players, promotedCount: 0 };
  }

  const { data: existingPlayers, error: existingPlayersError } = await admin
    .from("players")
    .select("id, api_player_id, normalized_name, ipl_team_id")
    .in("ipl_team_id", teamIds)
    .in("normalized_name", normalizedNames);

  if (existingPlayersError) throw existingPlayersError;

  const existingByKey = new Map<string, ExistingPlayerRow>();
  ((existingPlayers ?? []) as ExistingPlayerRow[]).forEach((player) => {
    if (!player.ipl_team_id || !player.normalized_name) return;
    const key = `${player.ipl_team_id}:${player.normalized_name}`;
    if (!existingByKey.has(key)) {
      existingByKey.set(key, player);
    }
  });

  const promotedRows: Array<{
    id: string;
    api_player_id: string;
    name: string;
    role: "WK" | "BAT" | "AR" | "BOWL";
    is_overseas: boolean;
    photo_url: string | null;
    source_provider: string;
    source_updated_at: string;
  }> = [];
  const reconciled: PlayerInput[] = [];
  const providerTimestamp = new Date().toISOString();

  players.forEach((player) => {
    if (!player.ipl_team_id) {
      reconciled.push(player);
      return;
    }

    const key = `${player.ipl_team_id}:${normalizePlayerName(player.name)}`;
    const existing = existingByKey.get(key);

    if (!existing) {
      reconciled.push(player);
      return;
    }

    if (existing.api_player_id.startsWith("seed-ipl-") && existing.api_player_id !== player.api_player_id) {
      promotedRows.push({
        id: existing.id,
        api_player_id: player.api_player_id,
        name: player.name,
        role: player.role,
        is_overseas: player.is_overseas,
        photo_url: player.photo_url,
        source_provider: "cricdata",
        source_updated_at: providerTimestamp,
      });
      reconciled.push(player);
      return;
    }

    if (existing.api_player_id !== player.api_player_id) {
      reconciled.push({
        ...player,
        api_player_id: existing.api_player_id,
      });
      return;
    }

    reconciled.push(player);
  });

  if (promotedRows.length > 0) {
    const { error: promoteError } = await admin.from("players").upsert(promotedRows, { onConflict: "id" });
    if (promoteError) throw promoteError;
  }

  const dedupByApiId = new Map<string, PlayerInput>();
  reconciled.forEach((player) => dedupByApiId.set(player.api_player_id, player));

  return {
    players: Array.from(dedupByApiId.values()),
    promotedCount: promotedRows.length,
  };
}

export async function runSquadSync() {
  const apiKey = process.env.CRICDATA_API_KEY;
  if (!apiKey) {
    throw new Error("CRICDATA_API_KEY is missing");
  }

  const admin = createAdminClient();
  const now = Date.now();

  const { data: teamRows, error: teamsError } = await admin.from("ipl_teams").select("id, api_team_id, name, short_name");
  if (teamsError) throw teamsError;

  const teamMapByApiId = new Map<string, string>();
  const teamMapByName = new Map<string, string>();

  (teamRows ?? []).forEach((row: TeamApiRow) => {
    if (row.api_team_id) {
      teamMapByApiId.set(row.api_team_id, row.id);
    }

    const normalizedName = normalizeTeamKey(row.name);
    if (normalizedName) {
      teamMapByName.set(normalizedName, row.id);
    }

    const normalizedShortName = normalizeTeamKey(row.short_name);
    if (normalizedShortName) {
      teamMapByName.set(normalizedShortName, row.id);
    }
  });

  const { data: matches, error: matchesError } = await admin
    .from("matches")
    .select("id, api_match_id, team_a_id, team_b_id, match_date, status")
    .in("status", ["upcoming", "lineup_announced", "live", "completed"])
    .order("match_date", { ascending: true })
    .limit(200);

  if (matchesError) throw matchesError;

  const windowMatches = ((matches ?? []) as MatchRow[]).filter((match) => {
    const ts = new Date(match.match_date).getTime();
    return ts >= now - 45 * 24 * 60 * 60 * 1000 && ts <= now + 120 * 24 * 60 * 60 * 1000;
  });

  const targetMatches = windowMatches;

  const upcomingMatches = windowMatches.filter((match) =>
    match.status === "upcoming" || match.status === "lineup_announced" || match.status === "live"
  );

  let syncedMatches = 0;
  let upsertedPlayers = 0;
  let upsertedMatchPlayers = 0;
  let promotedSeededPlayers = 0;
  let preloadedMatches = 0;
  let preloadedMatchPlayers = 0;

  for (const match of targetMatches) {
    let squadRows: Dictionary[] = [];
    try {
      squadRows = await fetchMatchSquad(apiKey, match.api_match_id);
    } catch {
      continue;
    }

    if (squadRows.length < 2) {
      continue;
    }

    const playersInput: PlayerInput[] = [];

    for (const team of squadRows) {
      const teamName = toStringSafe(team.teamName);
      const teamShortName = toStringSafe(team.shortName) || toStringSafe(team.shortname);
      const players = Array.isArray(team.players)
        ? team.players.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null)
        : [];

      for (const player of players) {
        const playerId = toStringSafe(player.id);
        const playerName = toStringSafe(player.name);
        if (!playerId || !playerName) {
          continue;
        }

        const teamApiId = toStringSafe(player.teamId) || toStringSafe(team.id);
        const resolvedTeamId =
          (teamApiId ? teamMapByApiId.get(teamApiId) : undefined) ??
          (teamName ? teamMapByName.get(normalizeTeamKey(teamName)) : undefined) ??
          (teamShortName ? teamMapByName.get(normalizeTeamKey(teamShortName)) : undefined) ??
          null;

        playersInput.push({
          api_player_id: playerId,
          name: playerName,
          role: normalizeRole(player.role),
          ipl_team_id: resolvedTeamId,
          is_overseas: isOverseas(teamName, toStringSafe(player.country)),
          photo_url: toStringSafe(player.image) || null,
        });
      }
    }

    if (playersInput.length === 0) {
      continue;
    }

    const dedupByApiId = new Map<string, PlayerInput>();
    playersInput.forEach((entry) => dedupByApiId.set(entry.api_player_id, entry));
    const { players: uniquePlayers, promotedCount } = await reconcileSeededPlayers(admin, Array.from(dedupByApiId.values()));
    promotedSeededPlayers += promotedCount;

    const providerTimestamp = new Date().toISOString();
    const providerPlayers = uniquePlayers.map((player) => ({
      ...player,
      source_provider: "cricdata",
      source_updated_at: providerTimestamp,
    }));

    const { error: upsertPlayersError } = await admin.from("players").upsert(providerPlayers, { onConflict: "api_player_id" });
    if (upsertPlayersError) throw upsertPlayersError;
    upsertedPlayers += uniquePlayers.length;

    const apiPlayerIds = uniquePlayers.map((p) => p.api_player_id);
    const { data: storedPlayers, error: storedPlayersError } = await admin
      .from("players")
      .select("id, api_player_id")
      .in("api_player_id", apiPlayerIds);
    if (storedPlayersError) throw storedPlayersError;

    const idByApi = new Map<string, string>();
    (storedPlayers ?? []).forEach((player: { id: string; api_player_id: string }) => {
      idByApi.set(player.api_player_id, player.id);
    });

    const matchPlayerRows = uniquePlayers
      .map((player) => {
        const playerId = idByApi.get(player.api_player_id);
        if (!playerId) return null;
        return {
          match_id: match.id,
          player_id: playerId,
          is_playing: false,
          is_impact_player: false,
          is_concussion_substitute: false,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (matchPlayerRows.length > 0) {
      const { error: matchPlayersError } = await admin
        .from("match_players")
        .upsert(matchPlayerRows, { onConflict: "match_id,player_id", ignoreDuplicates: true });
      if (matchPlayersError) throw matchPlayersError;
      upsertedMatchPlayers += matchPlayerRows.length;
    }

    syncedMatches += 1;
  }

  const upcomingTeamIds = Array.from(
    new Set(
      upcomingMatches
        .flatMap((match) => [match.team_a_id, match.team_b_id])
        .filter((teamId): teamId is string => Boolean(teamId))
    )
  );

  if (upcomingTeamIds.length > 0) {
    const { data: playersByTeam, error: playersByTeamError } = await admin
      .from("players")
      .select("id, ipl_team_id")
      .in("ipl_team_id", upcomingTeamIds);
    if (playersByTeamError) throw playersByTeamError;

    const rosterByTeamId = new Map<string, string[]>();
    ((playersByTeam ?? []) as PlayerRow[]).forEach((player) => {
      if (!player.ipl_team_id) return;
      const current = rosterByTeamId.get(player.ipl_team_id) ?? [];
      current.push(player.id);
      rosterByTeamId.set(player.ipl_team_id, current);
    });

    for (const match of upcomingMatches) {
      const playerIds = Array.from(
        new Set([
          ...(rosterByTeamId.get(match.team_a_id) ?? []),
          ...(rosterByTeamId.get(match.team_b_id) ?? []),
        ])
      );

      if (playerIds.length === 0) {
        continue;
      }

      const preloadRows = playerIds.map((playerId) => ({
        match_id: match.id,
        player_id: playerId,
        is_playing: false,
        is_impact_player: false,
        is_concussion_substitute: false,
      }));

      const { error: preloadError } = await admin
        .from("match_players")
        .upsert(preloadRows, { onConflict: "match_id,player_id", ignoreDuplicates: true });

      if (preloadError) throw preloadError;

      preloadedMatches += 1;
      preloadedMatchPlayers += preloadRows.length;
    }
  }

  return {
    scannedMatches: targetMatches.length,
    syncedMatches,
    upsertedPlayers,
    promotedSeededPlayers,
    upsertedMatchPlayers,
    preloadedMatches,
    preloadedMatchPlayers,
  };
}
