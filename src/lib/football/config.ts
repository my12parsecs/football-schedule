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

export interface Competition {
  code: string;
  name: string;
  accent: string;
}

/** Common cup and European competitions supported by football-data.org. */
export const CUP_COMPETITIONS: Competition[] = [
  { code: "FAC", name: "FA Cup", accent: "#ef4444" },
  { code: "FLC", name: "Carabao Cup", accent: "#dc2626" },
  { code: "CDR", name: "Copa del Rey", accent: "#f59e0b" },
  { code: "CIT", name: "Coppa Italia", accent: "#0ea5e9" },
  { code: "DFB", name: "DFB-Pokal", accent: "#7c3aed" },
  { code: "CDF", name: "Coupe de France", accent: "#0891b2" },
  { code: "CL", name: "Champions League", accent: "#2563eb" },
  { code: "EL", name: "Europa League", accent: "#f97316" },
  { code: "UCL", name: "Conference League", accent: "#16a34a" },
];

export const CUP_COMPETITION_CODES = CUP_COMPETITIONS.map(({ code }) => code);

const BY_CODE = new Map<string, League>(LEAGUES.map((l) => [l.code, l]));

export function getLeague(code: string): League | undefined {
  return BY_CODE.get(code);
}

const COMPETITIONS = new Map<string, Competition>([
  ...LEAGUES.map((league) => [league.code, league] as const),
  ...CUP_COMPETITIONS.map((competition) => [competition.code, competition] as const),
]);

export function getCompetition(code: string): Competition | undefined {
  return COMPETITIONS.get(code);
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
