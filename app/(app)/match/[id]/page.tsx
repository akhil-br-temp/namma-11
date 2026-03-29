import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamBuilder } from "@/components/match/team-builder";

type MatchPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: leagueMemberships } = await supabase
    .from("league_members")
    .select("league_id, leagues(name)")
    .eq("user_id", user?.id ?? "")
    .order("joined_at", { ascending: false });

  const getLeagueName = (value: unknown): string => {
    if (Array.isArray(value)) {
      return (value[0] as { name?: string } | undefined)?.name ?? "Unnamed League";
    }

    return (value as { name?: string } | null)?.name ?? "Unnamed League";
  };

  const leagueOptions = (leagueMemberships ?? []).map((entry) => ({
    id: entry.league_id,
    name: getLeagueName(entry.leagues),
  }));

  return (
    <section className="space-y-3">
      {leagueOptions.length === 0 ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-bold text-slate-900">Team Builder</h2>
          <p className="mt-2 text-sm text-slate-600">Join or create a league before creating your fantasy team.</p>
        </article>
      ) : (
        <TeamBuilder matchId={id} leagueOptions={leagueOptions} />
      )}

      <Link href={`/match/${id}/live`} className="inline-flex rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-teal-50 hover:bg-teal-800">
        Open Live Tracker
      </Link>
    </section>
  );
}
