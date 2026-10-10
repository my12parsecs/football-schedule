"use client";

import { useState } from "react";
import { Crest } from "./Crest";
import { MatchDetail } from "./MatchDetail";
import { formatKickoff } from "@/lib/date";
import { getLeague } from "@/lib/football/config";
import type { Match, MatchStatus } from "@/lib/football/types";

const LIVE_STATUSES: MatchStatus[] = ["IN_PLAY", "PAUSED"];

/** Statuses where a scoreline exists (or will exist) rather than a kickoff time. */
function hasScore(match: Match): boolean {
  return match.score.home !== null && match.score.away !== null;
}

function isLive(match: Match): boolean {
  return LIVE_STATUSES.includes(match.status);
}

/** Short label for the left-hand column: a kickoff time, or why there is not one. */
function statusLabel(match: Match): { text: string; tone: "time" | "done" | "live" | "off" } {
  switch (match.status) {
    case "FINISHED":
    case "AWARDED":
      return { text: "FT", tone: "done" };
    case "IN_PLAY":
      return { text: match.minute ? `${match.minute}'` : "LIVE", tone: "live" };
    case "PAUSED":
      return { text: "HT", tone: "live" };
    case "POSTPONED":
      return { text: "Post.", tone: "off" };
    case "SUSPENDED":
      return { text: "Susp.", tone: "off" };
    case "CANCELLED":
      return { text: "Canc.", tone: "off" };
    default:
      return { text: formatKickoff(new Date(match.utcDate)), tone: "time" };
  }
}

const TONE_CLASSES: Record<"time" | "done" | "live" | "off", string> = {
  time: "text-zinc-700 dark:text-zinc-300",
  done: "text-zinc-400 dark:text-zinc-500",
  live: "text-emerald-600 dark:text-emerald-400",
  off: "text-amber-600 dark:text-amber-500",
};

export function FixtureRow({
  match,
  showResults,
  revealed,
  onReveal,
  seasonMatches,
}: {
  match: Match;
  showResults: boolean;
  /** True when the user has revealed this one row despite results being hidden. */
  revealed: boolean;
  onReveal: (matchId: number) => void;
  /** The loaded season, used to compute the expanded panel without a request. */
  seasonMatches: Match[];
}) {
  const [expanded, setExpanded] = useState(false);
  const league = getLeague(match.league);
  const accent = league?.accent ?? "#71717a";
  const status = statusLabel(match);
  const played = hasScore(match);
  const live = isLive(match);
  const scoresVisible = showResults || revealed;

  const homeWon = played && match.score.home! > match.score.away!;
  const awayWon = played && match.score.away! > match.score.home!;
  // Only emphasise the winner once the score is actually on screen.
  const emphasise = (won: boolean) =>
    played && scoresVisible && won
      ? "font-semibold text-zinc-900 dark:text-zinc-50"
      : "text-zinc-700 dark:text-zinc-300";

  const scoreline = played ? `${match.score.home}–${match.score.away}` : null;

  return (
    <li
      className="relative border-b border-b-zinc-200/70 border-l-2 bg-white transition-colors dark:border-b-zinc-800/60 dark:bg-zinc-900/40"
      style={{ borderLeftColor: live ? "#10b981" : "transparent" }}
    >
      {/*
        The whole row toggles the panel. It is an overlay button *behind* the
        content rather than a wrapper, because the score reveal is itself a
        button and nesting one inside another is invalid HTML.
      */}
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} details for ${match.home.shortName} against ${match.away.shortName}`}
        className="absolute inset-0 z-0 cursor-pointer hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 focus-visible:outline-none dark:hover:bg-zinc-800/60"
      />

      {/* Content sits above the overlay but lets clicks through to it. */}
      <div className="pointer-events-none relative z-[1] grid grid-cols-[3rem_minmax(0,1fr)_1.25rem] items-center gap-2 py-2 pr-2 pl-2.5 sm:grid-cols-[3.75rem_minmax(0,1fr)_2.5rem_1.25rem] sm:gap-3">
        {/* Kickoff time or status */}
        <div className={`text-xs font-medium tabular-nums sm:text-sm ${TONE_CLASSES[status.tone]}`}>
          {live && (
            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />
          )}
          {status.text}
        </div>

        {/* Home — score — away */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className={`truncate text-right text-sm ${emphasise(homeWon)}`}>
              {match.home.shortName}
            </span>
            <Crest crest={match.home.crest} tla={match.home.tla} accent={accent} />
          </div>

          <ScoreBox
            scoreline={scoreline}
            visible={scoresVisible}
            live={live}
            onReveal={() => onReveal(match.id)}
            homeName={match.home.shortName}
            awayName={match.away.shortName}
          />

          <div className="flex min-w-0 items-center gap-2">
            <Crest crest={match.away.crest} tla={match.away.tla} accent={accent} />
            <span className={`truncate text-sm ${emphasise(awayWon)}`}>
              {match.away.shortName}
            </span>
          </div>
        </div>

        {/* League marker, dropped on narrow screens where space is tight */}
        <div className="hidden justify-end sm:flex">
          <span
            title={league?.name}
            className="rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide"
            style={{ backgroundColor: `${accent}1f`, color: accent }}
          >
            {match.league}
          </span>
        </div>

        <span
          aria-hidden
          className={`justify-self-end text-zinc-400 transition-transform dark:text-zinc-500 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          &rsaquo;
        </span>
      </div>

      {expanded && (
        <div className="relative z-[1]">
          <MatchDetail
            match={match}
            seasonMatches={seasonMatches}
            resultsVisible={scoresVisible}
          />
        </div>
      )}
    </li>
  );
}

/**
 * The centre column: a scoreline, a "v" for upcoming matches, or a blurred
 * score that reveals on click when the user has results hidden.
 */
function ScoreBox({
  scoreline,
  visible,
  live,
  onReveal,
  homeName,
  awayName,
}: {
  scoreline: string | null;
  visible: boolean;
  live: boolean;
  onReveal: () => void;
  homeName: string;
  awayName: string;
}) {
  const base =
    "w-[3.25rem] shrink-0 rounded-md py-0.5 text-center text-sm font-semibold tabular-nums sm:w-[3.75rem]";
  // Re-enables clicks for the reveal button, which the row disables wholesale.
  const clickable = "pointer-events-auto relative z-[2]";

  if (!scoreline) {
    return <span className={`${base} text-zinc-400 dark:text-zinc-600`}>v</span>;
  }

  if (visible) {
    return (
      <span
        className={`${base} ${
          live
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-zinc-200/70 text-zinc-900 dark:bg-zinc-700/50 dark:text-zinc-50"
        }`}
      >
        {scoreline}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onReveal}
      aria-label={`Reveal the score for ${homeName} against ${awayName}`}
      title="Click to reveal"
      className={`${base} ${clickable} cursor-pointer bg-zinc-200/70 text-zinc-900 select-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none dark:bg-zinc-700/50 dark:text-zinc-50`}
    >
      <span className="block blur-[5px]" aria-hidden>
        {scoreline}
      </span>
    </button>
  );
}
