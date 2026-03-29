import { ProviderLineup, ProviderLineupPlayer, ProviderMatch, ProviderResponse } from "@/lib/cricket-api/types";

type Dictionary = Record<string, unknown>;

type ProviderConfig = {
  name: "cricdata" | "entitysport";
  baseUrl: string;
  apiKey: string;
};

const REQUEST_TIMEOUT_MS = 10_000;

function normalizeStatus(statusValue: string): ProviderMatch["status"] {
  const status = statusValue.toLowerCase();

  if (status.includes("live")) {
    return "live";
  }
  if (status.includes("complete") || status.includes("result")) {
    return "completed";
  }
  if (status.includes("lineup")) {
    return "lineup_announced";
  }

  return "upcoming";
}

function parseDate(value: unknown): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toBooleanSafe(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "yes" || normalized === "1";
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return false;
}

function normalizeRole(value: unknown): ProviderLineupPlayer["role"] {
  const role = toStringSafe(value).toLowerCase();

  if (role.includes("wicket") || role === "wk") {
    return "WK";
  }
  if (role.includes("all") || role === "ar") {
    return "AR";
  }
  if (role.includes("bowl")) {
    return "BOWL";
  }

  return "BAT";
}

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function fallbackApiPlayerId(playerName: string, teamApiId: string | null): string {
  const teamToken = sanitizeToken(teamApiId ?? "unknown");
  const nameToken = sanitizeToken(playerName);
  return `derived-${teamToken}-${nameToken}`;
}

function extractArray(payload: unknown): Dictionary[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Dictionary;

  if (Array.isArray(root.data)) {
    return root.data.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }

  if (Array.isArray(root.matches)) {
    return root.matches.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }

  if (Array.isArray(root.response)) {
    return root.response.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  }

  return [];
}

function extractObject(payload: unknown): Dictionary | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as Dictionary;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    return root.data as Dictionary;
  }
  if (root.response && typeof root.response === "object" && !Array.isArray(root.response)) {
    return root.response as Dictionary;
  }

  return root;
}

function isLikelyIplTeamName(value: string): boolean {
  const name = value.toLowerCase();
  return (
    name.includes("mumbai indians") ||
    name.includes("chennai super kings") ||
    name.includes("royal challengers") ||
    name.includes("kolkata knight riders") ||
    name.includes("sunrisers") ||
    name.includes("gujarat titans") ||
    name.includes("delhi capitals") ||
    name.includes("punjab kings") ||
    name.includes("rajasthan royals") ||
    name.includes("lucknow super giants")
  );
}

function normalizeMatch(record: Dictionary, provider: "cricdata" | "entitysport"): ProviderMatch | null {
  const recordName = toStringSafe(record.name);
  const apiMatchId =
    toStringSafe(record.id) ||
    toStringSafe(record.match_id) ||
    toStringSafe(record.unique_id) ||
    toStringSafe(record.key);

  const teamInfo = Array.isArray(record.teamInfo)
    ? record.teamInfo.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null)
    : [];

  const firstTeamInfo = teamInfo[0];
  const secondTeamInfo = teamInfo[1];

  const nameVsParts = recordName.split(/\svs\s/i).map((part) => part.trim());

  const teamAName =
    toStringSafe(firstTeamInfo?.name) ||
    toStringSafe(record.teamA) ||
    toStringSafe(record.team_a) ||
    toStringSafe(record.team1) ||
    toStringSafe(record.team_1) ||
    toStringSafe(nameVsParts[0]);

  const teamBName =
    toStringSafe(secondTeamInfo?.name) ||
    toStringSafe(record.teamB) ||
    toStringSafe(record.team_b) ||
    toStringSafe(record.team2) ||
    toStringSafe(record.team_2) ||
    toStringSafe(nameVsParts[1]);

  if (!apiMatchId || !teamAName || !teamBName) {
    return null;
  }

  const teamAShort = teamAName
    .split(" ")
    .map((word) => word.at(0) ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();

  const teamBShort = teamBName
    .split(" ")
    .map((word) => word.at(0) ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();

  const matchDate = parseDate(record.dateTimeGMT ?? record.date_start ?? record.match_date ?? record.date);
  const status = normalizeStatus(toStringSafe(record.status, "upcoming"));
  const venue = toStringSafe(record.venue, "") || null;

  return {
    provider,
    apiMatchId,
    teamA: {
      id: toStringSafe(firstTeamInfo?.id) || toStringSafe(record.team_a_id) || teamAShort,
      name: teamAName,
      shortName: toStringSafe(firstTeamInfo?.shortname) || toStringSafe(firstTeamInfo?.shortName) || teamAShort,
    },
    teamB: {
      id: toStringSafe(secondTeamInfo?.id) || toStringSafe(record.team_b_id) || teamBShort,
      name: teamBName,
      shortName: toStringSafe(secondTeamInfo?.shortname) || toStringSafe(secondTeamInfo?.shortName) || teamBShort,
    },
    matchDate,
    venue,
    status,
  };
}

async function fetchWithRetry(url: string, retries: number): Promise<unknown> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      const knownError = error instanceof Error ? error : new Error("Unknown API error");
      lastError = knownError;
      attempt += 1;

      if (attempt > retries) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Failed to fetch provider data");
}

async function fetchFromProvider(config: ProviderConfig): Promise<ProviderResponse<ProviderMatch>> {
  const endpoint =
    config.name === "cricdata"
      ? `${config.baseUrl}/matches?apikey=${encodeURIComponent(config.apiKey)}&offset=0`
      : `${config.baseUrl}/matches?token=${encodeURIComponent(config.apiKey)}&per_page=50&series=ipl`;

  const payload = await fetchWithRetry(endpoint, 2);
  const rawMatches = extractArray(payload);
  const normalized = rawMatches
    .map((entry) => normalizeMatch(entry, config.name))
    .filter((entry): entry is ProviderMatch => entry !== null);

  const iplLikeMatches =
    config.name === "cricdata"
      ? normalized.filter((match) => isLikelyIplTeamName(match.teamA.name) || isLikelyIplTeamName(match.teamB.name))
      : normalized;

  return {
    provider: config.name,
    records: iplLikeMatches,
  };
}

async function fetchCricApiSeries(apiKey: string, search: string): Promise<Dictionary[]> {
  const endpoint = `https://api.cricapi.com/v1/series?apikey=${encodeURIComponent(apiKey)}&offset=0&search=${encodeURIComponent(search)}`;
  const payload = await fetchWithRetry(endpoint, 2);
  return extractArray(payload);
}

function findIpl2026SeriesId(seriesRows: Dictionary[]): string | null {
  const preferred = seriesRows.find((row) => {
    const name = toStringSafe(row.name).toLowerCase();
    return name.includes("indian premier league") && name.includes("2026");
  });

  if (preferred) {
    return toStringSafe(preferred.id) || null;
  }

  const fallback = seriesRows.find((row) => {
    const name = toStringSafe(row.name).toLowerCase();
    return name.includes("ipl") && name.includes("2026");
  });

  return fallback ? toStringSafe(fallback.id) || null : null;
}

async function fetchSeriesMatches(apiKey: string, seriesId: string): Promise<ProviderMatch[]> {
  const endpoint = `https://api.cricapi.com/v1/series_info?apikey=${encodeURIComponent(apiKey)}&offset=0&id=${encodeURIComponent(seriesId)}`;
  const payload = await fetchWithRetry(endpoint, 2);
  const details = extractObject(payload);

  if (!details) {
    return [];
  }

  const directMatchList = Array.isArray(details.matchList)
    ? details.matchList
    : Array.isArray(details.matches)
      ? details.matches
      : [];

  const rows = directMatchList.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);

  return rows
    .map((entry) => normalizeMatch(entry, "cricdata"))
    .filter((entry): entry is ProviderMatch => entry !== null);
}

async function fetchIpl2026ByPagination(apiKey: string): Promise<ProviderMatch[]> {
  const allMatches: ProviderMatch[] = [];

  for (let offset = 0; offset <= 400; offset += 25) {
    const endpoint = `https://api.cricapi.com/v1/matches?apikey=${encodeURIComponent(apiKey)}&offset=${offset}`;
    const payload = await fetchWithRetry(endpoint, 2);
    const rows = extractArray(payload);

    if (rows.length === 0) {
      break;
    }

    const normalized = rows
      .map((entry) => normalizeMatch(entry, "cricdata"))
      .filter((entry): entry is ProviderMatch => entry !== null);

    const filtered = normalized.filter((match) => {
      const year = new Date(match.matchDate).getUTCFullYear();
      return year === 2026 && (isLikelyIplTeamName(match.teamA.name) || isLikelyIplTeamName(match.teamB.name));
    });

    allMatches.push(...filtered);
  }

  const uniqueByApiId = new Map<string, ProviderMatch>();
  allMatches.forEach((match) => uniqueByApiId.set(match.apiMatchId, match));
  return Array.from(uniqueByApiId.values());
}

async function fetchIpl2026Matches(apiKey: string): Promise<ProviderMatch[]> {
  const seriesCandidates = ["IPL 2026", "Indian Premier League 2026", "IPL"];
  let seriesRows: Dictionary[] = [];

  for (const query of seriesCandidates) {
    const rows = await fetchCricApiSeries(apiKey, query);
    seriesRows = [...seriesRows, ...rows];
  }

  const seriesId = findIpl2026SeriesId(seriesRows);
  if (seriesId) {
    const bySeries = await fetchSeriesMatches(apiKey, seriesId);
    if (bySeries.length > 0) {
      return bySeries;
    }
  }

  return fetchIpl2026ByPagination(apiKey);
}

function normalizeLineupPlayers(records: Dictionary[]): ProviderLineupPlayer[] {
  const players: ProviderLineupPlayer[] = [];

  for (const entry of records) {
    const playerName =
      toStringSafe(entry.name) ||
      toStringSafe(entry.player_name) ||
      toStringSafe(entry.title);

    if (!playerName) {
      continue;
    }

    const teamApiId =
      toStringSafe(entry.team_id) ||
      toStringSafe(entry.teamId) ||
      toStringSafe(entry.team);

    const providedId =
      toStringSafe(entry.id) ||
      toStringSafe(entry.player_id) ||
      toStringSafe(entry.pid);

    players.push({
      apiPlayerId: providedId || fallbackApiPlayerId(playerName, teamApiId || null),
      name: playerName,
      role: normalizeRole(entry.role),
      teamApiId: teamApiId || null,
      isOverseas: toBooleanSafe(entry.is_overseas ?? entry.isOverseas),
    });
  }

  return players;
}

async function fetchPlayingXIFromProvider(config: ProviderConfig, apiMatchId: string): Promise<ProviderLineup> {
  const endpoint =
    config.name === "cricdata"
      ? `${config.baseUrl}/match_info?apikey=${encodeURIComponent(config.apiKey)}&id=${encodeURIComponent(apiMatchId)}`
      : `${config.baseUrl}/matches/${encodeURIComponent(apiMatchId)}/newpoint2?token=${encodeURIComponent(config.apiKey)}`;

  const payload = await fetchWithRetry(endpoint, 2);

  if (!payload || typeof payload !== "object") {
    return {
      provider: config.name,
      apiMatchId,
      announced: false,
      players: [],
    };
  }

  const root = payload as Dictionary;
  const responseNode = (root.data as Dictionary | undefined) ?? (root.response as Dictionary | undefined) ?? root;

  const rawPlayingXI =
    (Array.isArray(responseNode.playingXI) ? responseNode.playingXI : null) ||
    (Array.isArray(responseNode.playing_xi) ? responseNode.playing_xi : null) ||
    (Array.isArray(responseNode.team_a_playing_xi) ? responseNode.team_a_playing_xi : null) ||
    [];

  const playerRecords = rawPlayingXI.filter((entry): entry is Dictionary => typeof entry === "object" && entry !== null);
  const players = normalizeLineupPlayers(playerRecords);
  const announcedFromPayload =
    toBooleanSafe(responseNode.playing_xi_announced) ||
    toBooleanSafe(responseNode.lineup_announced) ||
    players.length >= 22;

  return {
    provider: config.name,
    apiMatchId,
    announced: announcedFromPayload,
    players,
  };
}

export async function getUpcomingMatches(): Promise<ProviderResponse<ProviderMatch>> {
  const cricdataKey = process.env.CRICDATA_API_KEY;
  const entitySportKey = process.env.ENTITY_SPORT_API_KEY;

  if (!cricdataKey && !entitySportKey) {
    throw new Error("Neither CRICDATA_API_KEY nor ENTITY_SPORT_API_KEY is configured");
  }

  const providers: ProviderConfig[] = [];

  if (cricdataKey) {
    providers.push({
      name: "cricdata",
      apiKey: cricdataKey,
      baseUrl: "https://api.cricapi.com/v1",
    });
  }

  if (entitySportKey) {
    providers.push({
      name: "entitysport",
      apiKey: entitySportKey,
      baseUrl: "https://rest.entitysport.com/v2",
    });
  }

  let lastError: Error | null = null;

  if (cricdataKey) {
    try {
      const matches = await fetchIpl2026Matches(cricdataKey);
      if (matches.length > 0) {
        return {
          provider: "cricdata",
          records: matches,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown CricketData series error");
    }
  }

  for (const provider of providers) {
    try {
      return await fetchFromProvider(provider);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown provider error");
    }
  }

  throw lastError ?? new Error("No provider responded successfully");
}

export async function getPlayingXI(apiMatchId: string): Promise<ProviderLineup> {
  const cricdataKey = process.env.CRICDATA_API_KEY;
  const entitySportKey = process.env.ENTITY_SPORT_API_KEY;

  if (!cricdataKey && !entitySportKey) {
    throw new Error("Neither CRICDATA_API_KEY nor ENTITY_SPORT_API_KEY is configured");
  }

  const providers: ProviderConfig[] = [];

  if (cricdataKey) {
    providers.push({
      name: "cricdata",
      apiKey: cricdataKey,
      baseUrl: "https://api.cricapi.com/v1",
    });
  }

  if (entitySportKey) {
    providers.push({
      name: "entitysport",
      apiKey: entitySportKey,
      baseUrl: "https://rest.entitysport.com/v2",
    });
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const result = await fetchPlayingXIFromProvider(provider, apiMatchId);
      if (result.announced || result.players.length > 0) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown provider lineup error");
    }
  }

  if (lastError) {
    throw lastError;
  }

  return {
    provider: providers[0]?.name ?? "cricdata",
    apiMatchId,
    announced: false,
    players: [],
  };
}
