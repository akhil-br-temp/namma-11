import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("matches")
      .select("id, api_match_id, match_date, venue, status, team_lock_time, team_a:ipl_teams!matches_team_a_id_fkey(name, short_name), team_b:ipl_teams!matches_team_b_id_fkey(name, short_name)")
      .order("match_date", { ascending: true })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({ matches: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch matches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
