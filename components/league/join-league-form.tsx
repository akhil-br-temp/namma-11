"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function JoinLeagueForm() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/leagues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode,
          displayName,
        }),
      });

      const payload = (await response.json()) as { error?: string; league?: { id: string } };

      if (!response.ok || !payload.league) {
        throw new Error(payload.error ?? "Failed to join league");
      }

      router.replace(`/league/${payload.league.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not join league");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-zinc-200">
        Invite code
        <input
          type="text"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
          className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2.5 text-sm uppercase tracking-[0.2em] outline-none ring-red-500 transition focus:ring-2"
          required
          minLength={6}
          maxLength={6}
        />
      </label>

      <label className="block text-sm font-medium text-zinc-200">
        Display name (optional)
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2.5 text-sm outline-none ring-red-500 transition focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
      >
        {loading ? "Joining..." : "Join league"}
      </button>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </form>
  );
}
