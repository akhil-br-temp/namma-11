import { CreateLeagueForm } from "@/components/league/create-league-form";

export default function CreateLeaguePage() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="text-lg font-bold text-zinc-50">Create League</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-300">Start a private league and invite friends with a 6-character code.</p>
      <CreateLeagueForm />
    </section>
  );
}
