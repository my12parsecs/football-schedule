import type { NextRequest } from "next/server";
import { getSeasonMatches, parseLeagues } from "@/lib/football/api";

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * GET /api/matches?leagues=PL,SA
 *
 * Returns the full current season for the named leagues. Narrowing to the
 * user's clubs and to "last N / next N" happens in the browser, so changing
 * clubs or the match count costs no request at all — only following a club in
 * a league that has not been loaded yet does.
 *
 * Reading the query string makes this request-time, but each league behind
 * `getSeasonMatches` is individually cached, so repeat loads and overlapping
 * league combinations do not spend the API quota.
 */
export async function GET(request: NextRequest) {
  const leagues = parseLeagues(request.nextUrl.searchParams.get("leagues"));
  if (leagues.length === 0) {
    return badRequest("Specify at least one league code (PL, PD, SA, BL1, FL1).");
  }

  return Response.json(await getSeasonMatches(leagues));
}
