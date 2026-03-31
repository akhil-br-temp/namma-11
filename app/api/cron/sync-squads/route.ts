import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { runIplSquadSeed } from "@/lib/jobs/seed-ipl-squads";
import { runSquadSync } from "@/lib/jobs/sync-squads";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const seed = await runIplSquadSeed();
    const squads = await runSquadSync();
    return NextResponse.json({ seed, squads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected squad sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
