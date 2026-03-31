import { IPL_SEED_SEASON } from "@/lib/data/ipl-2026-squads";
import { createAdminClient } from "@/lib/supabase/admin";

type TeamInfo = {
  name: string;
  short_name: string;
};

type PlayerRow = {
  id: string;
  name: string;
  api_player_id: string;
  normalized_name: string | null;
  ipl_team_id: string | null;
  seed_season: number | null;
  source_provider: string | null;
  team: TeamInfo | TeamInfo[] | null;
};

type DuplicateRiskPlayer = {
  id: string;
  name: string;
  apiPlayerId: string;
  sourceProvider: string | null;
  seedSeason: number | null;
};

export type DuplicateRiskGroup = {
  key: string;
  teamId: string | null;
  teamName: string;
  teamShortName: string;
  normalizedName: string;
  count: number;
  players: DuplicateRiskPlayer[];
};

export type SyncHealthReport = {
  generatedAt: string;
  season: number;
  mergeStats: {
    totalPlayers: number;
    seededSeasonRows: number;
    seededIdRows: number;
    providerRows: number;
    promotedSeedRows: number;
    unresolvedSeedRows: number;
    providerOnlyRows: number;
    unassignedProviderRows: number;
    duplicateRiskGroups: number;
    duplicateRiskRows: number;
  };
  duplicateRisk: DuplicateRiskGroup[];
};

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizePlayerName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function buildSyncHealthReport(limit = 25): Promise<SyncHealthReport> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("players")
    .select("id, name, api_player_id, normalized_name, ipl_team_id, seed_season, source_provider, team:ipl_teams!players_ipl_team_id_fkey(name, short_name)");

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlayerRow[];
  const seedPrefix = `seed-ipl-${IPL_SEED_SEASON}-`;

  let seededSeasonRows = 0;
  let seededIdRows = 0;
  let providerRows = 0;
  let promotedSeedRows = 0;
  let unresolvedSeedRows = 0;
  let providerOnlyRows = 0;
  let unassignedProviderRows = 0;

  const groupMap = new Map<
    string,
    {
      key: string;
      teamId: string | null;
      teamName: string;
      teamShortName: string;
      normalizedName: string;
      players: DuplicateRiskPlayer[];
    }
  >();

  rows.forEach((row) => {
    const team = firstObject(row.team);
    const normalizedName = row.normalized_name || normalizePlayerName(row.name);
    const teamId = row.ipl_team_id;
    const teamName = team?.name ?? "Unassigned";
    const teamShortName = team?.short_name ?? "NA";

    const key = `${teamId ?? "unassigned"}:${normalizedName}`;
    const current = groupMap.get(key) ?? {
      key,
      teamId,
      teamName,
      teamShortName,
      normalizedName,
      players: [],
    };

    current.players.push({
      id: row.id,
      name: row.name,
      apiPlayerId: row.api_player_id,
      sourceProvider: row.source_provider,
      seedSeason: row.seed_season,
    });
    groupMap.set(key, current);

    const isSeedId = row.api_player_id.startsWith(seedPrefix);
    const isSeededSeason = row.seed_season === IPL_SEED_SEASON;
    const isProviderRow = row.source_provider === "espn";

    if (isSeededSeason) seededSeasonRows += 1;
    if (isSeedId) seededIdRows += 1;
    if (isProviderRow) providerRows += 1;

    if (isProviderRow && !teamId) {
      unassignedProviderRows += 1;
    }

    if (isProviderRow && isSeededSeason && !isSeedId) {
      promotedSeedRows += 1;
    }

    if (isSeededSeason && isSeedId) {
      unresolvedSeedRows += 1;
    }

    if (isProviderRow && !isSeededSeason) {
      providerOnlyRows += 1;
    }
  });

  const duplicateGroupsAll = Array.from(groupMap.values())
    .filter((group) => group.players.length > 1)
    .map<DuplicateRiskGroup>((group) => ({
      key: group.key,
      teamId: group.teamId,
      teamName: group.teamName,
      teamShortName: group.teamShortName,
      normalizedName: group.normalizedName,
      count: group.players.length,
      players: group.players.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName) || a.normalizedName.localeCompare(b.normalizedName));

  const duplicateRiskRows = duplicateGroupsAll.reduce((sum, group) => sum + group.count, 0);

  return {
    generatedAt: new Date().toISOString(),
    season: IPL_SEED_SEASON,
    mergeStats: {
      totalPlayers: rows.length,
      seededSeasonRows,
      seededIdRows,
      providerRows,
      promotedSeedRows,
      unresolvedSeedRows,
      providerOnlyRows,
      unassignedProviderRows,
      duplicateRiskGroups: duplicateGroupsAll.length,
      duplicateRiskRows,
    },
    duplicateRisk: duplicateGroupsAll.slice(0, Math.max(1, limit)),
  };
}
