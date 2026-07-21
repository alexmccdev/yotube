import { NextRequest } from "next/server";
import { findIconCandidates } from "@/lib/yoto-icons";
import { rateLimit } from "@/lib/rate-limit";
import { routeYotoAccessToken } from "@/lib/yoto-route-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { scope: "yoto-icon-search", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const title = request.nextUrl.searchParams.get("title")?.slice(0, 200).trim();
  const keyword = request.nextUrl.searchParams.get("q")?.slice(0, 80).trim();
  if (!title) return Response.json({ error: "Track title is required" }, { status: 400 });
  try {
    const accessToken = await routeYotoAccessToken(request);
    return Response.json(await findIconCandidates(title, keyword, accessToken));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Icon search failed" }, { status: 401 });
  }
}
