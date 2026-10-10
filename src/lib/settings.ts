"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_MATCH_COUNT,
  isLeagueCode,
  isMatchCount,
  type MatchCount,
} from "./football/config";
import type { LeagueCode } from "./football/types";

/**
 * User preferences, persisted to localStorage under a single versioned key so
 * the whole shape can be migrated at once if it ever changes.
 *
 * This is modelled as an external store rather than component state:
 * localStorage is shared mutable state outside React, and `useSyncExternalStore`
 * is the supported way to read it without a hydration mismatch or a
 * setState-in-effect cascade. It also gives cross-tab sync for free.
 */
export interface Settings {
  /** Club ids the user follows. Empty means nothing is selected yet. */
  clubIds: number[];
  /**
   * The leagues those clubs play in, stored alongside the ids.
   *
   * This is denormalised on purpose. Without it the app has to download the
   * whole club catalogue on every visit just to learn which leagues to ask
   * for, which costs five upstream requests and sits on the critical path.
   * Remembering it means a return visit fetches fixtures immediately and only
   * opens the catalogue when the picker is actually used.
   */
  leagues: LeagueCode[];
  /** When false, scores on played matches are blurred until clicked. */
  showResults: boolean;
  /** Matches to show per club, in each direction. */
  matchCount: MatchCount;
}

const STORAGE_KEY = "football-schedule:settings:v3";
/** Older shapes: v1 stored `rangeDays`, v2 had no cached `leagues`. */
const LEGACY_STORAGE_KEYS = [
  "football-schedule:settings:v2",
  "football-schedule:settings:v1",
];

export const DEFAULT_SETTINGS: Settings = {
  clubIds: [],
  leagues: [],
  showResults: true,
  matchCount: DEFAULT_MATCH_COUNT,
};

/** Accepts only well-formed stored values; anything else falls back to defaults. */
function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const record = parsed as Record<string, unknown>;

    const clubIds = Array.isArray(record.clubIds)
      ? record.clubIds.filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      : DEFAULT_SETTINGS.clubIds;

    // Absent in v1/v2 payloads; the board then falls back to deriving them
    // from the catalogue once, and stores them on the next edit.
    const leagues = Array.isArray(record.leagues)
      ? record.leagues.filter((code): code is LeagueCode => typeof code === "string" && isLeagueCode(code))
      : DEFAULT_SETTINGS.leagues;

    return {
      clubIds,
      leagues,
      showResults:
        typeof record.showResults === "boolean"
          ? record.showResults
          : DEFAULT_SETTINGS.showResults,
      // `matchCount` is absent in v1 payloads, which is what we want: the old
      // `rangeDays` value has no sensible translation, so it takes the default.
      matchCount: isMatchCount(record.matchCount) ? record.matchCount : DEFAULT_SETTINGS.matchCount,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/* --------------------------------------------------------------- the store */

const listeners = new Set<() => void>();

/**
 * Cached snapshot. `useSyncExternalStore` compares snapshots by reference, so
 * this must stay identical until something actually changes.
 */
let snapshot: Settings | null = null;

function readFromStorage(): Settings {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current !== null) return parseSettings(current);
    // Carry whatever an older version stored across, rather than making the
    // user set their clubs up again. Missing fields take their defaults.
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) return parseSettings(legacy);
    }
    return DEFAULT_SETTINGS;
  } catch {
    // Private browsing or blocked storage: run from memory with defaults.
    return DEFAULT_SETTINGS;
  }
}

function getSnapshot(): Settings {
  snapshot ??= readFromStorage();
  return snapshot;
}

/** The server never has preferences, so it always renders the defaults. */
function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Another tab wrote to the same key: adopt its value. */
function onStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  snapshot = parseSettings(event.newValue);
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", onStorageEvent);
}

function update(change: (previous: Settings) => Settings) {
  const next = change(getSnapshot());
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota or permission errors; preferences just will not persist.
  }
  emit();
}

/* ----------------------------------------------------------------- the hook */

export interface SettingsApi {
  settings: Settings;
  /**
   * False during the server render and the hydration pass. The UI must not act
   * on `settings` before this flips, or the first paint would claim the user
   * has no clubs selected.
   */
  hydrated: boolean;
  toggleClub: (clubId: number) => void;
  /** Replaces the selection. Leagues are stored with it to save a round trip. */
  setSelection: (clubIds: number[], leagues: LeagueCode[]) => void;
  setShowResults: (showResults: boolean) => void;
  setMatchCount: (matchCount: MatchCount) => void;
}

const noopSubscribe = () => () => {};

export function useSettings(): SettingsApi {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Resolves to false on the server and during hydration, true afterwards.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const toggleClub = useCallback((clubId: number) => {
    update((prev) => ({
      ...prev,
      clubIds: prev.clubIds.includes(clubId)
        ? prev.clubIds.filter((id) => id !== clubId)
        : [...prev.clubIds, clubId],
    }));
  }, []);

  const setSelection = useCallback((clubIds: number[], leagues: LeagueCode[]) => {
    update((prev) => ({
      ...prev,
      clubIds: Array.from(new Set(clubIds)),
      leagues: Array.from(new Set(leagues)),
    }));
  }, []);

  const setShowResults = useCallback((showResults: boolean) => {
    update((prev) => ({ ...prev, showResults }));
  }, []);

  const setMatchCount = useCallback((matchCount: MatchCount) => {
    update((prev) => ({ ...prev, matchCount }));
  }, []);

  return { settings, hydrated, toggleClub, setSelection, setShowResults, setMatchCount };
}
