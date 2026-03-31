"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LiveScoreSummaryCard, type LiveScoreSummary } from "@/components/match/live-score-summary-card";

type LiveLeaderboardEntry = {
  userId: string;
  displayName: string;
  points: number;
  rank: number | null;
  isMe: boolean;
};

type LivePlayerEntry = {
  playerId: string;
  name: string;
  teamShortName: string;
  points: number;
};

type LiveLeagueSnapshot = {
  leagueId: string;
  leagueName: string;
  myTeamId: string;
  myTeamName: string;
  myPoints: number;
  myRank: number | null;
  updatedAt: string | null;
  leaderboard: LiveLeaderboardEntry[];
  players: LivePlayerEntry[];
};

type LiveMatchResponse = {
  match: {
    id: string;
    status: string;
    matchDate: string;
  };
  liveSummary: LiveScoreSummary | null;
  leagues: LiveLeagueSnapshot[];
  fetchedAt: string;
};

type Movement = {
  rankDelta: number | null;
  pointsDelta: number | null;
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

function toFixedOne(value: number): string {
  return Number(value ?? 0).toFixed(1);
}

function rankMovementLabel(delta: number | null): string {
  if (delta === null || delta === 0) return "No rank change";
  if (delta > 0) return `Up ${delta}`;
  return `Down ${Math.abs(delta)}`;
}

function pointsMovementLabel(delta: number | null): string {
  if (delta === null || delta === 0) return "0.0";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${toFixedOne(Math.abs(delta))}`;
}

function movementColor(delta: number | null, positiveIsGood = true): string {
  if (delta === null || delta === 0) return "text-zinc-400";
  const positiveTone = positiveIsGood ? "text-emerald-400" : "text-rose-400";
  const negativeTone = positiveIsGood ? "text-rose-400" : "text-emerald-400";
  return delta > 0 ? positiveTone : negativeTone;
}

function statusTone(status: string): string {
  if (status === "live") return "bg-rose-500/20 text-rose-400";
  if (status === "completed") return "bg-zinc-700 text-zinc-200";
  if (status === "lineup_announced") return "bg-amber-500/20 text-amber-200";
  return "bg-zinc-800 text-zinc-200";
}

export function LiveTracker({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LiveMatchResponse | null>(null);
  const [movementByLeague, setMovementByLeague] = useState<Record<string, Movement>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previousByLeagueRef = useRef<Map<string, { rank: number | null; points: number }>>(new Map());
  const mountedRef = useRef(true);

  const applyIncomingData = useCallback((nextData: LiveMatchResponse) => {
    const nextPrevious = new Map<string, { rank: number | null; points: number }>();
    const nextMovement: Record<string, Movement> = {};

    nextData.leagues.forEach((league) => {
      const previous = previousByLeagueRef.current.get(league.leagueId);

      nextMovement[league.leagueId] = {
        rankDelta:
          previous && previous.rank !== null && league.myRank !== null
            ? previous.rank - league.myRank
            : null,
        pointsDelta: previous ? Number((league.myPoints - previous.points).toFixed(1)) : null,
      };

      nextPrevious.set(league.leagueId, {
        rank: league.myRank,
        points: league.myPoints,
      });
    });

    previousByLeagueRef.current = nextPrevious;
    setMovementByLeague(nextMovement);
    setData(nextData);
  }, []);

  const loadData = useCallback(
    async (silent = false) => {
      if (!mountedRef.current) return;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(`/api/match/${matchId}/live`, { cache: "no-store" });
        const payload = (await response.json()) as LiveMatchResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load live tracker");
        }

        applyIncomingData(payload);
      } catch (loadError) {
        if (!mountedRef.current) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load live tracker");
      } finally {
        if (!mountedRef.current) return;
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [applyIncomingData, matchId]
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadData(false);

    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      void loadData(true);
    }, 25000);

    return () => {
      window.clearInterval(pollId);
    };
  }, [loadData]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-match-${matchId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_match_leaderboard", filter: `match_id=eq.${matchId}` },
        () => {
          void loadData(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fantasy_teams", filter: `match_id=eq.${matchId}` },
        () => {
          void loadData(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_players", filter: `match_id=eq.${matchId}` },
        () => {
          void loadData(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId, loadData]);

  const hasData = useMemo(() => Boolean(data && data.leagues.length > 0), [data]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-lg font-bold text-zinc-50">Live Points</h2>
        <p className="mt-2 text-sm text-zinc-300">Loading live scores...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <h2 className="text-lg font-bold text-rose-900">Live Points</h2>
        <p className="mt-2 text-sm text-rose-400">{error}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {data?.liveSummary ? <LiveScoreSummaryCard summary={data.liveSummary} /> : null}

      <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-zinc-50">Live Points</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(data?.match.status ?? "upcoming")}`}>
            {data?.match.status ?? "upcoming"}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-300">Match ID: {matchId}</p>
        <p className="mt-1 text-xs text-zinc-400">Kickoff: {formatTime(data?.match.matchDate)}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Last refresh: {formatTime(data?.fetchedAt)}
          {refreshing ? " (updating)" : ""}
        </p>
      </article>

      {!hasData ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-sm text-zinc-200">
            No fantasy team found for this match yet. Build your XI first to track live points and rank movement.
          </p>
          <Link href={`/match/${matchId}`} className="mt-3 inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Go To Team Builder
          </Link>
        </article>
      ) : null}

      {(data?.leagues ?? []).map((league) => {
        const movement = movementByLeague[league.leagueId] ?? { rankDelta: null, pointsDelta: null };

        return (
          <article key={league.leagueId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-zinc-50">{league.leagueName}</h3>
                <p className="text-xs text-zinc-400">Team: {league.myTeamName}</p>
              </div>
              <p className="text-right text-sm font-semibold text-zinc-200">Updated {formatTime(league.updatedAt)}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Your Points</p>
                <p className="text-lg font-bold text-zinc-50">{toFixedOne(league.myPoints)}</p>
                <p className={`text-xs font-semibold ${movementColor(movement.pointsDelta, true)}`}>
                  {pointsMovementLabel(movement.pointsDelta)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Your Rank</p>
                <p className="text-lg font-bold text-zinc-50">#{league.myRank ?? "-"}</p>
                <p className={`text-xs font-semibold ${movementColor(movement.rankDelta, true)}`}>
                  {rankMovementLabel(movement.rankDelta)}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">League Leaderboard</p>
              <ul className="mt-2 space-y-2">
                {league.leaderboard.slice(0, 6).map((entry) => (
                  <li
                    key={`${league.leagueId}-${entry.userId}`}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                      entry.isMe ? "border-red-500/40 bg-red-500/10" : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <p className="font-semibold text-zinc-50">
                      #{entry.rank ?? "-"} {entry.displayName}
                    </p>
                    <p className="font-bold text-zinc-50">{toFixedOne(entry.points)} pts</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Your Player Points</p>
              {league.players.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-300">No selected players found for this team.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {league.players.map((player) => (
                    <li key={`${league.myTeamId}-${player.playerId}`} className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2 text-sm">
                      <p className="font-medium text-zinc-100">
                        {player.name} <span className="text-xs text-zinc-400">({player.teamShortName})</span>
                      </p>
                      <p className="font-bold text-zinc-50">{toFixedOne(player.points)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}