import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function generateInviteCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";

  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * chars.length);
    output += chars[index];
  }

  return output;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("league_members")
    .select("league_id, display_name, leagues(name, invite_code, created_by, is_active, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ leagues: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as { name?: string; displayName?: string };
  const name = payload.name?.trim();

  if (!name || name.length < 3) {
    return NextResponse.json({ error: "League name must be at least 3 characters" }, { status: 400 });
  }

  let inviteCode = generateInviteCode();
  let retries = 0;

  while (retries < 5) {
    const { data: existing } = await supabase
      .from("leagues")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle();

    if (!existing) {
      break;
    }

    inviteCode = generateInviteCode();
    retries += 1;
  }

  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .insert({
      name,
      invite_code: inviteCode,
      created_by: user.id,
    })
    .select("id, name, invite_code, created_at")
    .single();

  if (leagueError || !league) {
    return NextResponse.json({ error: leagueError?.message ?? "Unable to create league" }, { status: 500 });
  }

  const { error: memberError } = await supabase.from("league_members").insert({
    league_id: league.id,
    user_id: user.id,
    display_name: payload.displayName?.trim() || null,
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ league }, { status: 201 });
}
