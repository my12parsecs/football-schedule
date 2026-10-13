import { cacheLife } from "next/cache";
import { CUP_COMPETITION_CODES, LEAGUES, getLeague } from "./config";
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

function normaliseMatch(raw: ApiMatch, fallbackCompetition: string): Match | null {
  if (!raw.id || !raw.utcDate) return null;
  return {
    id: raw.id,
    league: raw.competition?.code ?? fallbackCompetition,
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
 * One competition's full current season.
 *
 * **The cached unit is a single league, not a set of leagues.** That matters:
 * `use cache` keys on the arguments, so caching a `LeagueCode[]` would make
 * `[PL]`, `[PL, PD]` and `[PL, PD, SA]` three unrelated entries that each
 * refetch every league in the set. Adding clubs one league at a time would
 * then cost 1+2+3+4+5 = 15 upstream calls and blow the 10/minute free tier.
 * Keyed per competition, each one is fetched at most once per cache period no
 * matter which combination asks for it. Cup and European matches are supplied
 * by the cached team feeds below because the app only needs those matches for
 * selected clubs.
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
    // Keep the keyless demo representative of the real feed: a few generated
    // fixtures stand in for domestic cups and Europe.
    const domesticCup = { PL: "FAC", PD: "CDR", SA: "CIT", BL1: "DFB", FL1: "CDF" }[
      league
    ];
    const sampleCompetitionMatches = matches.map((match, index) => ({
      ...match,
      league: index % 23 === 0 ? domesticCup : index % 31 === 0 ? "CL" : match.league,
    }));
    return { source: "sample", matches: sampleCompetitionMatches, error: null, fetchedAt };
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
 * Team feeds include the club's current-season domestic cup and European
 * fixtures. They are cached per club, so following another club does not
 * invalidate the already-loaded club feeds.
 */
async function getClubSeason(clubId: number): Promise<{
  source: DataSource;
  matches: Match[];
  error: LeagueError | null;
  fetchedAt: string;
}> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });

  const apiKey = getApiKey();
  const fetchedAt = new Date().toISOString();
  if (!apiKey) return { source: "sample", matches: [], error: null, fetchedAt };

  try {
    const payload = await request<{ matches?: ApiMatch[] }>(
      `/teams/${clubId}/matches?limit=500`,
      apiKey,
    );
    const matches = (payload.matches ?? [])
      .map((raw) => normaliseMatch(raw, "UNKNOWN"))
      .filter((match): match is Match => match !== null);
    return { source: "api", matches, error: null, fetchedAt };
  } catch (reason) {
    return {
      source: "api",
      matches: [],
      error: { league: `club:${clubId}`, message: errorMessage(reason) },
      fetchedAt,
    };
  }
}

/**
 * Bulk cup/European feed used when it is cheaper than one team request per
 * selected club. The list endpoint caps pages at 500 matches, so follow its
 * resultSet count until every requested competition is loaded.
 */
async function getBulkCupSeason(): Promise<{
  source: DataSource;
  matches: Match[];
  error: LeagueError | null;
  fetchedAt: string;
}> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });

  const apiKey = getApiKey();
  const fetchedAt = new Date().toISOString();
  if (!apiKey) return { source: "sample", matches: [], error: null, fetchedAt };

  const now = new Date(fetchedAt);
  const seasonStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const dateFrom = `${seasonStartYear}-07-01`;
  const dateTo = `${seasonStartYear + 1}-07-01`;
  const matches: Match[] = [];
  let offset = 0;
  let total = 0;

  try {
    do {
      const query = new URLSearchParams({
        competitions: CUP_COMPETITION_CODES.join(","),
        dateFrom,
        dateTo,
        limit: "500",
        ...(offset > 0 ? { offset: String(offset) } : {}),
      });
      const payload = await request<{ resultSet?: { count?: number }; matches?: ApiMatch[] }>(
        `/matches?${query.toString()}`,
        apiKey,
      );
      const page = (payload.matches ?? [])
        .map((raw) => normaliseMatch(raw, "UNKNOWN"))
        .filter((match): match is Match => match !== null);
      matches.push(...page);
      total = payload.resultSet?.count ?? matches.length;
      if (page.length === 0) break;
      offset += page.length;
    } while (offset < total);

    return { source: "api", matches, error: null, fetchedAt };
  } catch (reason) {
    return {
      source: "api",
      matches: [],
      error: { league: "bulk-cups", message: errorMessage(reason) },
      fetchedAt,
    };
  }
}

/**
 * Current-season matches for several leagues, assembled from the per-league
 * caches above. Not itself cached — it is just a fan-out over cached units.
 */
export async function getSeasonMatches(leagues: LeagueCode[], clubIds: number[] = []): Promise<{
  source: DataSource;
  matches: Match[];
  errors: LeagueError[];
  fetchedAt: string;
}> {
  const uniqueLeagues = new Set(leagues).size;
  // The bulk feed is currently expected to take two pages (500 per page).
  // Only use it when that plus the league feeds beats one request per club.
  const useBulkFeeds =
    clubIds.length > 0 && clubIds.length > uniqueLeagues + 2 && getApiKey() !== null;
  const useClubFeeds = clubIds.length > 0 && !useBulkFeeds && getApiKey() !== null;
  const [leagueResults, clubResults] = await Promise.all([
    // The fixture board supplies club ids, so it does not need these broad
    // league feeds. Keep the league path for direct API consumers/fallbacks.
    useClubFeeds ? Promise.resolve([]) : Promise.all(leagues.map((code) => getLeagueSeason(code))),
    useBulkFeeds
      ? getBulkCupSeason().then(async (result) => {
          if (!result.error) return [result];
          // A token may not have access to every cup in the combined request.
          // Fall back to team feeds so an unavailable bulk competition does
          // not make all non-league fixtures disappear from the board.
          return Promise.all([...new Set(clubIds)].map((id) => getClubSeason(id)));
        })
      : Promise.all([...new Set(clubIds)].map((id) => getClubSeason(id))),
  ]);

  const results = [...leagueResults, ...clubResults];

  const matches = [...new Map(results.flatMap((result) => result.matches).map((match) => [match.id, match])).values()];
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
