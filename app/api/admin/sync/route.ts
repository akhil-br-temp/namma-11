import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runFixtureSync } from "@/lib/jobs/sync-fixtures";
import { runIplSquadSeed } from "@/lib/jobs/seed-ipl-squads";
import { buildSyncHealthReport } from "@/lib/jobs/sync-report";
import { runSquadSync } from "@/lib/jobs/sync-squads";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fixtures = await runFixtureSync();
    const seed = await runIplSquadSeed();
    const squads = await runSquadSync();
    const report = await buildSyncHealthReport().catch((reportError: unknown) => ({
      error: reportError instanceof Error ? reportError.message : "Failed to generate sync report",
    }));
    return NextResponse.json({ fixtures, seed, squads, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
