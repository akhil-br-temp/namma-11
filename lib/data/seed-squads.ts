import { IPL_2026_SQUADS, type SeedPlayer, type SeedRole, type SeedTeam } from "@/lib/data/ipl-2026-squads";

export type TeamIdentity = {
  name: string | null;
  short_name: string | null;
};

export type SeedSquadPlayer = {
  id: string;
  name: string;
  role: SeedRole;
  teamShortName: string;
  isOverseas: boolean;
};

function normalizeTeamKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const seedTeamByKey = (() => {
  const map = new Map<string, SeedTeam>();

  IPL_2026_SQUADS.forEach((team) => {
    const shortKey = normalizeTeamKey(team.shortName);
    const nameKey = normalizeTeamKey(team.name);

    if (shortKey) {
      map.set(shortKey, team);
    }

    if (nameKey) {
      map.set(nameKey, team);
    }
  });

  return map;
})();

function getSeedTeam(team: TeamIdentity | null | undefined): SeedTeam | null {
  if (!team) {
    return null;
  }

  const shortKey = normalizeTeamKey(team.short_name ?? "");
  const nameKey = normalizeTeamKey(team.name ?? "");

  return (shortKey ? seedTeamByKey.get(shortKey) : undefined) ?? (nameKey ? seedTeamByKey.get(nameKey) : undefined) ?? null;
}

export function getSeedSquadPlayersForTeams(teams: Array<TeamIdentity | null | undefined>): SeedSquadPlayer[] {
  const dedup = new Map<string, SeedSquadPlayer>();

  teams.forEach((team) => {
    const seedTeam = getSeedTeam(team);
    if (!seedTeam) {
      return;
    }

    seedTeam.players.forEach((player: SeedPlayer) => {
      const seedId = `seed-${seedTeam.shortName.toLowerCase()}-${player.iplPlayerId}`;
      dedup.set(seedId, {
        id: seedId,
        name: player.name,
        role: player.role,
        teamShortName: seedTeam.shortName,
        isOverseas: player.isOverseas,
      });
    });
  });

  return Array.from(dedup.values());
}

export function getSeedSquadCountForTeams(teamA: TeamIdentity | null | undefined, teamB: TeamIdentity | null | undefined): number {
  return getSeedSquadPlayersForTeams([teamA, teamB]).length;
}