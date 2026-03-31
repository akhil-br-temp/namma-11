"use client";

import { useState } from "react";

type SyncPayload = {
  fixtures?: { syncedTeams?: number; syncedMatches?: number };
  seed?: { insertedPlayers?: number; updatedPlayers?: number };
  squadSyncWarning?: string | null;
  squads?: {
    syncedMatches?: number;
    upsertedPlayers?: number;
    upsertedMatchPlayers?: number;
    preloadedMatches?: number;
    preloadedMatchPlayers?: number;
    promotedSeededPlayers?: number;
  };
  report?: {
    mergeStats?: {
      duplicateRiskGroups?: number;
      unresolvedSeedRows?: number;
      promotedSeedRows?: number;
    };
  } | { error?: string };
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
      const seed = payload.seed;
      const squads = payload.squads;
      const report = payload.report && "mergeStats" in payload.report ? payload.report.mergeStats : undefined;

      const providerSyncSummary = squads
        ? `${squads.upsertedPlayers ?? 0} provider upserts, ${squads.promotedSeededPlayers ?? report?.promotedSeedRows ?? 0} promoted seed rows`
        : "provider squad sync skipped";

      const warningSuffix = payload.squadSyncWarning ? ` Provider sync warning: ${payload.squadSyncWarning}.` : "";

      setMessage(
        `Sync complete: ${fixtures?.syncedMatches ?? 0} fixtures, ${seed?.insertedPlayers ?? 0} seeded inserts, ${
          seed?.updatedPlayers ?? 0
        } seeded updates, ${providerSyncSummary}, ${report?.duplicateRiskGroups ?? 0} duplicate-risk groups, ${
          report?.unresolvedSeedRows ?? 0
        } unresolved seed IDs.${warningSuffix}`
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-50">Manual Data Sync</h3>
          <p className="text-xs text-zinc-300">Refresh fixtures and seeded squads immediately (requires logged-in user).</p>
        </div>
        <button
          type="button"
          onClick={triggerSync}
          disabled={syncing}
          className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? "Syncing..." : "Sync now"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
