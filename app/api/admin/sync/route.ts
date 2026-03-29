import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runFixtureSync } from "@/lib/jobs/sync-fixtures";
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
    const squads = await runSquadSync();
    return NextResponse.json({ fixtures, squads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
