import { CreateLeagueForm } from "@/components/league/create-league-form";

export default function CreateLeaguePage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">Create League</h2>
      <p className="mb-4 mt-2 text-sm text-slate-600">Start a private league and invite friends with a 6-character code.</p>
      <CreateLeagueForm />
    </section>
  );
}
