/**
 * Date helpers for the fixture stream.
 *
 * Everything here works in the viewer's local time *zone*: kickoffs arrive from
 * the API as UTC instants, but a match at 21:00 CET should sit under the day
 * the viewer would call it.
 *
 * The formatting *locale* is pinned to en-GB rather than following the browser,
 * so the dates match the English UI around them instead of rendering a run of
 * "Tomorrow 10月11日(日)". It also gets us 24-hour kickoff times, which is what
 * football uses. The zone still comes from the viewer, which is the part that
 * affects correctness.
 */

const DAY_MS = 86_400_000;

/** Pinned so date text matches the English UI; see the note above. */
const LOCALE = "en-GB";

/** Local-time `yyyy-MM-dd`, used to group matches into day buckets. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Midnight local time on the day containing `date`. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days from today to `dateKey`; negative is in the past. */
function dayDelta(dateKey: string, now: Date): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  return Math.round((target.getTime() - startOfDay(now).getTime()) / DAY_MS);
}

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const weekdayWithYearFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Day heading for a date bucket, e.g. `{ relative: "Today", absolute: "Sat 10 Oct" }`.
 * `relative` is null for dates outside the yesterday/today/tomorrow window.
 */
export function formatDayHeading(
  dateKey: string,
  now: Date,
): { relative: string | null; absolute: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const delta = dayDelta(dateKey, now);

  const relative =
    delta === 0 ? "Today" : delta === 1 ? "Tomorrow" : delta === -1 ? "Yesterday" : null;

  const sameYear = date.getFullYear() === now.getFullYear();
  const absolute = sameYear ? weekdayFormat.format(date) : weekdayWithYearFormat.format(date);

  return { relative, absolute };
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

/** Kickoff time in the viewer's local zone, e.g. "21:00". */
export function formatKickoff(date: Date): string {
  return timeFormat.format(date);
}

/** The viewer's IANA zone, shown once in the header so times are unambiguous. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local time";
  } catch {
    return "local time";
  }
}

/** Compact "updated 3 min ago" style label for the data freshness indicator. */
export function formatRelativeTime(from: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - from.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
