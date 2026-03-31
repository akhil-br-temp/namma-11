import { JoinLeagueForm } from "@/components/league/join-league-form";

export default function JoinLeaguePage() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="text-lg font-bold text-zinc-50">Join League</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-300">Enter your friend group&apos;s invite code to join instantly.</p>
      <JoinLeagueForm />
    </section>
  );
}
