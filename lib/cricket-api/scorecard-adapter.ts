import { ProviderScorecard } from "@/lib/cricket-api/types";
import { ScrapedMatchListing, scrapeIplMatchList, scrapeMatchScorecardFromUrl } from "@/lib/cricket-api/web-scraper";

export type ScoringMatchContext = {
  apiMatchId: string;
  matchDate: string;
  teamAName: string;
  teamBName: string;
  teamAShortName?: string | null;
  teamBShortName?: string | null;
};

type MappingCandidate = {
  row: ScrapedMatchListing;
  diffHours: number;
  score: number;
  directOrderMatch: boolean;
};

export type ScorecardMappingDiagnostic = {
  apiMatchId: string;
  teamAName: string;
  teamBName: string;
  matchDate: string;
  selectedScorecardUrl: string | null;
  selectedSourceMatchId: string | null;
  selectedSourceObjectId: string | null;
  matched: boolean;
  confidence: "high" | "medium" | "low" | "none";
  timeDiffHours: number | null;
  candidateCount: number;
  topCandidates: Array<{
    scorecardUrl: string;
    sourceMatchId: string;
    sourceObjectId: string;
    matchDateIso: string;
    timeDiffHours: number;
    directOrderMatch: boolean;
  }>;
};

type MatchListCache = {
  expiresAt: number;
  rows: ScrapedMatchListing[];
};

let matchListCache: MatchListCache | null = null;

const MATCH_LIST_TTL_MS = 60_000;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamToken(value: string): string {
  const normalized = normalizeText(value);

  if (normalized.includes("mumbai indians") || normalized === "mi") return "mi";
  if (normalized.includes("chennai super kings") || normalized === "csk") return "csk";
  if (normalized.includes("royal challengers") || normalized === "rcb") return "rcb";
  if (normalized.includes("kolkata knight riders") || normalized === "kkr") return "kkr";
  if (normalized.includes("sunrisers") || normalized === "srh") return "srh";
  if (normalized.includes("gujarat titans") || normalized === "gt") return "gt";
  if (normalized.includes("delhi capitals") || normalized === "dc") return "dc";
  if (normalized.includes("punjab kings") || normalized === "pbks" || normalized === "kings xi punjab") return "pbks";
  if (normalized.includes("rajasthan royals") || normalized === "rr") return "rr";
  if (normalized.includes("lucknow super giants") || normalized === "lsg") return "lsg";

  return normalized.replace(/\s+/g, "");
}

function dateDiffHours(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / (1000 * 60 * 60);
}

function mappingConfidence(diffHours: number | null): ScorecardMappingDiagnostic["confidence"] {
  if (diffHours === null || !Number.isFinite(diffHours)) return "none";
  if (diffHours <= 1) return "high";
  if (diffHours <= 6) return "medium";
  if (diffHours <= 24) return "low";
  return "none";
}

function buildMatchCandidates(rows: ScrapedMatchListing[], context: ScoringMatchContext): MappingCandidate[] {
  const teamAOptions = [context.teamAName, context.teamAShortName ?? ""].filter((value): value is string => Boolean(value));
  const teamBOptions = [context.teamBName, context.teamBShortName ?? ""].filter((value): value is string => Boolean(value));

  const wantedA = new Set(teamAOptions.map(teamToken));
  const wantedB = new Set(teamBOptions.map(teamToken));

  return rows
    .map((row) => {
      const rowA = teamToken(row.teamAName);
      const rowB = teamToken(row.teamBName);
      const directMatch = wantedA.has(rowA) && wantedB.has(rowB);
      const reverseMatch = wantedA.has(rowB) && wantedB.has(rowA);

      if (!directMatch && !reverseMatch) {
        return null;
      }

      const diffHours = dateDiffHours(context.matchDate, row.matchDateIso);
      return {
        row,
        diffHours,
        score: diffHours,
        directOrderMatch: directMatch,
      };
    })
    .filter((entry): entry is MappingCandidate => entry !== null)
    .sort((a, b) => a.score - b.score);
}

function resolveMatchList(rows: ScrapedMatchListing[], context: ScoringMatchContext): ScrapedMatchListing | null {
  const scored = buildMatchCandidates(rows, context);

  const best = scored[0];
  if (!best) {
    return null;
  }

  if (best.diffHours > 36) {
    return null;
  }

  return best.row;
}

async function getCachedMatchList(): Promise<ScrapedMatchListing[]> {
  const now = Date.now();
  if (matchListCache && matchListCache.expiresAt > now) {
    return matchListCache.rows;
  }

  const rows = await scrapeIplMatchList();
  matchListCache = {
    rows,
    expiresAt: now + MATCH_LIST_TTL_MS,
  };

  return rows;
}

function buildMappingDiagnostic(rows: ScrapedMatchListing[], context: ScoringMatchContext): ScorecardMappingDiagnostic {
  const candidates = buildMatchCandidates(rows, context);
  const selected = candidates[0] ?? null;
  const selectedWithinThreshold = selected !== null && selected.diffHours <= 36;
  const selectedDiff = selectedWithinThreshold ? selected.diffHours : null;

  return {
    apiMatchId: context.apiMatchId,
    teamAName: context.teamAName,
    teamBName: context.teamBName,
    matchDate: context.matchDate,
    selectedScorecardUrl: selectedWithinThreshold ? selected.row.scorecardUrl : null,
    selectedSourceMatchId: selectedWithinThreshold ? selected.row.sourceMatchId : null,
    selectedSourceObjectId: selectedWithinThreshold ? selected.row.sourceObjectId : null,
    matched: selectedWithinThreshold,
    confidence: mappingConfidence(selectedDiff),
    timeDiffHours: selectedDiff,
    candidateCount: candidates.length,
    topCandidates: candidates.slice(0, 3).map((candidate) => ({
      scorecardUrl: candidate.row.scorecardUrl,
      sourceMatchId: candidate.row.sourceMatchId,
      sourceObjectId: candidate.row.sourceObjectId,
      matchDateIso: candidate.row.matchDateIso,
      timeDiffHours: candidate.diffHours,
      directOrderMatch: candidate.directOrderMatch,
    })),
  };
}

export async function diagnoseScorecardMapping(context: ScoringMatchContext): Promise<ScorecardMappingDiagnostic> {
  const listings = await getCachedMatchList();
  return buildMappingDiagnostic(listings, context);
}

export async function diagnoseScorecardMappings(
  contexts: ScoringMatchContext[]
): Promise<ScorecardMappingDiagnostic[]> {
  const listings = await getCachedMatchList();
  return contexts.map((context) => buildMappingDiagnostic(listings, context));
}

export async function getMatchScorecardForScoring(context: ScoringMatchContext): Promise<ProviderScorecard> {
  const listings = await getCachedMatchList();
  const matched = resolveMatchList(listings, context);

  if (!matched) {
    throw new Error(
      `No scraped match-list candidate found for ${context.teamAName} vs ${context.teamBName} on ${context.matchDate}`
    );
  }

  return await scrapeMatchScorecardFromUrl(matched.scorecardUrl, context.apiMatchId);
}
