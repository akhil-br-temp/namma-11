"use client";

import { useState } from "react";

type SyncPayload = {
  fixtures?: { syncedTeams?: number; syncedMatches?: number };
  squads?: { syncedMatches?: number; upsertedPlayers?: number; upsertedMatchPlayers?: number };
  error?: string;
};

export function ManualSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerSync = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json()) as SyncPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Sync failed");
      }

      const fixtures = payload.fixtures;
      const squads = payload.squads;

      setMessage(
        `Sync complete: ${fixtures?.syncedMatches ?? 0} fixtures, ${squads?.upsertedPlayers ?? 0} players, ${
          squads?.upsertedMatchPlayers ?? 0
        } match-player rows.`
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Manual Data Sync</h3>
          <p className="text-xs text-slate-600">Refresh fixtures and squads immediately (requires logged-in user).</p>
        </div>
        <button
          type="button"
          onClick={triggerSync}
          disabled={syncing}
          className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? "Syncing..." : "Sync now"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
