import { isPlayed } from "./select";
import type { Match } from "./types";

/**
 * Context for a single match, computed from the season data already held in
 * the browser — so expanding a row costs no API request at all.
 *
 * Everything here is measured *going into* the match: only fixtures that had
 * finished before kickoff count. For an upcoming match that is simply the
 * current picture; for a past one it is the form each side carried in, which
 * is the useful reading either way.
 *
 * Goal scorers, line-ups, substitutions and shot/possession stats are
 * deliberately absent: football-data.org does not expose them on the free
 * tier (they need the €29/mo Deep Data tier and a €15/mo statistics add-on),
 * so there is nothing to show rather than something to compute.
 */

export type Outcome = "W" | "D" | "L";

export interface FormEntry {
  match: Match;
  outcome: Outcome;
  /** The other club, from the perspective of the club this form belongs to. */
  opponent: string;
  /** Goals as `scored-conceded` for the club this form belongs to. */
  scored: number;
  conceded: number;
  wasHome: boolean;
}

export interface ClubContext {
  clubId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Most recent first. */
  form: FormEntry[];
}

export interface MatchDetail {
  home: ClubContext;
  away: ClubContext;
  /** Other meetings between these two clubs in the loaded season. */
  headToHead: Match[];
}

function outcomeFor(match: Match, clubId: number): FormEntry | null {
  const home = match.score.home;
  const away = match.score.away;
  if (home === null || away === null) return null;

  const wasHome = match.home.id === clubId;
  const scored = wasHome ? home : away;
  const conceded = wasHome ? away : home;

  return {
    match,
    outcome: scored > conceded ? "W" : scored < conceded ? "L" : "D",
    opponent: wasHome ? match.away.shortName : match.home.shortName,
    scored,
    conceded,
    wasHome,
  };
}

function buildClubContext(
  clubId: number,
  name: string,
  seasonMatches: Match[],
  before: number,
  formCount: number,
): ClubContext {
  const context: ClubContext = {
    clubId,
    name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    form: [],
  };

  const entries: FormEntry[] = [];
  for (const candidate of seasonMatches) {
    if (candidate.home.id !== clubId && candidate.away.id !== clubId) continue;
    if (!isPlayed(candidate)) continue;
    // Strictly before this match, so the numbers read as "going into" it.
    if (new Date(candidate.utcDate).getTime() >= before) continue;

    const entry = outcomeFor(candidate, clubId);
    if (!entry) continue;

    entries.push(entry);
    context.played += 1;
    context.goalsFor += entry.scored;
    context.goalsAgainst += entry.conceded;
    if (entry.outcome === "W") context.won += 1;
    else if (entry.outcome === "D") context.drawn += 1;
    else context.lost += 1;
  }

  entries.sort((a, b) => b.match.utcDate.localeCompare(a.match.utcDate));
  context.form = entries.slice(0, formCount);
  return context;
}

export function buildMatchDetail(
  match: Match,
  seasonMatches: Match[],
  formCount = 5,
): MatchDetail {
  const before = new Date(match.utcDate).getTime();

  const headToHead = seasonMatches
    .filter(
      (candidate) =>
        candidate.id !== match.id &&
        ((candidate.home.id === match.home.id && candidate.away.id === match.away.id) ||
          (candidate.home.id === match.away.id && candidate.away.id === match.home.id)),
    )
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  return {
    home: buildClubContext(match.home.id, match.home.shortName, seasonMatches, before, formCount),
    away: buildClubContext(match.away.id, match.away.shortName, seasonMatches, before, formCount),
    headToHead,
  };
}
