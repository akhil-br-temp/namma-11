import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUpcomingMatches } from "@/lib/cricket-api/cricdata";
import { isCronAuthorized } from "@/lib/api/cron-auth";

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

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const providerResult = await getUpcomingMatches();
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

    if (teams.length > 0) {
      const { error: teamError } = await admin
        .from("ipl_teams")
        .upsert(teams, { onConflict: "api_team_id" });

      if (teamError) {
        throw teamError;
      }
    }

    const teamIds = Array.from(teamsByApiId.keys());
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

    return NextResponse.json({
      provider: providerResult.provider,
      syncedTeams: teams.length,
      syncedMatches: matchRows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
