/** Domain types for the fixture board. Shared by the server fetchers and the UI. */

export type LeagueCode = "PL" | "PD" | "SA" | "BL1" | "FL1";
/** Competition codes returned by football-data.org, including cups. */
export type CompetitionCode = string;

export interface League {
  code: LeagueCode;
  /** Short label used in the UI, e.g. "Premier League". */
  name: string;
  country: string;
  /** Accent colour used for league pills and crest fallbacks. */
  accent: string;
}

export interface Club {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string | null;
  league: LeagueCode;
}

/**
 * Match lifecycle as reported by football-data.org. `LIVE` is a pseudo-status
 * there (it covers IN_PLAY + PAUSED) and never appears on a match itself.
 */
export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export interface MatchTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string | null;
}

export interface MatchScore {
  home: number | null;
  away: number | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
}

export interface Match {
  id: number;
  /** football-data.org competition code, e.g. PL, FAC, FLC, CL or EL. */
  league: CompetitionCode;
  /** ISO 8601 kickoff in UTC. The UI converts to the viewer's local zone. */
  utcDate: string;
  status: MatchStatus;
  matchday: number | null;
  /** Minutes played, only present while a match is live. */
  minute: number | null;
  home: MatchTeam;
  away: MatchTeam;
  score: MatchScore;
}

/** A league we failed to load, reported alongside whatever did load. */
export interface LeagueError {
  /** Parent league code, or `club:<id>` for a team-scoped feed failure. */
  league: string;
  message: string;
}

/** `sample` means no API key was configured and generated data is being served. */
export type DataSource = "api" | "sample";

export interface CatalogResponse {
  source: DataSource;
  leagues: { league: League; clubs: Club[] }[];
  errors: LeagueError[];
}

export interface MatchesResponse {
  source: DataSource;
  matches: Match[];
  errors: LeagueError[];
  /** When the underlying upstream call ran, so the UI can show data age. */
  fetchedAt: string;
}

/** One row of a league table, as returned by the standings endpoint. */
export interface StandingRow {
  position: number;
  team: MatchTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface LeagueTable {
  league: LeagueCode;
  rows: StandingRow[];
}

export interface StandingsResponse {
  source: DataSource;
  tables: LeagueTable[];
  errors: LeagueError[];
  fetchedAt: string;
}
