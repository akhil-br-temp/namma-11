import { NextResponse } from "next/server";
import { buildSyncHealthReport } from "@/lib/jobs/sync-report";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await buildSyncHealthReport();
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sync report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
