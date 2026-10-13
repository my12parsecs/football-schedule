import type { NextRequest } from "next/server";
import { getSeasonMatches, parseLeagues } from "@/lib/football/api";

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * GET /api/matches?leagues=PL,SA&clubs=65,86
 *
 * Returns the full current season for the named leagues plus the current-season
 * matches for the selected clubs. The team feeds add domestic-cup and European
 * fixtures that are not present in the league feeds. Narrowing to "last N /
 * next N" happens in the browser.
 *
 * Reading the query string makes this request-time, but each league behind
 * `getSeasonMatches` is individually cached, so repeat loads and overlapping
 * league combinations do not spend the API quota.
 */
export async function GET(request: NextRequest) {
  const leagues = parseLeagues(request.nextUrl.searchParams.get("leagues"));
  const clubIds = request.nextUrl.searchParams
    .get("clubs")
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0) ?? [];
  if (leagues.length === 0 && clubIds.length === 0) {
    return badRequest("Specify at least one league code or club id.");
  }

  return Response.json(await getSeasonMatches(leagues, clubIds));
}
