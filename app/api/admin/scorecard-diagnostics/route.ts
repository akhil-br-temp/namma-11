import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { diagnoseScorecardMappings, ScoringMatchContext } from "@/lib/cricket-api/scorecard-adapter";
import { createAdminClient } from "@/lib/supabase/admin";

type MatchStatus = "upcoming" | "lineup_announced" | "live" | "completed";

type MatchRow = {
  id: string;
  api_match_id: string;
  status: MatchStatus;
  match_date: string;
  team_a: { name: string; short_name: string } | { name: string; short_name: string }[] | null;
  team_b: { name: string; short_name: string } | { name: string; short_name: string }[] | null;
};

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 30;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  if (rounded > 60) return 60;
  return rounded;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "30", 10);
  const limit = clampLimit(limitParam);

  const admin = createAdminClient();

  try {
    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .select(
        "id, api_match_id, status, match_date, team_a:ipl_teams!matches_team_a_id_fkey(name, short_name), team_b:ipl_teams!matches_team_b_id_fkey(name, short_name)"
      )
      .in("status", ["live", "lineup_announced", "completed"])
      .order("match_date", { ascending: false })
      .limit(limit);

    if (matchesError) {
      throw matchesError;
    }

    const contexts: ScoringMatchContext[] = [];
    const contextMeta: Array<{ matchId: string; status: MatchStatus; apiMatchId: string; matchDate: string }> = [];
    const skippedMatches: Array<{ matchId: string; apiMatchId: string; reason: string }> = [];

    for (const match of (matches ?? []) as MatchRow[]) {
      const teamA = firstObject(match.team_a);
      const teamB = firstObject(match.team_b);

      if (!teamA || !teamB) {
        skippedMatches.push({
          matchId: match.id,
          apiMatchId: match.api_match_id,
          reason: "Missing team relationship data",
        });
        continue;
      }

      contexts.push({
        apiMatchId: match.api_match_id,
        matchDate: match.match_date,
        teamAName: teamA.name,
        teamBName: teamB.name,
        teamAShortName: teamA.short_name,
        teamBShortName: teamB.short_name,
      });

      contextMeta.push({
        matchId: match.id,
        status: match.status,
        apiMatchId: match.api_match_id,
        matchDate: match.match_date,
      });
    }

    const diagnostics = await diagnoseScorecardMappings(contexts);

    const rows = diagnostics.map((diagnostic, index) => ({
      matchId: contextMeta[index]?.matchId ?? null,
      apiMatchId: contextMeta[index]?.apiMatchId ?? diagnostic.apiMatchId,
      status: contextMeta[index]?.status ?? null,
      matchDate: contextMeta[index]?.matchDate ?? diagnostic.matchDate,
      teamAName: diagnostic.teamAName,
      teamBName: diagnostic.teamBName,
      mapping: {
        matched: diagnostic.matched,
        confidence: diagnostic.confidence,
        selectedScorecardUrl: diagnostic.selectedScorecardUrl,
        selectedSourceMatchId: diagnostic.selectedSourceMatchId,
        selectedSourceObjectId: diagnostic.selectedSourceObjectId,
        timeDiffHours: diagnostic.timeDiffHours,
        candidateCount: diagnostic.candidateCount,
        topCandidates: diagnostic.topCandidates,
      },
    }));

    const summary = {
      matched: rows.filter((row) => row.mapping.matched).length,
      unmatched: rows.filter((row) => !row.mapping.matched).length,
      highConfidence: rows.filter((row) => row.mapping.confidence === "high").length,
      mediumConfidence: rows.filter((row) => row.mapping.confidence === "medium").length,
      lowConfidence: rows.filter((row) => row.mapping.confidence === "low").length,
      noConfidence: rows.filter((row) => row.mapping.confidence === "none").length,
      skipped: skippedMatches.length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      scannedMatches: (matches ?? []).length,
      diagnosableMatches: contexts.length,
      summary,
      diagnostics: rows,
      skippedMatches,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected scorecard diagnostics error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
