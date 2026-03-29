import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/api/cron-auth";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const nowIso = new Date().toISOString();
    const completedThresholdIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    // Promote matches to live when they pass start time.
    const { data: newlyLive, error: liveError } = await admin
      .from("matches")
      .update({ status: "live" })
      .lte("match_date", nowIso)
      .in("status", ["upcoming", "lineup_announced"])
      .select("id");

    if (liveError) {
      throw liveError;
    }

    // Mark older live matches as completed. This keeps the pipeline moving
    // even before ball-by-ball finalization is implemented.
    const { data: newlyCompleted, error: completedError } = await admin
      .from("matches")
      .update({ status: "completed" })
      .lt("match_date", completedThresholdIso)
      .eq("status", "live")
      .select("id");

    if (completedError) {
      throw completedError;
    }

    // Lock user teams as soon as lock time is reached.
    const { data: lockableMatches, error: lockableMatchesError } = await admin
      .from("matches")
      .select("id")
      .not("team_lock_time", "is", null)
      .lte("team_lock_time", nowIso);

    if (lockableMatchesError) {
      throw lockableMatchesError;
    }

    let lockedTeamsCount = 0;
    const lockableMatchIds = (lockableMatches ?? []).map((row) => row.id);
    if (lockableMatchIds.length > 0) {
      const { data: lockedTeams, error: lockError } = await admin
        .from("fantasy_teams")
        .update({ is_locked: true })
        .eq("is_locked", false)
        .in("match_id", lockableMatchIds)
        .select("id");

      if (lockError) {
        throw lockError;
      }

      lockedTeamsCount = lockedTeams?.length ?? 0;
    }

    return NextResponse.json({
      movedToLive: newlyLive?.length ?? 0,
      movedToCompleted: newlyCompleted?.length ?? 0,
      lockedTeams: lockedTeamsCount,
      note: "Match status pipeline ran. Detailed points polling will be added in scoring phase.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected live-score cron error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
