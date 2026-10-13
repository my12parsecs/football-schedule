"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClubPicker } from "./ClubPicker";
import { FixtureStream } from "./FixtureStream";
import { formatRelativeTime, localTimeZone } from "@/lib/date";
import { MATCH_COUNT_OPTIONS, type MatchCount } from "@/lib/football/config";
import { isLive, selectAroundNow } from "@/lib/football/select";
import type {
  CatalogResponse,
  Club,
  DataSource,
  LeagueCode,
  LeagueError,
  Match,
  MatchesResponse,
} from "@/lib/football/types";
import { useSettings } from "@/lib/settings";

/** How often to re-poll while at least one selected match is in progress. */
const LIVE_REFRESH_MS = 60_000;

/**
 * Season data already pulled into the browser, keyed by league.
 *
 * Keeping it here is what makes the app cheap to use: the full season for a
 * league is fetched at most once per visit, and everything the user does
 * afterwards — following or unfollowing clubs, switching 5/10/20 — is computed
 * from this with no further requests.
 */
interface MatchStore {
  matches: Match[];
  /** Parent leagues and club feeds already requested. */
  attemptedLeagues: LeagueCode[];
  attemptedClubIds: number[];
  fetchedAt: string | null;
  source: DataSource | null;
  errors: LeagueError[];
}

const EMPTY_STORE: MatchStore = {
  matches: [],
  attemptedLeagues: [],
  attemptedClubIds: [],
  fetchedAt: null,
  source: null,
  errors: [],
};

export function FixtureBoard() {
  const { settings, hydrated, setSelection, setShowResults, setMatchCount } = useSettings();

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [store, setStore] = useState<MatchStore>(EMPTY_STORE);
  const [failure, setFailure] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  // Drives the "updated N min ago" label without re-fetching.
  const [, setClockTick] = useState(0);

  const timeZone = useMemo(() => localTimeZone(), []);

  /* ---------------------------------------------------------------- catalog */

  /**
   * The club catalogue is only needed to render the picker, so it is fetched
   * the first time the picker opens rather than on every page load. Settings
   * written by an older version have no cached leagues, so those need it once
   * up front to work out which leagues to ask for.
   */
  const mustDeriveLeagues =
    hydrated && settings.clubIds.length > 0 && settings.leagues.length === 0;
  const needsCatalog = pickerOpen || mustDeriveLeagues;

  useEffect(() => {
    if (!needsCatalog || catalog !== null) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/teams", { signal: controller.signal });
        if (!res.ok) throw new Error(`Club list request failed (${res.status}).`);
        setCatalog((await res.json()) as CatalogResponse);
        setCatalogError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCatalogError(error instanceof Error ? error.message : "Could not load clubs.");
      }
    })();
    return () => controller.abort();
  }, [needsCatalog, catalog]);

  const clubsById = useMemo(() => {
    const index = new Map<number, Club>();
    for (const group of catalog?.leagues ?? []) {
      for (const club of group.clubs) index.set(club.id, club);
    }
    return index;
  }, [catalog]);

  /* ---------------------------------------------------------------- matches */

  // Prefer the leagues saved with the selection; fall back to the catalogue
  // only for settings written before they were stored.
  const selectedLeagues = useMemo<LeagueCode[]>(() => {
    if (settings.leagues.length > 0) return settings.leagues;
    const derived = settings.clubIds
      .map((id) => clubsById.get(id)?.league)
      .filter((code): code is LeagueCode => code !== undefined);
    return Array.from(new Set(derived));
  }, [settings.leagues, settings.clubIds, clubsById]);

  const hasSelection = settings.clubIds.length > 0 && selectedLeagues.length > 0;

  // Only leagues we have never asked for. Unfollowing a club never lands here,
  // so narrowing the selection costs nothing, and re-following a club in an
  // already-loaded league is free too.
  const missingClubIds = useMemo(
    () => settings.clubIds.filter((id) => !store.attemptedClubIds.includes(id)),
    [settings.clubIds, store.attemptedClubIds],
  );
  const missingKey = missingClubIds.join(",");

  // Loading is derived: if a league is still outstanding, a request is in
  // flight or about to be.
  const loadingMatches = hydrated && missingKey !== "";

  useEffect(() => {
    if (!hydrated || missingKey === "") return;

    const controller = new AbortController();
    (async () => {
      const requestedLeagues: LeagueCode[] = [];
      const requestedClubIds = missingKey.split(",").map(Number).filter(Number.isInteger);
      try {
        const query = new URLSearchParams();
        query.set("leagues", selectedLeagues.join(","));
        query.set("clubs", settings.clubIds.join(","));
        const res = await fetch(`/api/matches?${query.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Fixture request failed (${res.status}).`);
        }
        const payload = (await res.json()) as MatchesResponse;

        setStore((prev) => ({
          matches: [...new Map([...prev.matches, ...payload.matches].map((match) => [match.id, match])).values()],
          attemptedLeagues: [...new Set([...prev.attemptedLeagues, ...requestedLeagues])],
          attemptedClubIds: [...new Set([...prev.attemptedClubIds, ...requestedClubIds])],
          fetchedAt: payload.fetchedAt,
          source: payload.source,
          errors: payload.errors,
        }));
        setFailure(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        // Mark them attempted anyway, or the effect would retry forever.
        setStore((prev) => ({
          ...prev,
          attemptedLeagues: [...new Set([...prev.attemptedLeagues, ...requestedLeagues])],
          attemptedClubIds: [...new Set([...prev.attemptedClubIds, ...requestedClubIds])],
        }));
        setFailure(error instanceof Error ? error.message : "Could not load fixtures.");
      }
    })();

    return () => controller.abort();
  }, [missingKey, hydrated, selectedLeagues, settings.clubIds]);

  const matchesError = failure;

  /** Every league and club-feed match already in the browser. */
  const seasonMatches = store.matches;

  // The oldest league on screen is the honest answer for "how fresh is this".
  const loadedAt = useMemo(
    () => store.fetchedAt,
    [store.fetchedAt],
  );

  // Narrowing to the followed clubs and to last/next N happens here, so club
  // toggles and the 5/10/20 control never touch the network.
  // The empty short-circuit also keeps `new Date()` out of the static
  // prerender, where reading the clock is not allowed.
  const matches = useMemo(
    () =>
      seasonMatches.length === 0
        ? []
        : selectAroundNow(seasonMatches, settings.clubIds, settings.matchCount, new Date()),
    [seasonMatches, settings.clubIds, settings.matchCount],
  );

  const hasLiveMatch = useMemo(() => matches.some(isLive), [matches]);

  /** Drop the "already asked" marks so the next render refetches those leagues. */
  const refresh = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      attemptedLeagues: [],
      attemptedClubIds: [],
      errors: [],
    }));
    setFailure(null);
  }, []);

  // Poll while something is live so scores keep moving on their own.
  useEffect(() => {
    if (!hasLiveMatch) return;
    const id = setInterval(refresh, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasLiveMatch, refresh]);

  // Keep the freshness label honest.
  useEffect(() => {
    if (!loadedAt) return;
    const id = setInterval(() => setClockTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [loadedAt]);

  /* ------------------------------------------------------------- spoilers */

  const revealMatch = useCallback((matchId: number) => {
    setRevealedIds((prev) => new Set(prev).add(matchId));
  }, []);

  /**
   * One commit per picker session. The leagues are resolved here, where the
   * catalogue is loaded, and saved with the ids so the next visit can fetch
   * fixtures without downloading the catalogue again.
   */
  const commitSelection = useCallback(
    (clubIds: number[]) => {
      const leagues = clubIds
        .map((id) => clubsById.get(id)?.league)
        .filter((code): code is LeagueCode => code !== undefined);
      setSelection(clubIds, leagues);
    },
    [clubsById, setSelection],
  );

  // Per-match reveals belong to one sitting: flipping the global toggle clears
  // them, so hiding results always gives a clean slate.
  const changeShowResults = useCallback(
    (show: boolean) => {
      setShowResults(show);
      setRevealedIds(new Set());
    },
    [setShowResults],
  );

  /* ---------------------------------------------------------------- render */

  const catalogLoaded = catalog !== null;
  /**
   * Saved ids can go stale when the data source changes (the sample catalogue
   * and the live API number their clubs differently). Detected against the
   * fixtures rather than the catalogue, so it needs no extra request: a season
   * is loaded, yet not one followed club appears anywhere in it.
   */
  const staleSelection =
    settings.clubIds.length > 0 && seasonMatches.length > 0 && matches.length === 0;

  const sourceIsSample = (store.source ?? catalog?.source) === "sample";
  const leagueErrors = [...(catalog?.errors ?? []), ...store.errors];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <header className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Fixtures
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Europe&rsquo;s big five, in {timeZone.replace(/_/g, " ")} time
          {loadedAt && (
            <>
              {" · "}
              <span className="tabular-nums">
                updated {formatRelativeTime(new Date(loadedAt), new Date())}
              </span>
            </>
          )}
        </p>
      </header>

      <Toolbar
        clubCount={settings.clubIds.length}
        onOpenPicker={() => setPickerOpen(true)}
        matchCount={settings.matchCount}
        onMatchCountChange={setMatchCount}
        showResults={settings.showResults}
        onShowResultsChange={changeShowResults}
        onRefresh={refresh}
        refreshing={loadingMatches}
        canRefresh={hasSelection}
      />

      <main className="flex-1">
        {sourceIsSample && (
          <Notice tone="info">
            Showing <strong>generated sample fixtures</strong>, not real results. Add{" "}
            <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.8em] dark:bg-white/10">
              FOOTBALL_DATA_API_KEY
            </code>{" "}
            to <code className="font-mono text-[0.8em]">.env.local</code> and restart to pull live
            data from football-data.org.
          </Notice>
        )}

        {catalogError && <Notice tone="error">{catalogError}</Notice>}
        {matchesError && <Notice tone="error">{matchesError}</Notice>}

        {leagueErrors.map((error) => (
          <Notice key={`${error.league}-${error.message}`} tone="warn">
            <strong>{error.league}</strong>: {error.message}
          </Notice>
        ))}

        {staleSelection && (
          <Notice tone="warn">
            Your saved clubs don&rsquo;t match the clubs currently available — this usually means
            the data source changed.{" "}
            <button
              type="button"
              onClick={() => setSelection([], [])}
              className="font-semibold underline underline-offset-2"
            >
              Clear the selection
            </button>{" "}
            and pick again.
          </Notice>
        )}

        {/* Only block on the catalogue when it is the thing we are waiting
            for — normally it is never fetched at all. */}
        {!hydrated || (mustDeriveLeagues && !catalogLoaded && !catalogError) ? (
          <p className="px-4 py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Loading…
          </p>
        ) : !hasSelection ? (
          <EmptyState onOpenPicker={() => setPickerOpen(true)} />
        ) : loadingMatches && seasonMatches.length === 0 ? (
          <p className="px-4 py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Loading fixtures…
          </p>
        ) : (
          <FixtureStream
            matches={matches}
            showResults={settings.showResults}
            revealedIds={revealedIds}
            onReveal={revealMatch}
            scrollKey={selectedLeagues.join(",")}
            seasonMatches={seasonMatches}
          />
        )}
      </main>

      {/* Remounted per opening so its draft always starts from what is saved. */}
      <ClubPicker
        key={pickerOpen ? "open" : "closed"}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        catalog={catalog}
        loading={!catalogLoaded && !catalogError}
        selectedIds={settings.clubIds}
        onCommit={commitSelection}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Toolbar({
  clubCount,
  onOpenPicker,
  matchCount,
  onMatchCountChange,
  showResults,
  onShowResultsChange,
  onRefresh,
  refreshing,
  canRefresh,
}: {
  clubCount: number;
  onOpenPicker: () => void;
  matchCount: MatchCount;
  onMatchCountChange: (count: MatchCount) => void;
  showResults: boolean;
  onShowResultsChange: (show: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  canRefresh: boolean;
}) {
  return (
    <div className="sticky top-12 z-20 flex h-14 items-center gap-2 overflow-x-auto border-y border-zinc-200 bg-zinc-50/95 px-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <button
        type="button"
        onClick={onOpenPicker}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Clubs
        <span className="rounded bg-white/20 px-1.5 text-xs tabular-nums dark:bg-black/15">
          {clubCount}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-[0.6875rem] font-medium text-zinc-500 sm:inline dark:text-zinc-400">
          Last/next
        </span>
        <div
          role="group"
          aria-label="Matches shown per club, in each direction"
          className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
        >
          {MATCH_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={matchCount === count}
              onClick={() => onMatchCountChange(count)}
              title={`Last ${count} and next ${count} matches for each club`}
              className={`rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors sm:px-2.5 ${
                matchCount === count
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <Switch checked={showResults} onChange={onShowResultsChange} label="Results" />

      <button
        type="button"
        onClick={onRefresh}
        disabled={!canRefresh || refreshing}
        aria-label="Refresh fixtures"
        className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {/* Narrow screens get the glyph alone so the toolbar stays on one row. */}
        <span aria-hidden className={refreshing ? "inline-block animate-spin sm:hidden" : "sm:hidden"}>
          ↻
        </span>
        <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
      </button>
    </div>
  );
}

/** Results on/off. Off blurs every scoreline until a row is clicked. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={checked ? "Hide scores" : "Show scores"}
      className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <span
        aria-hidden
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${
            checked ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "error";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200",
  } as const;

  return (
    <p className={`m-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}>
      {children}
    </p>
  );
}

function EmptyState({ onOpenPicker }: { onOpenPicker: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Pick the clubs you follow
      </h2>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Choose from the Premier League, La Liga, Serie A, Bundesliga and Ligue 1. Your selection is
        saved in this browser, so the board comes back the way you left it.
      </p>
      <button
        type="button"
        onClick={onOpenPicker}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Choose clubs
      </button>
    </div>
  );
}
