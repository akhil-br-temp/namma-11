"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LiveScoreSummaryCard, type LiveScoreSummary } from "@/components/match/live-score-summary-card";

type LiveScoreStripResponse = {
  match: {
    status: string;
  };
  liveSummary: LiveScoreSummary | null;
  fetchedAt: string;
  error?: string;
};

function formatTime(value: string | null | undefined): string {
  if (!value) return "N/A";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function LiveScoreStrip({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LiveScoreStripResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      const response = await fetch(`/api/match/${matchId}/live`, { cache: "no-store" });
      const payload = (await response.json()) as LiveScoreStripResponse;

      if (!response.ok) {
        return;
      }

      setData(payload);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [matchId]);

  useEffect(() => {
    void loadData(false);

    const pollId = window.setInterval(() => {
      void loadData(true);
    }, 25000);

    return () => {
      window.clearInterval(pollId);
    };
  }, [loadData]);

  if (loading || !data?.liveSummary || data.match.status !== "live") {
    return null;
  }

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-zinc-50">Live Match Center</h2>
        <Link href={`/match/${matchId}/live`} className="rounded-lg border border-red-500/50 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10">
          Open detailed tracker
        </Link>
      </div>

      <LiveScoreSummaryCard summary={data.liveSummary} compact className="border-zinc-700" />

      <p className="mt-2 text-right text-xs text-zinc-400">Updated {formatTime(data.fetchedAt)}</p>
    </article>
  );
}
