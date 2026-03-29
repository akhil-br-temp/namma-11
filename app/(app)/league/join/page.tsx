import { JoinLeagueForm } from "@/components/league/join-league-form";

export default function JoinLeaguePage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">Join League</h2>
      <p className="mb-4 mt-2 text-sm text-slate-600">Enter your friend group&apos;s invite code to join instantly.</p>
      <JoinLeagueForm />
    </section>
  );
}
