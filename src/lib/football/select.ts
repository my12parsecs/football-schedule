import type { Match, MatchStatus } from "./types";

/**
 * Pure fixture-selection helpers, deliberately free of any server imports so
 * the browser can run them.
 *
 * Narrowing a season down to "the clubs I follow, last N and next N" happens on
 * the client on purpose: the app already holds the full season for the leagues
 * in play, so changing clubs or the match count is instant and costs no API
 * request at all.
 */

/** Statuses that mean the match has been played and has a final score. */
const PLAYED_STATUSES = new Set<MatchStatus>(["FINISHED", "AWARDED"]);
/** Statuses that mean the match is happening right now. */
const LIVE_STATUSES = new Set<MatchStatus>(["IN_PLAY", "PAUSED"]);

export function isPlayed(match: Match): boolean {
  return PLAYED_STATUSES.has(match.status);
}

export function isLive(match: Match): boolean {
  return LIVE_STATUSES.has(match.status);
}

/**
 * The last `count` played and next `count` upcoming matches *for each* followed
 * club, plus anything currently live.
 *
 * Counting matches rather than days is what keeps the past side populated
 * during an international break. A match between two followed clubs counts for
 * both but is returned once.
 */
export function selectAroundNow(
  matches: Match[],
  clubIds: number[],
  count: number,
  now: Date,
): Match[] {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const keep = new Set<number>();
  const nowMs = now.getTime();

  // Bucket by club once rather than scanning the whole season per club: with
  // five leagues selected this is ~1,800 matches and runs on every render.
  const byClub = new Map<number, Match[]>();
  const wanted = new Set(clubIds);
  for (const match of matches) {
    for (const id of [match.home.id, match.away.id]) {
      if (!wanted.has(id)) continue;
      const list = byClub.get(id);
      if (list) list.push(match);
      else byClub.set(id, [match]);
    }
  }

  for (const theirs of byClub.values()) {
    const played = theirs
      .filter(isPlayed)
      .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
      .slice(0, count);

    const upcoming = theirs
      .filter(
        (m) =>
          !isPlayed(m) &&
          !isLive(m) &&
          m.status !== "CANCELLED" &&
          new Date(m.utcDate).getTime() >= nowMs,
      )
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      .slice(0, count);

    // A live match is always worth showing, whatever the counts say.
    for (const match of [...played, ...upcoming, ...theirs.filter(isLive)]) {
      keep.add(match.id);
    }
  }

  return [...keep]
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}
