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

  return (
    <section className="space-y-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold text-slate-900">{league.name}</h2>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Invite code: {league.invite_code}</p>
        <p className="mt-2 text-sm text-slate-600">Leaderboard scoring will connect after fantasy team and point pipelines are wired.</p>
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
