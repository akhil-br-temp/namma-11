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
      <label className="block text-sm font-medium text-slate-700">
        League name
        <input
          type="text"
          value={leagueName}
          onChange={(event) => setLeagueName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-teal-600 transition focus:ring-2"
          required
          minLength={3}
        />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Display name (optional)
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-teal-600 transition focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-teal-50 transition hover:bg-teal-800 disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create league"}
      </button>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </form>
  );
}
