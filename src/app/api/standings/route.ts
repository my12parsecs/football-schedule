import type { NextRequest } from "next/server";
import { getStandings, parseLeagues } from "@/lib/football/api";

/**
 * GET /api/standings?leagues=PL,PD
 *
 * League tables for the named competitions. Each league is cached individually
 * upstream, so viewing a second league never re-fetches the first.
 */
export async function GET(request: NextRequest) {
  const leagues = parseLeagues(request.nextUrl.searchParams.get("leagues"));
  if (leagues.length === 0) {
    return Response.json(
      { error: "Specify at least one league code (PL, PD, SA, BL1, FL1)." },
      { status: 400 },
    );
  }

  return Response.json(await getStandings(leagues));
}
