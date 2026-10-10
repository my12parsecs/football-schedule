"use client";

import { useEffect, useMemo, useState } from "react";
import { Crest } from "./Crest";
import { formatRelativeTime } from "@/lib/date";
import { LEAGUES, LEAGUE_CODES, getLeague } from "@/lib/football/config";
import type { LeagueCode, StandingRow, StandingsResponse } from "@/lib/football/types";
import { useSettings } from "@/lib/settings";

/**
 * All five tables, fetched in one go and held here.
 *
 * Every league is loaded up front rather than on demand, so switching tabs is
 * instant and the page costs exactly one request no matter how many leagues
 * you look at. Only the selected league is rendered.
 */
interface TableStore {
  byLeague: Partial<Record<LeagueCode, StandingRow[]>>;
  fetchedAt: string | null;
  source: "api" | "sample" | null;
  /** True once the single request has finished, successfully or not. */
  settled: boolean;
}

const EMPTY: TableStore = { byLeague: {}, fetchedAt: null, source: null, settled: false };

export function LeagueTableView() {
  const { settings, hydrated } = useSettings();
  const [store, setStore] = useState<TableStore>(EMPTY);
  const [failure, setFailure] = useState<string | null>(null);
  const [chosen, setChosen] = useState<LeagueCode | null>(null);
  const [, setClockTick] = useState(0);

  // Open on a league the user actually follows, falling back to the first.
  const league: LeagueCode = chosen ?? settings.leagues[0] ?? LEAGUES[0].code;
  const rows = store.byLeague[league];
  const needsFetch = hydrated && !store.settled;

  useEffect(() => {
    if (!needsFetch) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/standings?leagues=${LEAGUE_CODES.join(",")}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Table request failed (${res.status}).`);
        }
        const payload = (await res.json()) as StandingsResponse;

        const byLeague: Partial<Record<LeagueCode, StandingRow[]>> = {};
        for (const table of payload.tables) byLeague[table.league] = table.rows;

        setStore({
          byLeague,
          fetchedAt: payload.fetchedAt,
          source: payload.source,
          settled: true,
        });
        setFailure(payload.errors[0]?.message ?? null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStore((prev) => ({ ...prev, settled: true }));
        setFailure(error instanceof Error ? error.message : "Could not load the tables.");
      }
    })();

    return () => controller.abort();
  }, [needsFetch]);

  // Keep the freshness label moving without re-fetching.
  useEffect(() => {
    if (!store.fetchedAt) return;
    const id = setInterval(() => setClockTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [store.fetchedAt]);

  const followed = useMemo(() => new Set(settings.clubIds), [settings.clubIds]);
  const meta = getLeague(league);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10">
      <header className="pt-4 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Tables
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {meta?.name}
          {store.fetchedAt && (
            <>
              {" · "}
              <span className="tabular-nums">
                updated {formatRelativeTime(new Date(store.fetchedAt), new Date())}
              </span>
            </>
          )}
        </p>
      </header>

      <div className="flex gap-1 overflow-x-auto pb-3">
        {LEAGUES.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => setChosen(option.code)}
            aria-pressed={option.code === league}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              option.code === league
                ? "text-white dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
            style={
              option.code === league
                ? { backgroundColor: option.accent, color: "#fff" }
                : undefined
            }
          >
            {option.name}
          </button>
        ))}
      </div>

      {store.source === "sample" && (
        <p className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-900 dark:text-sky-200">
          Showing a <strong>generated sample table</strong>, not real standings. Add{" "}
          <code className="font-mono">FOOTBALL_DATA_API_KEY</code> to{" "}
          <code className="font-mono">.env.local</code> for live data.
        </p>
      )}

      {failure && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-200">
          {failure}
        </p>
      )}

      {!rows ? (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {store.settled ? "No table to show." : "Loading tables…"}
        </p>
      ) : (
        <Table rows={rows} followed={followed} accent={meta?.accent ?? "#71717a"} />
      )}
    </div>
  );
}

function Table({
  rows,
  followed,
  accent,
}: {
  rows: StandingRow[];
  followed: Set<number>;
  accent: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No table available for this competition yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-100 text-[0.6875rem] tracking-wide text-zinc-500 uppercase dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400">
            <th scope="col" className="py-2 pr-1 pl-2 text-right font-semibold">
              #
            </th>
            <th scope="col" className="py-2 pl-2 text-left font-semibold">
              Club
            </th>
            <NumHead>P</NumHead>
            <NumHead>W</NumHead>
            <NumHead>D</NumHead>
            <NumHead>L</NumHead>
            {/* Goals columns are noise on a phone; points and form matter more. */}
            <NumHead className="hidden sm:table-cell">GF</NumHead>
            <NumHead className="hidden sm:table-cell">GA</NumHead>
            <NumHead>GD</NumHead>
            <NumHead>Pts</NumHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isFollowed = followed.has(row.team.id);
            return (
              <tr
                key={row.team.id}
                className={`border-b border-zinc-200/70 last:border-b-0 dark:border-zinc-800/60 ${
                  isFollowed
                    ? "bg-emerald-500/10"
                    : "bg-white hover:bg-zinc-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/50"
                }`}
              >
                <td className="py-2 pr-1 pl-2 text-right text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {row.position}
                </td>
                <td className="py-2 pl-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Crest
                      crest={row.team.crest}
                      tla={row.team.tla}
                      accent={accent}
                      size={18}
                    />
                    <span
                      className={`truncate ${
                        isFollowed
                          ? "font-semibold text-zinc-900 dark:text-zinc-50"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {row.team.shortName}
                    </span>
                  </div>
                </td>
                <Num>{row.playedGames}</Num>
                <Num>{row.won}</Num>
                <Num>{row.draw}</Num>
                <Num>{row.lost}</Num>
                <Num className="hidden sm:table-cell">{row.goalsFor}</Num>
                <Num className="hidden sm:table-cell">{row.goalsAgainst}</Num>
                <Num>
                  {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                </Num>
                <Num className="font-bold text-zinc-900 dark:text-zinc-50">{row.points}</Num>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NumHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-1.5 py-2 text-right font-semibold sm:px-2 ${className}`}>
      {children}
    </th>
  );
}

function Num({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={`px-1.5 py-2 text-right text-xs text-zinc-600 tabular-nums sm:px-2 sm:text-sm dark:text-zinc-300 ${className}`}
    >
      {children}
    </td>
  );
}
