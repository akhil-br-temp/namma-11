import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type LeaguePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LeaguePage({ params }: LeaguePageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id, name, invite_code")
    .eq("id", id)
    .maybeSingle();

  if (leagueError || !league) {
    notFound();
  }

  const { data: members } = await supabase
    .from("league_members")
    .select("display_name, user_id")
    .eq("league_id", id)
    .order("joined_at", { ascending: true });

  const memberNameByUserId = new Map<string, string>();
  (members ?? []).forEach((member) => {
    memberNameByUserId.set(member.user_id, member.display_name?.trim() || "League Member");
  });

  const { data: leaderboardRows } = await supabase
    .from("league_match_leaderboard")
    .select("user_id, match_id, total_points, rank, updated_at")
    .eq("league_id", id)
    .order("updated_at", { ascending: false })
    .limit(200);

  const latestMatchId = leaderboardRows?.[0]?.match_id ?? null;
  const latestLeaderboard = (leaderboardRows ?? [])
    .filter((entry) => entry.match_id === latestMatchId)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));

  return (
    <section className="space-y-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold text-slate-900">{league.name}</h2>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Invite code: {league.invite_code}</p>
        <p className="mt-2 text-sm text-slate-600">Live scoring is enabled. Rankings below refresh as score updates are synced.</p>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Live Leaderboard</h3>
        {latestLeaderboard.length === 0 ? <p className="mt-2 text-sm text-slate-600">No scored entries yet for this league.</p> : null}
        <ul className="mt-2 space-y-2">
          {latestLeaderboard.map((row) => (
            <li key={`${row.match_id}-${row.user_id}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <div>
                <p className="font-semibold text-slate-900">#{row.rank ?? "-"} {memberNameByUserId.get(row.user_id) ?? "League Member"}</p>
                <p className="text-xs text-slate-500">Match: {row.match_id}</p>
              </div>
              <p className="font-bold text-slate-900">{Number(row.total_points ?? 0).toFixed(1)} pts</p>
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Members</h3>
        <ul className="mt-2 space-y-2">
          {(members ?? []).map((member) => (
            <li key={member.user_id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              {member.display_name?.trim() || "League Member"}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
