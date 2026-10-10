import { cacheLife } from "next/cache";
import { LEAGUES, getLeague } from "./config";
import { sampleClubs, sampleMatches, sampleTable } from "./sample";
import type {
  CatalogResponse,
  Club,
  DataSource,
  LeagueCode,
  LeagueError,
  Match,
  MatchStatus,
  MatchTeam,
  StandingRow,
  StandingsResponse,
} from "./types";

/**
 * Server-only client for football-data.org v4.
 *
 * Never import this from a client component: it reads the API key from the
 * environment. The key is exposed to the browser only through the route
 * handlers in src/app/api, which return normalised data and never the key.
 *
 * The free tier allows 10 requests/minute, and one refresh costs one request
 * per league, so every upstream call sits behind a `use cache` scope.
 */

const BASE_URL = "https://api.football-data.org/v4";

function getApiKey(): string | null {
  const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
  return key ? key : null;
}

class UpstreamError extends Error {}

async function request<T>(path: string, apiKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-Auth-Token": apiKey },
    });
  } catch (cause) {
    throw new UpstreamError(
      `Could not reach football-data.org: ${cause instanceof Error ? cause.message : "network error"}`,
    );
  }

  if (!res.ok) {
    // Map the statuses a free-tier key actually hits to something actionable.
    if (res.status === 400) throw new UpstreamError("Bad request to football-data.org.");
    if (res.status === 403) {
      throw new UpstreamError("This API key does not have access to that competition.");
    }
    if (res.status === 429) {
      throw new UpstreamError("Rate limit reached (free tier allows 10 requests/minute).");
    }
    throw new UpstreamError(`football-data.org returned ${res.status}.`);
  }

  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Upstream payload shapes (only the fields we consume)                        */
/* -------------------------------------------------------------------------- */

interface ApiTeam {
  id?: number;
  name?: string;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
}

interface ApiMatch {
  id?: number;
  utcDate?: string;
  status?: string;
  matchday?: number | null;
  minute?: number | null;
  competition?: { code?: string };
  homeTeam?: ApiTeam;
  awayTeam?: ApiTeam;
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    halfTime?: { home?: number | null; away?: number | null };
  };
}

const KNOWN_STATUSES: MatchStatus[] = [
  "SCHEDULED",
  "TIMED",
  "IN_PLAY",
  "PAUSED",
  "FINISHED",
  "SUSPENDED",
  "POSTPONED",
  "CANCELLED",
  "AWARDED",
];

function normaliseStatus(status: string | undefined): MatchStatus {
  const match = KNOWN_STATUSES.find((s) => s === status);
  return match ?? "SCHEDULED";
}

function normaliseTeam(team: ApiTeam | undefined): MatchTeam {
  const name = team?.name ?? "TBD";
  return {
    id: team?.id ?? 0,
    name,
    shortName: team?.shortName ?? name,
    tla: team?.tla ?? name.slice(0, 3).toUpperCase(),
    crest: team?.crest ?? null,
  };
}

function normaliseMatch(raw: ApiMatch, league: LeagueCode): Match | null {
  if (!raw.id || !raw.utcDate) return null;
  return {
    id: raw.id,
    league,
    utcDate: raw.utcDate,
    status: normaliseStatus(raw.status),
    matchday: raw.matchday ?? null,
    minute: raw.minute ?? null,
    home: normaliseTeam(raw.homeTeam),
    away: normaliseTeam(raw.awayTeam),
    score: {
      home: raw.score?.fullTime?.home ?? null,
      away: raw.score?.fullTime?.away ?? null,
      halfTimeHome: raw.score?.halfTime?.home ?? null,
      halfTimeAway: raw.score?.halfTime?.away ?? null,
    },
  };
}

function normaliseClub(raw: ApiTeam, league: LeagueCode): Club | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName ?? raw.name,
    tla: raw.tla ?? raw.name.slice(0, 3).toUpperCase(),
    crest: raw.crest ?? null,
    league,
  };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unknown error.";
}

/* -------------------------------------------------------------------------- */
/* Cached public API                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The full club list for all five leagues, used to populate the club picker.
 * Squad membership only changes between seasons, so this is cached hard.
 */
export async function getCatalog(): Promise<CatalogResponse> {
  "use cache";
  cacheLife("days");

  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      source: "sample",
      leagues: LEAGUES.map((league) => ({ league, clubs: sampleClubs(league.code) })),
      errors: [],
    };
  }

  const results = await Promise.allSettled(
    LEAGUES.map((league) =>
      request<{ teams?: ApiTeam[] }>(`/competitions/${league.code}/teams`, apiKey),
    ),
  );

  const leagues: CatalogResponse["leagues"] = [];
  const errors: LeagueError[] = [];

  results.forEach((result, i) => {
    const league = LEAGUES[i];
    if (result.status === "rejected") {
      errors.push({ league: league.code, message: errorMessage(result.reason) });
      // Keep the league in the picker using sample names rather than dropping it.
      leagues.push({ league, clubs: sampleClubs(league.code) });
      return;
    }
    const clubs = (result.value.teams ?? [])
      .map((team) => normaliseClub(team, league.code))
      .filter((club): club is Club => club !== null)
      .sort((a, b) => a.shortName.localeCompare(b.shortName));
    leagues.push({ league, clubs });
  });

  return { source: "api", leagues, errors };
}

/**
 * One league's full current season.
 *
 * **The cached unit is a single league, not a set of leagues.** That matters:
 * `use cache` keys on the arguments, so caching a `LeagueCode[]` would make
 * `[PL]`, `[PL, PD]` and `[PL, PD, SA]` three unrelated entries that each
 * refetch every league in the set. Adding clubs one league at a time would
 * then cost 1+2+3+4+5 = 15 upstream calls and blow the 10/minute free tier.
 * Keyed per league, each one is fetched at most once per cache period no
 * matter which combination asks for it.
 *
 * The whole season is fetched rather than a date window so "last N matches"
 * stays answerable through an international break.
 */
async function getLeagueSeason(league: LeagueCode): Promise<{
  source: DataSource;
  matches: Match[];
  error: LeagueError | null;
  fetchedAt: string;
}> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });

  const apiKey = getApiKey();
  const fetchedAt = new Date().toISOString();

  if (!apiKey) {
    const now = new Date(fetchedAt);
    // Roughly a season either side, so the sample data can answer the same
    // "last N / next N" question the live data does.
    const matches = sampleMatches(
      [league],
      new Date(now.getTime() - 180 * 86_400_000),
      new Date(now.getTime() + 180 * 86_400_000),
      now,
    );
    return { source: "sample", matches, error: null, fetchedAt };
  }

  try {
    const payload = await request<{ matches?: ApiMatch[] }>(
      `/competitions/${league}/matches`,
      apiKey,
    );
    const matches = (payload.matches ?? [])
      .map((raw) => normaliseMatch(raw, league))
      .filter((match): match is Match => match !== null);
    return { source: "api", matches, error: null, fetchedAt };
  } catch (reason) {
    return {
      source: "api",
      matches: [],
      error: { league, message: errorMessage(reason) },
      fetchedAt,
    };
  }
}

/**
 * Current-season matches for several leagues, assembled from the per-league
 * caches above. Not itself cached — it is just a fan-out over cached units.
 */
export async function getSeasonMatches(leagues: LeagueCode[]): Promise<{
  source: DataSource;
  matches: Match[];
  errors: LeagueError[];
  fetchedAt: string;
}> {
  const results = await Promise.all(leagues.map((code) => getLeagueSeason(code)));

  const matches = results.flatMap((result) => result.matches);
  matches.sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  return {
    source: results[0]?.source ?? "api",
    matches,
    errors: results.map((r) => r.error).filter((e): e is LeagueError => e !== null),
    // The oldest fetch is the honest answer for "how fresh is this view".
    fetchedAt: results.map((r) => r.fetchedAt).sort()[0] ?? new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* League tables                                                               */
/* -------------------------------------------------------------------------- */

interface ApiStandingRow {
  position?: number;
  team?: ApiTeam;
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
}

function normaliseRow(raw: ApiStandingRow, index: number): StandingRow {
  return {
    position: raw.position ?? index + 1,
    team: normaliseTeam(raw.team),
    playedGames: raw.playedGames ?? 0,
    won: raw.won ?? 0,
    draw: raw.draw ?? 0,
    lost: raw.lost ?? 0,
    points: raw.points ?? 0,
    goalsFor: raw.goalsFor ?? 0,
    goalsAgainst: raw.goalsAgainst ?? 0,
    goalDifference: raw.goalDifference ?? 0,
  };
}

/**
 * One league's table. Cached per league for the same reason the season is:
 * so that asking for two leagues never re-fetches the one already held.
 *
 * Tables only move when matches finish, so this is cached longer than fixtures.
 */
async function getLeagueTable(league: LeagueCode): Promise<{
  source: DataSource;
  rows: StandingRow[];
  error: LeagueError | null;
  fetchedAt: string;
}> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 600, expire: 3600 });

  const apiKey = getApiKey();
  const fetchedAt = new Date().toISOString();

  if (!apiKey) {
    return { source: "sample", rows: sampleTable(league), error: null, fetchedAt };
  }

  try {
    const payload = await request<{ standings?: { type?: string; table?: ApiStandingRow[] }[] }>(
      `/competitions/${league}/standings`,
      apiKey,
    );
    // These five leagues return a single TOTAL block; be defensive anyway.
    const total =
      payload.standings?.find((block) => block.type === "TOTAL") ?? payload.standings?.[0];
    const rows = (total?.table ?? []).map(normaliseRow);
    return { source: "api", rows, error: null, fetchedAt };
  } catch (reason) {
    return {
      source: "api",
      rows: [],
      error: { league, message: errorMessage(reason) },
      fetchedAt,
    };
  }
}

/** League tables for several leagues, assembled from the per-league caches. */
export async function getStandings(leagues: LeagueCode[]): Promise<StandingsResponse> {
  const results = await Promise.all(leagues.map((code) => getLeagueTable(code)));

  return {
    source: results[0]?.source ?? "api",
    tables: results.map((result, i) => ({ league: leagues[i], rows: result.rows })),
    errors: results.map((r) => r.error).filter((e): e is LeagueError => e !== null),
    fetchedAt: results.map((r) => r.fetchedAt).sort()[0] ?? new Date().toISOString(),
  };
}

/** Narrows arbitrary strings from the query string to known league codes. */
export function parseLeagues(value: string | null): LeagueCode[] {
  if (!value) return [];
  const codes = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => getLeague(part) !== undefined) as LeagueCode[];
  // De-duplicate and order canonically so the cache key is stable.
  return LEAGUES.map((l) => l.code).filter((code) => codes.includes(code));
}
