import { LEAGUES } from "./config";
import type { Club, LeagueCode, Match, MatchStatus, MatchTeam, StandingRow } from "./types";

/**
 * Fallback data used when FOOTBALL_DATA_API_KEY is not set, so the app is
 * explorable without credentials. Fixtures are generated around the requested
 * window with a seeded RNG, so they stay stable across reloads but always land
 * in the dates the user is looking at. Scores here are invented, not real.
 */

type ClubSeed = [name: string, shortName: string, tla: string];

const CLUB_SEEDS: Record<LeagueCode, ClubSeed[]> = {
  PL: [
    ["Arsenal FC", "Arsenal", "ARS"],
    ["Aston Villa FC", "Aston Villa", "AVL"],
    ["AFC Bournemouth", "Bournemouth", "BOU"],
    ["Brentford FC", "Brentford", "BRE"],
    ["Brighton & Hove Albion FC", "Brighton", "BHA"],
    ["Burnley FC", "Burnley", "BUR"],
    ["Chelsea FC", "Chelsea", "CHE"],
    ["Crystal Palace FC", "Crystal Palace", "CRY"],
    ["Everton FC", "Everton", "EVE"],
    ["Fulham FC", "Fulham", "FUL"],
    ["Leeds United FC", "Leeds", "LEE"],
    ["Liverpool FC", "Liverpool", "LIV"],
    ["Manchester City FC", "Man City", "MCI"],
    ["Manchester United FC", "Man United", "MUN"],
    ["Newcastle United FC", "Newcastle", "NEW"],
    ["Nottingham Forest FC", "Nottingham", "NFO"],
    ["Sunderland AFC", "Sunderland", "SUN"],
    ["Tottenham Hotspur FC", "Tottenham", "TOT"],
    ["West Ham United FC", "West Ham", "WHU"],
    ["Wolverhampton Wanderers FC", "Wolves", "WOL"],
  ],
  PD: [
    ["Deportivo Alaves", "Alaves", "ALA"],
    ["Athletic Club", "Athletic", "ATH"],
    ["Club Atletico de Madrid", "Atleti", "ATM"],
    ["FC Barcelona", "Barcelona", "BAR"],
    ["RC Celta de Vigo", "Celta", "CEL"],
    ["Elche CF", "Elche", "ELC"],
    ["RCD Espanyol de Barcelona", "Espanyol", "ESP"],
    ["Getafe CF", "Getafe", "GET"],
    ["Girona FC", "Girona", "GIR"],
    ["Levante UD", "Levante", "LEV"],
    ["RCD Mallorca", "Mallorca", "MAL"],
    ["CA Osasuna", "Osasuna", "OSA"],
    ["Real Oviedo", "Oviedo", "OVI"],
    ["Rayo Vallecano de Madrid", "Rayo", "RAY"],
    ["Real Betis Balompie", "Betis", "BET"],
    ["Real Madrid CF", "Real Madrid", "RMA"],
    ["Real Sociedad de Futbol", "Real Sociedad", "RSO"],
    ["Sevilla FC", "Sevilla", "SEV"],
    ["Valencia CF", "Valencia", "VAL"],
    ["Villarreal CF", "Villarreal", "VIL"],
  ],
  SA: [
    ["Atalanta BC", "Atalanta", "ATA"],
    ["Bologna FC 1909", "Bologna", "BOL"],
    ["Cagliari Calcio", "Cagliari", "CAG"],
    ["Como 1907", "Como", "COM"],
    ["US Cremonese", "Cremonese", "CRE"],
    ["ACF Fiorentina", "Fiorentina", "FIO"],
    ["Genoa CFC", "Genoa", "GEN"],
    ["Hellas Verona FC", "Verona", "VER"],
    ["FC Internazionale Milano", "Inter", "INT"],
    ["Juventus FC", "Juventus", "JUV"],
    ["SS Lazio", "Lazio", "LAZ"],
    ["US Lecce", "Lecce", "LEC"],
    ["AC Milan", "Milan", "MIL"],
    ["SSC Napoli", "Napoli", "NAP"],
    ["Parma Calcio 1913", "Parma", "PAR"],
    ["Pisa Sporting Club", "Pisa", "PIS"],
    ["AS Roma", "Roma", "ROM"],
    ["US Sassuolo Calcio", "Sassuolo", "SAS"],
    ["Torino FC", "Torino", "TOR"],
    ["Udinese Calcio", "Udinese", "UDI"],
  ],
  BL1: [
    ["FC Augsburg", "Augsburg", "FCA"],
    ["Bayer 04 Leverkusen", "Leverkusen", "B04"],
    ["FC Bayern Munchen", "Bayern", "FCB"],
    ["Borussia Dortmund", "Dortmund", "BVB"],
    ["Borussia Monchengladbach", "Gladbach", "BMG"],
    ["Eintracht Frankfurt", "Frankfurt", "SGE"],
    ["1. FC Koln", "Koln", "KOE"],
    ["SC Freiburg", "Freiburg", "SCF"],
    ["Hamburger SV", "Hamburg", "HSV"],
    ["1. FC Heidenheim 1846", "Heidenheim", "FCH"],
    ["TSG 1899 Hoffenheim", "Hoffenheim", "TSG"],
    ["1. FSV Mainz 05", "Mainz", "M05"],
    ["RB Leipzig", "Leipzig", "RBL"],
    ["FC St. Pauli", "St. Pauli", "STP"],
    ["VfB Stuttgart", "Stuttgart", "VFB"],
    ["1. FC Union Berlin", "Union Berlin", "FCU"],
    ["SV Werder Bremen", "Werder", "SVW"],
    ["VfL Wolfsburg", "Wolfsburg", "WOB"],
  ],
  FL1: [
    ["Angers SCO", "Angers", "SCO"],
    ["AJ Auxerre", "Auxerre", "AJA"],
    ["Stade Brestois 29", "Brest", "SB29"],
    ["Le Havre AC", "Le Havre", "HAC"],
    ["RC Lens", "Lens", "RCL"],
    ["LOSC Lille", "Lille", "LOSC"],
    ["FC Lorient", "Lorient", "FCL"],
    ["Olympique Lyonnais", "Lyon", "OL"],
    ["Olympique de Marseille", "Marseille", "OM"],
    ["FC Metz", "Metz", "FCM"],
    ["AS Monaco FC", "Monaco", "ASM"],
    ["FC Nantes", "Nantes", "FCN"],
    ["OGC Nice", "Nice", "OGCN"],
    ["Paris FC", "Paris FC", "PFC"],
    ["Paris Saint-Germain FC", "PSG", "PSG"],
    ["Stade Rennais FC 1901", "Rennes", "SRFC"],
    ["RC Strasbourg Alsace", "Strasbourg", "RCSA"],
    ["Toulouse FC", "Toulouse", "TFC"],
  ],
};

/** Stable synthetic ids: league slot * 1000 + index, so they never collide. */
function clubId(league: LeagueCode, index: number): number {
  const slot = LEAGUES.findIndex((l) => l.code === league);
  return 900000 + slot * 1000 + index;
}

export function sampleClubs(league: LeagueCode): Club[] {
  return CLUB_SEEDS[league].map(([name, shortName, tla], index) => ({
    id: clubId(league, index),
    name,
    shortName,
    tla,
    crest: null,
    league,
  }));
}

function toMatchTeam(club: Club): MatchTeam {
  return { id: club.id, name: club.name, shortName: club.shortName, tla: club.tla, crest: null };
}

/** mulberry32 - small deterministic PRNG so sample scores never flicker. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Goal counts weighted toward realistic low scores. */
function goals(next: () => number): number {
  const r = next();
  if (r < 0.26) return 0;
  if (r < 0.58) return 1;
  if (r < 0.82) return 2;
  if (r < 0.94) return 3;
  return 4;
}

const DAY_MS = 86_400_000;
/** A Saturday, used as matchday 1 of the generated season. */
const ANCHOR = Date.UTC(2025, 7, 16, 0, 0, 0);
/** Kickoff slots as [day offset from Saturday, hour, minute]. */
const SLOTS: [number, number, number][] = [
  [0, 11, 30],
  [0, 14, 0],
  [0, 14, 0],
  [0, 16, 30],
  [0, 19, 0],
  [1, 12, 30],
  [1, 15, 0],
  [1, 15, 0],
  [1, 17, 30],
  [1, 19, 45],
];

/**
 * Round-robin pairing (circle method): club 0 stays fixed and the rest rotate,
 * so every club appears exactly once per round.
 *
 * Venues follow the usual double round-robin rules — the second half of the
 * season mirrors the first, and the fixed club alternates on odd rounds. Doing
 * this naively (for example keying off the pair index) correlates with the
 * rotation and leaves most clubs permanently at home or permanently away.
 */
function pairingsForRound(count: number, round: number): [number, number][] {
  const roundsPerHalf = count - 1;
  // Normalised round within the half, and which half of the season we are in.
  const offset = ((round % roundsPerHalf) + roundsPerHalf) % roundsPerHalf;
  const half = Math.floor(round / roundsPerHalf);
  const isReverseHalf = (((half % 2) + 2) % 2) === 1;

  const order = [0];
  for (let i = 0; i < roundsPerHalf; i++) {
    order.push(1 + ((i + offset) % roundsPerHalf));
  }

  const pairs: [number, number][] = [];
  for (let i = 0; i < count / 2; i++) {
    const a = order[i];
    const b = order[count - 1 - i];
    // Venue is a property of the pairing, not of the position in the round.
    // Deriving it from the rotation instead leaves clubs at home for five or
    // six rounds at a stretch, which is very visible in a two-week window.
    const [lo, hi] = a < b ? [a, b] : [b, a];
    // Needs a properly mixed hash: anything whose low bit tracks the club
    // indices correlates with the rotation and skews right back.
    const loAtHome = rng(lo * 997 + hi)() < 0.5;

    let home = loAtHome ? lo : hi;
    let away = loAtHome ? hi : lo;
    // The return fixture in the second half of the season swaps the venue.
    if (isReverseHalf) [home, away] = [away, home];
    pairs.push([home, away]);
  }
  return pairs;
}

export function sampleMatches(
  leagues: LeagueCode[],
  from: Date,
  to: Date,
  now: Date,
): Match[] {
  const matches: Match[] = [];
  const firstRound = Math.floor((from.getTime() - ANCHOR) / (7 * DAY_MS)) - 1;
  const lastRound = Math.ceil((to.getTime() - ANCHOR) / (7 * DAY_MS)) + 1;

  for (const league of leagues) {
    const clubs = sampleClubs(league);
    const rounds = (clubs.length - 1) * 2;
    // Nudge each league's kickoffs apart so the stream is not all simultaneous.
    const leagueOffsetMin = LEAGUES.findIndex((l) => l.code === league) * 15;

    for (let round = firstRound; round <= lastRound; round++) {
      const roundStart = ANCHOR + round * 7 * DAY_MS;

      pairingsForRound(clubs.length, round).forEach(([homeIdx, awayIdx], i) => {
        const [dayOffset, hour, minute] = SLOTS[i % SLOTS.length];
        const kickoff = new Date(
          roundStart +
            dayOffset * DAY_MS +
            hour * 3_600_000 +
            (minute + leagueOffsetMin) * 60_000,
        );
        if (kickoff < from || kickoff > to) return;

        const id = 900_000_000 + clubId(league, homeIdx) * 100 + (round + 60);
        const elapsedMs = now.getTime() - kickoff.getTime();
        let status: MatchStatus = "TIMED";
        if (elapsedMs >= 115 * 60_000) status = "FINISHED";
        else if (elapsedMs >= 0) status = "IN_PLAY";

        const played = status === "FINISHED" || status === "IN_PLAY";
        const next = rng(id);
        // Home advantage: an extra goal rolls in 18% of the time.
        const homeGoals = played ? goals(next) + (next() < 0.18 ? 1 : 0) : null;
        const awayGoals = played ? goals(next) : null;

        matches.push({
          id,
          league,
          utcDate: kickoff.toISOString(),
          status,
          matchday: (((round % rounds) + rounds) % rounds) + 1,
          minute: status === "IN_PLAY" ? Math.min(90, Math.floor(elapsedMs / 60_000)) : null,
          home: toMatchTeam(clubs[homeIdx]),
          away: toMatchTeam(clubs[awayIdx]),
          score: {
            home: homeGoals,
            away: awayGoals,
            halfTimeHome: homeGoals === null ? null : Math.floor(homeGoals / 2),
            halfTimeAway: awayGoals === null ? null : Math.floor(awayGoals / 2),
          },
        });
      });
    }
  }

  return matches;
}

/**
 * A plausible league table for the keyless sample mode, aggregated from the
 * same generated fixtures the rest of the sample data uses, so the table and
 * the results on the fixtures page agree with each other.
 */
export function sampleTable(league: LeagueCode): StandingRow[] {
  const now = new Date();
  const seasonStart = new Date(ANCHOR);
  const played = sampleMatches([league], seasonStart, now, now).filter(
    (match) => match.status === "FINISHED",
  );

  const rows = new Map<number, StandingRow>();
  for (const club of sampleClubs(league)) {
    rows.set(club.id, {
      position: 0,
      team: { id: club.id, name: club.name, shortName: club.shortName, tla: club.tla, crest: null },
      playedGames: 0,
      won: 0,
      draw: 0,
      lost: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
    });
  }

  for (const match of played) {
    const home = rows.get(match.home.id);
    const away = rows.get(match.away.id);
    if (!home || !away) continue;
    const homeGoals = match.score.home ?? 0;
    const awayGoals = match.score.away ?? 0;

    for (const [side, scored, conceded] of [
      [home, homeGoals, awayGoals],
      [away, awayGoals, homeGoals],
    ] as const) {
      side.playedGames += 1;
      side.goalsFor += scored;
      side.goalsAgainst += conceded;
      side.goalDifference = side.goalsFor - side.goalsAgainst;
      if (scored > conceded) {
        side.won += 1;
        side.points += 3;
      } else if (scored === conceded) {
        side.draw += 1;
        side.points += 1;
      } else {
        side.lost += 1;
      }
    }
  }

  const table = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.shortName.localeCompare(b.team.shortName),
  );
  table.forEach((row, index) => {
    row.position = index + 1;
  });
  return table;
}
