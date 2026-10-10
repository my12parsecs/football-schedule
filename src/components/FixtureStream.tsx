"use client";

import { useEffect, useMemo, useRef } from "react";
import { FixtureRow } from "./FixtureRow";
import { formatDayHeading, localDateKey } from "@/lib/date";
import type { Match } from "@/lib/football/types";

type StreamItem =
  | { kind: "day"; key: string; dateKey: string; count: number; isToday: boolean }
  | { kind: "now"; key: string }
  | { kind: "match"; key: string; match: Match };

/**
 * Flattens matches into one chronological stream of day headings, fixture rows
 * and a single "now" divider marking the boundary between played and upcoming.
 */
function buildStream(matches: Match[], now: Date): StreamItem[] {
  const sorted = [...matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  // Count per day up front so each heading can show how many matches it covers.
  const countByDate = new Map<string, number>();
  for (const match of sorted) {
    const dateKey = localDateKey(new Date(match.utcDate));
    countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
  }

  const todayKey = localDateKey(now);
  const items: StreamItem[] = [];
  let lastDateKey: string | null = null;
  let nowPlaced = false;

  for (const match of sorted) {
    const kickoff = new Date(match.utcDate);
    const dateKey = localDateKey(kickoff);

    if (dateKey !== lastDateKey) {
      items.push({
        kind: "day",
        key: `day-${dateKey}`,
        dateKey,
        count: countByDate.get(dateKey) ?? 0,
        isToday: dateKey === todayKey,
      });
      lastDateKey = dateKey;
    }
    // The divider goes just before the first match that has not kicked off.
    if (!nowPlaced && kickoff.getTime() >= now.getTime()) {
      items.push({ kind: "now", key: "now" });
      nowPlaced = true;
    }
    items.push({ kind: "match", key: `m-${match.id}`, match });
  }

  // Everything loaded is already played: the boundary is the end.
  if (!nowPlaced && sorted.length > 0) items.push({ kind: "now", key: "now" });

  return items;
}

export function FixtureStream({
  matches,
  showResults,
  revealedIds,
  onReveal,
  scrollKey,
  seasonMatches,
}: {
  matches: Match[];
  showResults: boolean;
  revealedIds: Set<number>;
  onReveal: (matchId: number) => void;
  /**
   * Changes whenever the user asks for a different set of fixtures. The stream
   * re-centres on "now" when it changes, but not on background refreshes, which
   * would otherwise yank the page while the user is reading.
   */
  scrollKey: string;
  /** Full season for the followed leagues, used by the expandable detail panel. */
  seasonMatches: Match[];
}) {
  // Re-read the clock whenever the data changes, so "Today" and the divider
  // stay correct across refreshes without re-running on every render.
  const { items, now } = useMemo(() => {
    const now = new Date();
    return { items: buildStream(matches, now), now };
  }, [matches]);

  const nowRef = useRef<HTMLLIElement>(null);
  const scrolledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (matches.length === 0) return;
    if (scrolledKeyRef.current === scrollKey) return;
    scrolledKeyRef.current = scrollKey;
    nowRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [scrollKey, matches.length]);

  if (matches.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No matches found for your clubs. The season may not have started yet.
      </p>
    );
  }

  return (
    <ul>
      {items.map((item) => {
        if (item.kind === "day") {
          const { relative, absolute } = formatDayHeading(item.dateKey, now);
          return (
            <li
              key={item.key}
              // The top margin opens a gap to the previous day; once the
              // heading sticks it sits above the viewport and costs nothing.
              className={`sticky top-[6.5rem] z-10 mt-2 flex items-baseline gap-2 border-y px-3 py-2 backdrop-blur first:mt-0 ${
                item.isToday
                  ? "border-emerald-500/50 bg-emerald-500/15"
                  : "border-zinc-300 bg-zinc-300/70 dark:border-zinc-700 dark:bg-zinc-800"
              }`}
            >
              <span
                className={`text-sm font-bold tracking-tight ${
                  item.isToday
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-zinc-900 dark:text-zinc-50"
                }`}
              >
                {relative ?? absolute}
              </span>
              {/* When the heading says "Today", still show the actual date. */}
              {relative && (
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {absolute}
                </span>
              )}
              <span className="ml-auto text-[0.6875rem] font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
                {item.count} {item.count === 1 ? "match" : "matches"}
              </span>
            </li>
          );
        }

        if (item.kind === "now") {
          return (
            <li key={item.key} ref={nowRef} className="flex items-center gap-2 px-3 py-2">
              <span className="h-px flex-1 bg-emerald-500/40" />
              <span className="text-[0.625rem] font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
                Now
              </span>
              <span className="h-px flex-1 bg-emerald-500/40" />
            </li>
          );
        }

        return (
          <FixtureRow
            key={item.key}
            match={item.match}
            showResults={showResults}
            revealed={revealedIds.has(item.match.id)}
            onReveal={onReveal}
            seasonMatches={seasonMatches}
          />
        );
      })}
    </ul>
  );
}
