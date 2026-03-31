"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CreateLeagueForm() {
  const router = useRouter();
  const [leagueName, setLeagueName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leagueName,
          displayName,
        }),
      });

      const payload = (await response.json()) as { error?: string; league?: { id: string } };

      if (!response.ok || !payload.league) {
        throw new Error(payload.error ?? "Failed to create league");
      }

      router.replace(`/league/${payload.league.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create league");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-zinc-200">
        League name
        <input
          type="text"
          value={leagueName}
          onChange={(event) => setLeagueName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2.5 text-sm outline-none ring-red-500 transition focus:ring-2"
          required
          minLength={3}
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
        {loading ? "Creating..." : "Create league"}
      </button>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </form>
  );
}
