# Fixtures — Europe's big five leagues

Upcoming fixtures and past results for clubs in the **Premier League**, **La Liga**,
**Serie A**, **Bundesliga** and **Ligue 1**, filtered down to the clubs you follow.

- One chronological stream with a **"now"** divider between played and upcoming, auto-centred on load.
- Matches are grouped under **sticky day headings** showing the date and how many matches
  it covers, so the date stays visible while you scroll through a long day.
- **Club picker** across all five leagues, with search and per-league select-all.
- **Results toggle** — hide every scoreline to avoid spoilers, then click an individual
  match to reveal just that one.
- **Click any match** to expand a detail panel: competition, matchday, kick-off, half-time
  score, each club's record and last-5 form going into the match, and any other meeting
  between the two this season. It is computed from the season data already in the browser,
  so expanding costs **no API request**.
- **Amount control** — the last 5 / 10 / 20 matches per club, and the same number ahead.
  It counts *matches*, not days, so the past side never empties out during an
  international break.
- Club selection, results toggle and match count are all saved to `localStorage` and restored
  on your next visit (and kept in sync across open tabs).
- Kickoffs are shown in your browser's local time **zone**; date text is formatted as
  en-GB so it reads consistently with the rest of the English UI.

## Pages

| Route | What |
| --- | --- |
| `/` | Fixture stream for your clubs, with click-to-expand match detail |
| `/tables` | Current league table for any of the five leagues |

The tables page highlights the clubs you follow and opens on a league you follow. All five
tables arrive in **one request**, and only the selected tab is rendered, so switching
leagues is instant and costs nothing.

The page navigation is pinned to the top of the viewport. On the fixtures page three
sticky layers stack: nav (`top-0`, `h-12`), toolbar (`top-12`, `h-14`), day headings
(`top-[6.5rem]`). Those offsets are hard-coded against each other — changing one bar's
height means changing the offsets below it.

## Getting started

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

Without an API key the app serves **generated sample fixtures** so you can explore the
UI. They use the real 2025/26 club lists, but the scores are invented.

### Using real data

Fixtures come from [football-data.org](https://www.football-data.org), whose free tier
covers exactly these five competitions.

1. Request a free key at <https://www.football-data.org/client/register>.
2. Put it in `.env.local` at the repo root:

   ```
   FOOTBALL_DATA_API_KEY=your_key_here
   ```

3. Restart the dev server.

The key is read **server-side only**. The browser talks to this app's own route handlers,
which call the upstream API and return normalised data — the key is never sent to the client.

## How the data flows

```
browser ──► /api/teams    ──► getCatalog()  ──► football-data.org  (cached: days)
        └─► /api/matches  ──► getMatches()  ──► football-data.org  (cached: ~2 min)
```

- `src/lib/football/api.ts` — the only module that touches the upstream API or the key.
  Both entry points are wrapped in `use cache` with an explicit `cacheLife`.
- `src/app/api/*/route.ts` — thin request-time handlers over those cached functions.
- `src/components/FixtureBoard.tsx` — client orchestrator: reads saved settings, fetches,
  filters to the selected clubs, and renders.
- `src/lib/settings.ts` — `localStorage` modelled as an external store via
  `useSyncExternalStore`, which avoids a hydration mismatch and gives cross-tab sync.

### Rate limits

A refresh costs one upstream request *per league you follow* — at most 5 — and only when
the server-side cache for that league has gone stale. See the table above for what each
action actually costs.

Matches refresh automatically every 60s while one of your clubs is playing.

## Scripts

| Command         | Does                                  |
| --------------- | ------------------------------------- |
| `npm run dev`   | Dev server                            |
| `npm run build` | Production build                      |
| `npm start`     | Serve the production build            |
| `npm run lint`  | ESLint                                |

## Not available on the free tier

Goal scorers, line-ups, substitutions, bookings and shot/possession statistics are **not
returned by football-data.org's free plan** — the fields are absent from
`/v4/matches/{id}`, not merely empty. Per their [pricing](https://www.football-data.org/pricing):

| Data | Requires |
| --- | --- |
| Goal scorers, line-ups, subs, bookings | "Free + Deep Data" tier, €29/mo |
| Shots, possession, corners, fouls, cards | Statistic Add-On, €15/mo on top |

The match detail panel therefore shows derived context (form, record, head-to-head) rather
than event-level data, and says so in the UI.

## Notes and limits

- **Sample vs. live club ids differ.** If you pick clubs without a key and then add one,
  the saved selection no longer resolves; the app detects this and offers to clear it.
- Only first divisions are included — no cup competitions or European ties.
- Only the current season is available, so at the very start of a season there are few or
  no past results to show.
