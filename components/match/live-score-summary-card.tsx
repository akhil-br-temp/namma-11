import { cn } from "@/lib/utils";

export type LiveBatterSnapshot = {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isStriker: boolean;
};

export type LiveBowlerSnapshot = {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
};

export type LiveOverBallSnapshot = {
  ballLabel: string;
  outcome: string;
  runs: number;
  isWicket: boolean;
};

export type LiveOverSnapshot = {
  overNumber: number | null;
  runs: number;
  wickets: number;
  balls: LiveOverBallSnapshot[];
};

export type LiveScoreSummary = {
  battingTeamShortName: string;
  score: number;
  wickets: number;
  overs: string;
  target: number | null;
  requiredRuns: number | null;
  remainingBalls: number | null;
  currentRunRate: number | null;
  requiredRunRate: number | null;
  striker: LiveBatterSnapshot | null;
  nonStriker: LiveBatterSnapshot | null;
  currentBowler: LiveBowlerSnapshot | null;
  thisOver: LiveOverSnapshot | null;
};

type LiveScoreSummaryCardProps = {
  summary: LiveScoreSummary;
  className?: string;
  compact?: boolean;
};

function formatRate(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(2);
}

function formatEquation(summary: LiveScoreSummary): string {
  if (summary.requiredRuns === null || summary.remainingBalls === null) {
    return "Innings in progress";
  }

  if (summary.requiredRuns === 0) {
    return "Target reached";
  }

  return `Need ${summary.requiredRuns} from ${summary.remainingBalls} balls`;
}

function overBallTone(ball: LiveOverBallSnapshot): string {
  if (ball.isWicket || ball.outcome.includes("W")) {
    return "border-rose-400/40 bg-rose-500/20 text-rose-200";
  }

  if (ball.outcome.includes("6")) {
    return "border-emerald-400/40 bg-emerald-500/20 text-emerald-200";
  }

  if (ball.outcome.includes("4")) {
    return "border-cyan-400/40 bg-cyan-500/20 text-cyan-200";
  }

  if (ball.outcome.includes("Wd") || ball.outcome.includes("Nb") || ball.outcome.includes("lb") || ball.outcome.includes("b")) {
    return "border-amber-400/40 bg-amber-500/20 text-amber-200";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-200";
}

function BatterRow({ batter }: { batter: LiveBatterSnapshot }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-zinc-100">
          {batter.name}
          {batter.isStriker ? "*" : ""}
        </p>
        <p className="text-sm font-bold text-zinc-50">
          {batter.runs}
          <span className="text-zinc-400"> ({batter.balls})</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        4s {batter.fours} | 6s {batter.sixes} | SR {batter.strikeRate.toFixed(2)}
      </p>
    </div>
  );
}

export function LiveScoreSummaryCard({ summary, className, compact = false }: LiveScoreSummaryCardProps) {
  return (
    <article className={cn("rounded-2xl border border-zinc-800 bg-zinc-950 p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Live Score</p>
          <h3 className={cn("font-bold text-zinc-50", compact ? "text-lg" : "text-xl")}>
            {summary.battingTeamShortName} {summary.score}/{summary.wickets}
            <span className="ml-2 text-sm font-medium text-zinc-300">({summary.overs} ov)</span>
          </h3>
          <p className="mt-1 text-sm text-zinc-300">{formatEquation(summary)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-right">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400">CRR</p>
            <p className="text-sm font-semibold text-zinc-100">{formatRate(summary.currentRunRate)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400">RRR</p>
            <p className="text-sm font-semibold text-zinc-100">{formatRate(summary.requiredRunRate)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Current Batters</p>
          <div className="mt-2 space-y-2">
            {summary.striker ? <BatterRow batter={summary.striker} /> : null}
            {summary.nonStriker ? <BatterRow batter={summary.nonStriker} /> : null}
            {!summary.striker && !summary.nonStriker ? <p className="text-sm text-zinc-400">No active batters available yet.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Current Bowler</p>
          {summary.currentBowler ? (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-zinc-100">{summary.currentBowler.name}</p>
                <p className="text-sm font-bold text-zinc-50">
                  {summary.currentBowler.wickets}/{summary.currentBowler.runs}
                </p>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                Overs {summary.currentBowler.overs} | Maidens {summary.currentBowler.maidens} | Econ {summary.currentBowler.economy.toFixed(2)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">No active bowler available yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              This Over{summary.thisOver?.overNumber ? ` #${summary.thisOver.overNumber}` : ""}
            </p>
            {summary.thisOver ? (
              <p className="text-xs font-semibold text-zinc-300">
                {summary.thisOver.runs} runs{summary.thisOver.wickets > 0 ? `, ${summary.thisOver.wickets} wk` : ""}
              </p>
            ) : null}
          </div>

          {summary.thisOver?.balls.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.thisOver.balls.map((ball) => (
                <span key={ball.ballLabel} className={cn("inline-flex min-w-9 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold", overBallTone(ball))} title={ball.ballLabel}>
                  {ball.outcome}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">Waiting for over-by-over feed.</p>
          )}
        </div>
      </div>
    </article>
  );
}
