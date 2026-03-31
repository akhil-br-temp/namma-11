import { createAdminClient } from "@/lib/supabase/admin";
import { getUpcomingMatchesFromWeb } from "@/lib/cricket-api/web-scraper";

type TeamRow = {
  name: string;
  short_name: string;
  api_team_id: string;
};

function getShortName(name: string): string {
  return (
    name
      .split(" ")
      .map((word) => word.at(0) ?? "")
      .join("")
      .slice(0, 3)
      .toUpperCase() || name.slice(0, 3).toUpperCase()
  );
}

export async function runFixtureSync() {
  const providerResult = await getUpcomingMatchesFromWeb();
  const admin = createAdminClient();

  const teamsByApiId = new Map<string, TeamRow>();

  for (const match of providerResult.records) {
    teamsByApiId.set(match.teamA.id, {
      name: match.teamA.name,
      short_name: match.teamA.shortName || getShortName(match.teamA.name),
      api_team_id: match.teamA.id,
    });
    teamsByApiId.set(match.teamB.id, {
      name: match.teamB.name,
      short_name: match.teamB.shortName || getShortName(match.teamB.name),
      api_team_id: match.teamB.id,
    });
  }

  const teams = Array.from(teamsByApiId.values());
  const teamIds = Array.from(teamsByApiId.keys());

  const { data: existingTeams, error: existingTeamError } = await admin
    .from("ipl_teams")
    .select("id, api_team_id")
    .in("api_team_id", teamIds);

  if (existingTeamError) {
    throw existingTeamError;
  }

  const existingTeamIdSet = new Set((existingTeams ?? []).map((team: { api_team_id: string }) => team.api_team_id));
  const missingTeams = teams.filter((team) => !existingTeamIdSet.has(team.api_team_id));

  if (missingTeams.length > 0) {
    const { error: insertTeamError } = await admin.from("ipl_teams").insert(missingTeams);
    if (insertTeamError) {
      throw insertTeamError;
    }
  }

  const { data: savedTeams, error: teamFetchError } = await admin
    .from("ipl_teams")
    .select("id, api_team_id")
    .in("api_team_id", teamIds);

  if (teamFetchError) {
    throw teamFetchError;
  }

  const teamMap = new Map<string, string>();
  (savedTeams ?? []).forEach((team: { id: string; api_team_id: string }) => {
    teamMap.set(team.api_team_id, team.id);
  });

  const matchRows = providerResult.records
    .map((match) => {
      const teamAId = teamMap.get(match.teamA.id);
      const teamBId = teamMap.get(match.teamB.id);

      if (!teamAId || !teamBId) {
        return null;
      }

      return {
        api_match_id: match.apiMatchId,
        team_a_id: teamAId,
        team_b_id: teamBId,
        match_date: match.matchDate,
        venue: match.venue,
        status: match.status,
        team_lock_time: null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (matchRows.length > 0) {
    const { error: matchError } = await admin
      .from("matches")
      .upsert(matchRows, { onConflict: "api_match_id" });

    if (matchError) {
      throw matchError;
    }
  }

  return {
    provider: providerResult.provider,
    syncedTeams: teams.length,
    syncedMatches: matchRows.length,
  };
}
