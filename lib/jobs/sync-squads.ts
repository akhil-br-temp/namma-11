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

type TeamApiRow = { id: string; api_team_id: string | null };

type PlayerInput = {
  api_player_id: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  ipl_team_id: string | null;
  is_overseas: boolean;
  photo_url: string | null;
};

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
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

export async function runSquadSync() {
  const apiKey = process.env.CRICDATA_API_KEY;
  if (!apiKey) {
    throw new Error("CRICDATA_API_KEY is missing");
  }

  const admin = createAdminClient();
  const now = Date.now();

  const { data: teamRows, error: teamsError } = await admin.from("ipl_teams").select("id, api_team_id");
  if (teamsError) throw teamsError;

  const teamMap = new Map<string, string>();
  (teamRows ?? []).forEach((row: TeamApiRow) => {
    if (row.api_team_id) {
      teamMap.set(row.api_team_id, row.id);
    }
  });

  const { data: matches, error: matchesError } = await admin
    .from("matches")
    .select("id, api_match_id, team_a_id, team_b_id, match_date, status")
    .in("status", ["upcoming", "lineup_announced", "live"])
    .order("match_date", { ascending: true })
    .limit(80);

  if (matchesError) throw matchesError;

  const targetMatches = ((matches ?? []) as MatchRow[]).filter((match) => {
    const ts = new Date(match.match_date).getTime();
    return ts >= now - 3 * 24 * 60 * 60 * 1000;
  });

  let syncedMatches = 0;
  let upsertedPlayers = 0;
  let upsertedMatchPlayers = 0;

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
        playersInput.push({
          api_player_id: playerId,
          name: playerName,
          role: normalizeRole(player.role),
          ipl_team_id: teamMap.get(teamApiId) ?? null,
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
    const uniquePlayers = Array.from(dedupByApiId.values());

    const { error: upsertPlayersError } = await admin.from("players").upsert(uniquePlayers, { onConflict: "api_player_id" });
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
        .upsert(matchPlayerRows, { onConflict: "match_id,player_id" });
      if (matchPlayersError) throw matchPlayersError;
      upsertedMatchPlayers += matchPlayerRows.length;
    }

    syncedMatches += 1;
  }

  return {
    scannedMatches: targetMatches.length,
    syncedMatches,
    upsertedPlayers,
    upsertedMatchPlayers,
  };
}
