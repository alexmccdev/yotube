import { NextRequest, NextResponse } from "next/server";
import { refreshYotoSession, YOTO_SESSION_COOKIE } from "@/lib/yoto-session";
import { routeYotoAccessToken, setSessionCookie } from "@/lib/yoto-route-session";
import { isSameOrigin } from "@/lib/route-safety";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  try {
    const sealed = request.cookies.get(YOTO_SESSION_COOKIE)?.value;
    if (!sealed) {
      routeYotoAccessToken(request);
      return NextResponse.json({ ok: true });
    }
    const refreshed = await refreshYotoSession(sealed);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, request, refreshed);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh Yoto login" },
      { status: 401 },
    );
  }
}
