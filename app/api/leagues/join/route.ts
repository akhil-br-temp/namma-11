import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as { inviteCode?: string; displayName?: string };
  const inviteCode = payload.inviteCode?.trim().toUpperCase();

  if (!inviteCode) {
    return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
  }

  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id, name, invite_code")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (leagueError) {
    return NextResponse.json({ error: leagueError.message }, { status: 500 });
  }

  if (!league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  const { error: memberError } = await supabase.from("league_members").upsert(
    {
      league_id: league.id,
      user_id: user.id,
      display_name: payload.displayName?.trim() || null,
    },
    { onConflict: "league_id,user_id" }
  );

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ league });
}
