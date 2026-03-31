import { ProviderMatch, ProviderResponse, ProviderScorecard } from "@/lib/cricket-api/types";

type Dictionary = Record<string, unknown>;

const ESPN_BASE_URL = "https://www.espncricinfo.com";
const ESPN_LIVE_SCORE_URL = `${ESPN_BASE_URL}/live-cricket-score`;
const REQUEST_TIMEOUT_MS = 12_000;

export type ScrapedMatchListing = {
  sourceMatchId: string;
  sourceObjectId: string;
  seriesSlug: string;
  seriesObjectId: string;
  scorecardUrl: string;
  matchDateIso: string;
  status: ProviderMatch["status"];
  teamAName: string;
  teamAShortName: string;
  teamBName: string;
  teamBShortName: string;
};

function toStringSafe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumberSafe(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toBooleanSafe(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateToIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 999_999_999_999 ? value : value * 1000;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();

    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric)) {
      const millis = numeric > 999_999_999_999 ? numeric : numeric * 1000;
      const numericDate = new Date(millis);
      if (!Number.isNaN(numericDate.getTime())) return numericDate.toISOString();
    }
  }

  return null;
}

function readObject(value: unknown): Dictionary | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dictionary) : null;
}

function readObjectArray(value: unknown): Dictionary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
}

function mapStatus(rawState: string, rawStatusText: string): ProviderMatch["status"] {
  const state = rawState.trim().toLowerCase();
  const statusText = rawStatusText.trim().toLowerCase();

  if (state.includes("live") || statusText.includes("need") || statusText.includes("trail") || statusText.includes("lead")) {
    return "live";
  }

  if (
    state.includes("post") ||
    statusText.includes("won") ||
    statusText.includes("abandoned") ||
    statusText.includes("match drawn") ||
    statusText.includes("match tied") ||
    statusText.includes("no result")
  ) {
    return "completed";
  }

  return "upcoming";
}

function isIplSeries(series: Dictionary): boolean {
  const slug = normalizeText(toStringSafe(series.slug));
  const name = normalizeText(toStringSafe(series.name));
  const longName = normalizeText(toStringSafe(series.longName));
  const broadcast = normalizeText(toStringSafe(series.broadcastName));

  return (
    slug.includes("ipl") ||
    name.includes("indian premier league") ||
    longName.includes("indian premier league") ||
    broadcast.includes("indian premier league") ||
    name === "ipl"
  );
}

function buildScorecardUrl(seriesSlug: string, seriesObjectId: string, matchSlug: string, matchObjectId: string): string {
  return `${ESPN_BASE_URL}/series/${seriesSlug}-${seriesObjectId}/${matchSlug}-${matchObjectId}/live-cricket-score`;
}

function pickTeamName(teamNode: Dictionary): string {
  return (
    toStringSafe(teamNode.longName) ||
    toStringSafe(teamNode.name) ||
    toStringSafe(teamNode.abbreviation) ||
    toStringSafe(teamNode.shortName)
  );
}

function pickTeamShortName(teamNode: Dictionary, fallbackName: string): string {
  return (
    toStringSafe(teamNode.abbreviation) ||
    toStringSafe(teamNode.shortName) ||
    fallbackName
      .split(" ")
      .map((word) => word.at(0) ?? "")
      .join("")
      .slice(0, 3)
      .toUpperCase()
  );
}

function extractNextData(html: string): Dictionary {
  const scriptStart = html.indexOf('<script id="__NEXT_DATA__"');
  if (scriptStart < 0) {
    throw new Error("Unable to locate __NEXT_DATA__ script");
  }

  const scriptOpenEnd = html.indexOf(">", scriptStart);
  if (scriptOpenEnd < 0) {
    throw new Error("Malformed __NEXT_DATA__ script tag");
  }

  const scriptEnd = html.indexOf("</script>", scriptOpenEnd + 1);
  if (scriptEnd < 0) {
    throw new Error("Unable to locate end of __NEXT_DATA__ script");
  }

  const rawJson = html.slice(scriptOpenEnd + 1, scriptEnd);
  const parsed = JSON.parse(rawJson) as unknown;
  const parsedObject = readObject(parsed);
  if (!parsedObject) {
    throw new Error("Unexpected __NEXT_DATA__ payload shape");
  }
  return parsedObject;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Namma11Bot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function readLiveMatchRows(nextData: Dictionary): Dictionary[] {
  const props = readObject(nextData.props);
  if (!props) return [];

  const editionDetails = readObject(props.editionDetails);
  const trendingMatches = readObject(editionDetails?.trendingMatches);
  const rows = readObjectArray(trendingMatches?.matches);

  if (rows.length > 0) {
    return rows;
  }

  const appPageProps = readObject(props.appPageProps);
  const data = readObject(appPageProps?.data);
  const nestedData = readObject(data?.data);
  const content = readObject(nestedData?.content);
  return readObjectArray(content?.matches);
}

function validateMatchListingRows(rows: ScrapedMatchListing[]): ScrapedMatchListing[] {
  const deduped = new Map<string, ScrapedMatchListing>();

  rows.forEach((row) => {
    if (!row.scorecardUrl || !row.seriesSlug || !row.matchDateIso) {
      return;
    }

    const date = new Date(row.matchDateIso);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    if (!row.teamAName || !row.teamBName) {
      return;
    }

    deduped.set(row.scorecardUrl, row);
  });

  return Array.from(deduped.values());
}

export async function scrapeIplMatchList(): Promise<ScrapedMatchListing[]> {
  const html = await fetchHtml(ESPN_LIVE_SCORE_URL);
  const nextData = extractNextData(html);
  const rawRows = readLiveMatchRows(nextData);

  const listings: ScrapedMatchListing[] = [];

  for (const row of rawRows) {
    const series = readObject(row.series);
    if (!series || !isIplSeries(series)) {
      continue;
    }

    const teams = readObjectArray(row.teams);
    if (teams.length < 2) {
      continue;
    }

    const teamA = readObject(teams[0].team) ?? {};
    const teamB = readObject(teams[1].team) ?? {};

    const teamAName = pickTeamName(teamA);
    const teamBName = pickTeamName(teamB);
    if (!teamAName || !teamBName) {
      continue;
    }

    const matchDateIso = parseDateToIso(row.startDate ?? row.startTime ?? row.date);
    if (!matchDateIso) {
      continue;
    }

    const seriesSlug = toStringSafe(series.slug);
    const seriesObjectId = toStringSafe(series.objectId || series.id);
    const matchSlug = toStringSafe(row.slug);
    const matchObjectId = toStringSafe(row.objectId || row.id);
    const sourceMatchId = toStringSafe(row.id || row.objectId);

    if (!seriesSlug || !seriesObjectId || !matchSlug || !matchObjectId || !sourceMatchId) {
      continue;
    }

    listings.push({
      sourceMatchId,
      sourceObjectId: matchObjectId,
      seriesSlug,
      seriesObjectId,
      scorecardUrl: buildScorecardUrl(seriesSlug, seriesObjectId, matchSlug, matchObjectId),
      matchDateIso,
      status: mapStatus(toStringSafe(row.state), toStringSafe(row.statusText || row.status)),
      teamAName,
      teamAShortName: pickTeamShortName(teamA, teamAName),
      teamBName,
      teamBShortName: pickTeamShortName(teamB, teamBName),
    });
  }

  const validRows = validateMatchListingRows(listings);
  if (validRows.length === 0) {
    throw new Error("No valid IPL match rows found in live match-list scrape");
  }

  return validRows;
}

function pickPlayerNodeName(playerNode: Dictionary): string {
  return (
    toStringSafe(playerNode.longName) ||
    toStringSafe(playerNode.name) ||
    toStringSafe(playerNode.battingName) ||
    toStringSafe(playerNode.fieldingName)
  );
}

function normalizeBattingRow(row: Dictionary): Dictionary | null {
  const playerNode = readObject(row.player) ?? {};
  const name = pickPlayerNodeName(playerNode);
  if (!name) {
    return null;
  }

  const playerId = toStringSafe(playerNode.objectId || playerNode.id);
  const isOut = toBooleanSafe(row.isOut);
  const dismissalText = toStringSafe(row.dismissalText);

  return {
    id: playerId,
    playerId,
    name,
    runs: toNumberSafe(row.runs),
    balls: toNumberSafe(row.balls),
    fours: toNumberSafe(row.fours),
    sixes: toNumberSafe(row.sixes),
    strikeRate: toNumberSafe(row.strikerate),
    currentType: toNumberSafe(row.currentType),
    isOut,
    dismissal: isOut ? dismissalText || "out" : "not out",
  };
}

function normalizeBowlingRow(row: Dictionary): Dictionary | null {
  const playerNode = readObject(row.player) ?? {};
  const name = pickPlayerNodeName(playerNode);
  if (!name) {
    return null;
  }

  const playerId = toStringSafe(playerNode.objectId || playerNode.id);

  return {
    id: playerId,
    playerId,
    name,
    wickets: toNumberSafe(row.wickets),
    maidens: toNumberSafe(row.maidens),
    overs: toNumberSafe(row.overs),
    runsConceded: toNumberSafe(row.conceded),
    economy: toNumberSafe(row.economy),
    currentType: toNumberSafe(row.currentType),
  };
}

function normalizeOverBallRow(ball: Dictionary): Dictionary {
  return {
    overNumber: toNumberSafe(ball.overNumber),
    ballNumber: toNumberSafe(ball.ballNumber),
    totalRuns: toNumberSafe(ball.totalRuns),
    batsmanRuns: toNumberSafe(ball.batsmanRuns),
    isWicket: toBooleanSafe(ball.isWicket),
    wides: toNumberSafe(ball.wides),
    noballs: toNumberSafe(ball.noballs),
    byes: toNumberSafe(ball.byes),
    legbyes: toNumberSafe(ball.legbyes),
  };
}

function normalizeOverRow(over: Dictionary): Dictionary {
  return {
    overNumber: toNumberSafe(over.overNumber),
    overRuns: toNumberSafe(over.overRuns),
    overWickets: toNumberSafe(over.overWickets),
    isComplete: toBooleanSafe(over.isComplete),
    requiredRunRate: toNumberSafe(over.requiredRunRate),
    requiredRuns: toNumberSafe(over.requiredRuns),
    remainingBalls: toNumberSafe(over.remainingBalls),
    balls: readObjectArray(over.balls).map(normalizeOverBallRow),
  };
}

function normalizeInningRow(inning: Dictionary): Dictionary | null {
  const battingRows = readObjectArray(inning.inningBatsmen).map(normalizeBattingRow).filter((row): row is Dictionary => row !== null);
  const bowlingRows = readObjectArray(inning.inningBowlers).map(normalizeBowlingRow).filter((row): row is Dictionary => row !== null);
  const overRows = readObjectArray(inning.inningOvers).map(normalizeOverRow);
  const latestOver = overRows[overRows.length - 1] ?? null;

  if (battingRows.length === 0 && bowlingRows.length === 0) {
    return null;
  }

  return {
    inningNumber: toNumberSafe(inning.inningNumber),
    isCurrent: toBooleanSafe(inning.isCurrent),
    team: toStringSafe(readObject(inning.team)?.abbreviation) || toStringSafe(readObject(inning.team)?.name),
    runs: toNumberSafe(inning.runs),
    wickets: toNumberSafe(inning.wickets),
    overs: toNumberSafe(inning.overs),
    balls: toNumberSafe(inning.balls),
    target: toNumberSafe(inning.target),
    totalOvers: toNumberSafe(inning.totalOvers),
    totalBalls: toNumberSafe(inning.totalBalls),
    ballsPerOver: toNumberSafe(inning.ballsPerOver),
    requiredRunRate: latestOver ? toNumberSafe(latestOver.requiredRunRate) : 0,
    requiredRuns: latestOver ? toNumberSafe(latestOver.requiredRuns) : 0,
    remainingBalls: latestOver ? toNumberSafe(latestOver.remainingBalls) : 0,
    batting: battingRows,
    bowling: bowlingRows,
    inningOvers: overRows,
    latestOver,
  };
}

function validateScorecardPayload(innings: Dictionary[]): void {
  if (innings.length === 0) {
    throw new Error("Scorecard scrape validation failed: innings list is empty");
  }

  const totalBatRows = innings.reduce((sum, inning) => sum + readObjectArray(inning.batting).length, 0);
  const totalBowlRows = innings.reduce((sum, inning) => sum + readObjectArray(inning.bowling).length, 0);

  if (totalBatRows === 0 && totalBowlRows === 0) {
    throw new Error("Scorecard scrape validation failed: no batting or bowling rows found");
  }
}

export async function scrapeMatchScorecardFromUrl(scorecardUrl: string, apiMatchId: string): Promise<ProviderScorecard> {
  const html = await fetchHtml(scorecardUrl);
  const nextData = extractNextData(html);
  const props = readObject(nextData.props);
  const appPageProps = readObject(props?.appPageProps);
  const data = readObject(appPageProps?.data);
  const nestedData = readObject(data?.data);
  const content = readObject(nestedData?.content);

  const inningsRows = readObjectArray(content?.innings).map(normalizeInningRow).filter((row): row is Dictionary => row !== null);
  validateScorecardPayload(inningsRows);

  return {
    provider: "espn",
    apiMatchId,
    payload: {
      source: "espn",
      scorecardUrl,
      scrapedAt: new Date().toISOString(),
      data: {
        innings: inningsRows,
      },
    },
  };
}

export async function getUpcomingMatchesFromWeb(): Promise<ProviderResponse<ProviderMatch>> {
  const listings = await scrapeIplMatchList();

  const records: ProviderMatch[] = listings.map((listing) => ({
    provider: "espn",
    apiMatchId: listing.sourceObjectId,
    teamA: {
      id: normalizeText(listing.teamAShortName).replace(/\s+/g, "") || normalizeText(listing.teamAName).replace(/\s+/g, ""),
      name: listing.teamAName,
      shortName: listing.teamAShortName,
    },
    teamB: {
      id: normalizeText(listing.teamBShortName).replace(/\s+/g, "") || normalizeText(listing.teamBName).replace(/\s+/g, ""),
      name: listing.teamBName,
      shortName: listing.teamBShortName,
    },
    matchDate: listing.matchDateIso,
    venue: null,
    status: listing.status,
  }));

  return {
    provider: "espn",
    records,
  };
}