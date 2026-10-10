"use client";

import { useMemo } from "react";
import { formatKickoff } from "@/lib/date";
import { getLeague } from "@/lib/football/config";
import { buildMatchDetail, type ClubContext, type Outcome } from "@/lib/football/detail";
import type { Match } from "@/lib/football/types";

const OUTCOME_CLASSES: Record<Outcome, string> = {
  W: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  D: "bg-zinc-400/25 text-zinc-700 dark:text-zinc-300",
  L: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
};

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function MatchDetail({
  match,
  seasonMatches,
  /** False when the global results toggle is hiding scores for this match. */
  resultsVisible,
}: {
  match: Match;
  seasonMatches: Match[];
  resultsVisible: boolean;
}) {
  const detail = useMemo(
    () => buildMatchDetail(match, seasonMatches),
    [match, seasonMatches],
  );

  const league = getLeague(match.league);
  const halfTime =
    match.score.halfTimeHome !== null && match.score.halfTimeAway !== null
      ? `${match.score.halfTimeHome}–${match.score.halfTimeAway}`
      : null;

  return (
    <div className="border-t border-zinc-200 bg-zinc-100/70 px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/40">
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <Fact label="Competition" value={league?.name ?? match.league} />
        {match.matchday !== null && <Fact label="Matchday" value={String(match.matchday)} />}
        <Fact label="Kick-off" value={formatKickoff(new Date(match.utcDate))} />
        {halfTime && resultsVisible && <Fact label="Half-time" value={halfTime} />}
      </dl>

      {!resultsVisible ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Form and head-to-head are hidden while results are off. Reveal the score on this
          match to see them.
        </p>
      ) : (
        <>
          <section className="mt-3">
            <h3 className="text-[0.6875rem] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Going into this match
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ClubCard context={detail.home} />
              <ClubCard context={detail.away} />
            </div>
          </section>

          {detail.headToHead.length > 0 && (
            <section className="mt-3">
              <h3 className="text-[0.6875rem] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Also meeting this season
              </h3>
              <ul className="mt-1.5 space-y-1">
                {detail.headToHead.map((other) => {
                  const played =
                    other.score.home !== null && other.score.away !== null
                      ? `${other.score.home}–${other.score.away}`
                      : "v";
                  return (
                    <li
                      key={other.id}
                      className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"
                    >
                      <span className="w-12 shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {dayMonth.format(new Date(other.utcDate))}
                      </span>
                      <span className="truncate">
                        {other.home.shortName}{" "}
                        <span className="font-semibold tabular-nums">{played}</span>{" "}
                        {other.away.shortName}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-3 border-t border-zinc-200/70 pt-2 text-[0.6875rem] text-zinc-400 dark:border-zinc-700/70 dark:text-zinc-500">
        Goal scorers, line-ups and shot/possession stats are not available on football-data.org&rsquo;s
        free tier.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

function ClubCard({ context }: { context: ClubContext }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/50">
      <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
        {context.name}
      </p>

      {context.played === 0 ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">No matches played yet.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
            {context.played} played &middot; {context.won}W {context.drawn}D {context.lost}L
            &middot; {context.goalsFor}&ndash;{context.goalsAgainst}
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            {/* Oldest on the left, so the run reads left to right. */}
            {[...context.form].reverse().map((entry) => (
              <span
                key={entry.match.id}
                title={`${entry.wasHome ? "H" : "A"} v ${entry.opponent} ${entry.scored}-${entry.conceded}`}
                className={`inline-flex size-5 items-center justify-center rounded text-[0.625rem] font-bold ${OUTCOME_CLASSES[entry.outcome]}`}
              >
                {entry.outcome}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
