import {
  IPL_2026_SQUADS,
  IPL_SEED_SEASON,
  IPL_SEED_SOURCE_PROVIDER,
  type SeedTeam,
} from "@/lib/data/ipl-2026-squads";
import { createAdminClient } from "@/lib/supabase/admin";

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  api_team_id: string | null;
};

type PlayerRow = {
  id: string;
  api_player_id: string;
  normalized_name: string | null;
  ipl_team_id: string | null;
};

type PlayerWrite = {
  id?: string;
  api_player_id: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  ipl_team_id: string;
  is_overseas: boolean;
  normalized_name: string;
  seed_season: number;
  source_provider: string;
  source_url: string;
  source_updated_at: string;
  seed_profile_url: string;
  nationality: string | null;
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function normalizeTeam(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function seedApiPlayerId(teamShortName: string, iplPlayerId: string): string {
  return `seed-ipl-${IPL_SEED_SEASON}-${teamShortName.toLowerCase()}-${iplPlayerId}`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[] {
  if (chunkSize <= 0 || items.length <= chunkSize) {
    return items;
  }

  const chunks: T[] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(...items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function ensureTeams(seedTeams: SeedTeam[]): Promise<Map<string, string>> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("ipl_teams")
    .select("id, name, short_name, api_team_id");

  if (existingError) {
    throw existingError;
  }

  const existingRows = (existing ?? []) as TeamRow[];
  const byShortName = new Map<string, TeamRow>();
  const byName = new Map<string, TeamRow>();

  existingRows.forEach((row) => {
    byShortName.set(row.short_name.toUpperCase(), row);
    byName.set(normalizeTeam(row.name), row);
  });

  const inserts: Array<Pick<TeamRow, "name" | "short_name" | "api_team_id">> = [];
  const updates: Array<{ id: string; name: string; short_name: string }> = [];

  seedTeams.forEach((team) => {
    const shortKey = team.shortName.toUpperCase();
    const nameKey = normalizeTeam(team.name);
    const existingTeam = byShortName.get(shortKey) ?? byName.get(nameKey);

    if (!existingTeam) {
      inserts.push({
        name: team.name,
        short_name: team.shortName,
        api_team_id: null,
      });
      return;
    }

    if (existingTeam.name !== team.name || existingTeam.short_name !== team.shortName) {
      updates.push({
        id: existingTeam.id,
        name: team.name,
        short_name: team.shortName,
      });
    }
  });

  if (inserts.length > 0) {
    const { error: insertError } = await admin.from("ipl_teams").insert(inserts);
    if (insertError) {
      throw insertError;
    }
  }

  for (const update of updates) {
    const { error: updateError } = await admin
      .from("ipl_teams")
      .update({ name: update.name, short_name: update.short_name })
      .eq("id", update.id);

    if (updateError) {
      throw updateError;
    }
  }

  const shortNames = seedTeams.map((team) => team.shortName);
  const { data: savedTeams, error: savedError } = await admin
    .from("ipl_teams")
    .select("id, short_name")
    .in("short_name", shortNames);

  if (savedError) {
    throw savedError;
  }

  const teamIdByShortName = new Map<string, string>();
  (savedTeams ?? []).forEach((row: { id: string; short_name: string }) => {
    teamIdByShortName.set(row.short_name.toUpperCase(), row.id);
  });

  return teamIdByShortName;
}

export async function runIplSquadSeed() {
  const admin = createAdminClient();
  const teamIdByShortName = await ensureTeams(IPL_2026_SQUADS);

  const teamIds = Array.from(teamIdByShortName.values());
  const { data: existingPlayers, error: existingPlayersError } = await admin
    .from("players")
    .select("id, api_player_id, normalized_name, ipl_team_id")
    .in("ipl_team_id", teamIds);

  if (existingPlayersError) {
    throw existingPlayersError;
  }

  const existingByKey = new Map<string, PlayerRow>();
  const existingByApiId = new Map<string, PlayerRow>();

  ((existingPlayers ?? []) as PlayerRow[]).forEach((row) => {
    existingByApiId.set(row.api_player_id, row);

    if (!row.ipl_team_id || !row.normalized_name) {
      return;
    }

    const key = `${row.ipl_team_id}:${row.normalized_name}`;
    if (!existingByKey.has(key)) {
      existingByKey.set(key, row);
    }
  });

  const updates: PlayerWrite[] = [];
  const inserts: PlayerWrite[] = [];

  IPL_2026_SQUADS.forEach((team) => {
    const teamId = teamIdByShortName.get(team.shortName.toUpperCase());
    if (!teamId) {
      throw new Error(`Missing team id for ${team.shortName}`);
    }

    team.players.forEach((player) => {
      const normalizedName = normalizeName(player.name);
      const seedApiId = seedApiPlayerId(team.shortName, player.iplPlayerId);
      const key = `${teamId}:${normalizedName}`;
      const existing = existingByKey.get(key) ?? existingByApiId.get(seedApiId);

      const rowPayload: PlayerWrite = {
        api_player_id: seedApiId,
        name: player.name,
        role: player.role,
        ipl_team_id: teamId,
        is_overseas: player.isOverseas,
        normalized_name: normalizedName,
        seed_season: IPL_SEED_SEASON,
        source_provider: IPL_SEED_SOURCE_PROVIDER,
        source_url: team.sourceUrl,
        source_updated_at: team.sourceUpdatedAt,
        seed_profile_url: player.profileUrl,
        nationality: player.nationality,
      };

      if (existing) {
        updates.push({
          ...rowPayload,
          id: existing.id,
          api_player_id: existing.api_player_id.startsWith("seed-ipl-") ? seedApiId : existing.api_player_id,
        });
      } else {
        inserts.push(rowPayload);
      }
    });
  });

  if (updates.length > 0) {
    const { error: updateError } = await admin
      .from("players")
      .upsert(chunkArray(updates, 400), { onConflict: "id" });

    if (updateError) {
      throw updateError;
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await admin
      .from("players")
      .upsert(chunkArray(inserts, 400), { onConflict: "api_player_id" });

    if (insertError) {
      throw insertError;
    }
  }

  return {
    season: IPL_SEED_SEASON,
    teams: IPL_2026_SQUADS.length,
    seededPlayers: IPL_2026_SQUADS.reduce((total, team) => total + team.players.length, 0),
    insertedPlayers: inserts.length,
    updatedPlayers: updates.length,
  };
}
