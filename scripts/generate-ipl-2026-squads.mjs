import { writeFile } from "node:fs/promises";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const TEAM_SOURCES = [
  { name: "Chennai Super Kings", shortName: "CSK", slug: "chennai-super-kings" },
  { name: "Delhi Capitals", shortName: "DC", slug: "delhi-capitals" },
  { name: "Gujarat Titans", shortName: "GT", slug: "gujarat-titans" },
  { name: "Kolkata Knight Riders", shortName: "KKR", slug: "kolkata-knight-riders" },
  { name: "Lucknow Super Giants", shortName: "LSG", slug: "lucknow-super-giants" },
  { name: "Mumbai Indians", shortName: "MI", slug: "mumbai-indians" },
  { name: "Punjab Kings", shortName: "PBKS", slug: "punjab-kings" },
  { name: "Rajasthan Royals", shortName: "RR", slug: "rajasthan-royals" },
  { name: "Royal Challengers Bengaluru", shortName: "RCB", slug: "royal-challengers-bengaluru" },
  { name: "Sunrisers Hyderabad", shortName: "SRH", slug: "sunrisers-hyderabad" },
];

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNationality(value) {
  const normalized = decodeHtml(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isOverseasFromNationality(nationality) {
  if (!nationality) return false;
  return !nationality.toLowerCase().includes("indian");
}

function roleFromCardHtml(cardHtml) {
  const lower = cardHtml.toLowerCase();

  if (lower.includes("teams-wicket-keeper-icon")) {
    return "WK";
  }
  if (lower.includes("teams-all-rounder-icon")) {
    return "AR";
  }
  if (lower.includes("teams-bowler-icon")) {
    return "BOWL";
  }

  return "BAT";
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  return response.text();
}

function parseSquadCards(html) {
  const cards = [];
  const regex = /<a[^>]*data-player_name="([^"]+)"[^>]*href="(https:\/\/www\.iplt20\.com\/players\/[^\/"\s]+\/([0-9]+))\s*"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawName = decodeHtml(match[1]);
    const profileUrl = decodeHtml(match[2]);
    const iplPlayerId = decodeHtml(match[3]);
    const cardHtml = match[4] ?? "";

    cards.push({
      name: rawName,
      role: roleFromCardHtml(cardHtml),
      profileUrl,
      iplPlayerId,
    });
  }

  const dedup = new Map();
  for (const card of cards) {
    const key = `${card.iplPlayerId}:${card.name.toLowerCase()}`;
    if (!dedup.has(key)) {
      dedup.set(key, card);
    }
  }

  return Array.from(dedup.values());
}

async function parsePlayerProfile(profileUrl) {
  const html = await fetchHtml(profileUrl);
  const match = html.match(/class="plyr-name-nationality"[\s\S]*?<span>\s*([^<]+?)\s*<\/span>/i);
  const nationality = normalizeNationality(match?.[1] ?? "");

  return {
    nationality,
    isOverseas: isOverseasFromNationality(nationality),
  };
}

async function run() {
  const generatedAt = new Date().toISOString();
  const nationalityCache = new Map();
  const teamPayload = [];

  for (const team of TEAM_SOURCES) {
    const sourceUrl = `https://www.iplt20.com/teams/${team.slug}/squad`;
    const squadHtml = await fetchHtml(sourceUrl);
    const cards = parseSquadCards(squadHtml);

    const players = [];

    for (const card of cards) {
      let nationalityData = nationalityCache.get(card.profileUrl);
      if (!nationalityData) {
        nationalityData = await parsePlayerProfile(card.profileUrl);
        nationalityCache.set(card.profileUrl, nationalityData);
      }

      players.push({
        name: card.name,
        role: card.role,
        iplPlayerId: card.iplPlayerId,
        profileUrl: card.profileUrl,
        nationality: nationalityData.nationality,
        isOverseas: nationalityData.isOverseas,
      });
    }

    teamPayload.push({
      name: team.name,
      shortName: team.shortName,
      sourceUrl,
      sourceUpdatedAt: generatedAt,
      players,
    });

    // Keep requests polite and reduce temporary blocking.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const payload = {
    season: 2026,
    sourceProvider: "iplt20",
    generatedAt,
    teams: teamPayload,
  };

  const output = `// Generated via scripts/generate-ipl-2026-squads.mjs\n\nexport type SeedRole = \"WK\" | \"BAT\" | \"AR\" | \"BOWL\";\n\nexport type SeedPlayer = {\n  name: string;\n  role: SeedRole;\n  iplPlayerId: string;\n  profileUrl: string;\n  nationality: string | null;\n  isOverseas: boolean;\n};\n\nexport type SeedTeam = {\n  name: string;\n  shortName: string;\n  sourceUrl: string;\n  sourceUpdatedAt: string;\n  players: SeedPlayer[];\n};\n\nexport const IPL_SEED_SEASON = ${payload.season} as const;\nexport const IPL_SEED_SOURCE_PROVIDER = \"${payload.sourceProvider}\" as const;\nexport const IPL_SEED_GENERATED_AT = \"${payload.generatedAt}\";\n\nexport const IPL_2026_SQUADS: SeedTeam[] = ${JSON.stringify(payload.teams, null, 2)};\n`;

  await writeFile("./lib/data/ipl-2026-squads.ts", output, "utf8");
  console.log(`Wrote ${teamPayload.length} teams to lib/data/ipl-2026-squads.ts`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
