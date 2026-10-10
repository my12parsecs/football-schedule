import { connection } from "next/server";
import { getCatalog } from "@/lib/football/api";

/**
 * The club list for all five leagues, used to build the picker.
 *
 * `connection()` keeps this out of the build-time prerender: the API key is a
 * runtime value, and prerendering would otherwise bake the keyless sample
 * catalogue into the static response.
 */
export async function GET() {
  await connection();
  const catalog = await getCatalog();
  return Response.json(catalog);
}
