import { getMatchScorecard } from "@/lib/cricket-api/cricdata";
import { ProviderScorecard } from "@/lib/cricket-api/types";
import { ScrapedMatchListing, scrapeIplMatchList, scrapeMatchScorecardFromUrl } from "@/lib/cricket-api/web-scraper";

type ScoringMatchContext = {
  apiMatchId: string;
  matchDate: string;
  teamAName: string;
  teamBName: string;
  teamAShortName?: string | null;
  teamBShortName?: string | null;
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

function resolveMatchList(rows: ScrapedMatchListing[], context: ScoringMatchContext): ScrapedMatchListing | null {
  const teamAOptions = [context.teamAName, context.teamAShortName ?? ""].filter((value): value is string => Boolean(value));
  const teamBOptions = [context.teamBName, context.teamBShortName ?? ""].filter((value): value is string => Boolean(value));

  const wantedA = new Set(teamAOptions.map(teamToken));
  const wantedB = new Set(teamBOptions.map(teamToken));

  const scored = rows
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
      };
    })
    .filter((entry): entry is { row: ScrapedMatchListing; diffHours: number; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score);

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

export async function getMatchScorecardForScoring(context: ScoringMatchContext): Promise<ProviderScorecard> {
  try {
    const listings = await getCachedMatchList();
    const matched = resolveMatchList(listings, context);

    if (!matched) {
      throw new Error(
        `No scraped match-list candidate found for ${context.teamAName} vs ${context.teamBName} on ${context.matchDate}`
      );
    }

    return await scrapeMatchScorecardFromUrl(matched.scorecardUrl, context.apiMatchId);
  } catch (webError) {
    const fallbackDisabled = process.env.SCORECARD_API_FALLBACK_DISABLED === "1";
    if (fallbackDisabled) {
      const message = webError instanceof Error ? webError.message : "Unknown web scorecard scrape error";
      throw new Error(`Web scorecard flow failed and API fallback is disabled: ${message}`);
    }

    return await getMatchScorecard(context.apiMatchId);
  }
}
