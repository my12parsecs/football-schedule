import type { League, LeagueCode } from "./types";

/**
 * The five first divisions, keyed by football-data.org competition code.
 * All five are available on the provider's free tier.
 */
export const LEAGUES: League[] = [
  { code: "PL", name: "Premier League", country: "England", accent: "#9b5de5" },
  { code: "PD", name: "La Liga", country: "Spain", accent: "#ff5a5f" },
  { code: "SA", name: "Serie A", country: "Italy", accent: "#3b82f6" },
  { code: "BL1", name: "Bundesliga", country: "Germany", accent: "#f43f5e" },
  { code: "FL1", name: "Ligue 1", country: "France", accent: "#14b8a6" },
];

export const LEAGUE_CODES: LeagueCode[] = LEAGUES.map((l) => l.code);

const BY_CODE = new Map<string, League>(LEAGUES.map((l) => [l.code, l]));

export function getLeague(code: string): League | undefined {
  return BY_CODE.get(code);
}

export function isLeagueCode(value: string): value is LeagueCode {
  return BY_CODE.has(value);
}

/**
 * How many matches to show per club, in each direction.
 *
 * This counts matches rather than days on purpose: a symmetric date window
 * goes completely empty on the past side during an international break, which
 * happens several times a season. Counting fixtures just reaches further back.
 */
export const MATCH_COUNT_OPTIONS = [5, 10, 20] as const;
export type MatchCount = (typeof MATCH_COUNT_OPTIONS)[number];
export const DEFAULT_MATCH_COUNT: MatchCount = 10;

export function isMatchCount(value: unknown): value is MatchCount {
  return MATCH_COUNT_OPTIONS.includes(value as MatchCount);
}
