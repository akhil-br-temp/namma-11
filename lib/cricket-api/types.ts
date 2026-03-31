export type MatchStatus = "upcoming" | "lineup_announced" | "live" | "completed";

export type ProviderName = "espn";

export interface ProviderTeam {
  id: string;
  name: string;
  shortName: string;
}

export interface ProviderMatch {
  provider: ProviderName;
  apiMatchId: string;
  teamA: ProviderTeam;
  teamB: ProviderTeam;
  matchDate: string;
  venue: string | null;
  status: MatchStatus;
}

export interface ProviderResponse<T> {
  provider: ProviderName;
  records: T[];
}

export interface ProviderLineupPlayer {
  apiPlayerId: string | null;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  teamApiId: string | null;
  isOverseas: boolean;
}

export interface ProviderLineup {
  provider: ProviderName;
  apiMatchId: string;
  announced: boolean;
  players: ProviderLineupPlayer[];
}

export interface ProviderScorecard {
  provider: ProviderName;
  apiMatchId: string;
  payload: unknown;
}
