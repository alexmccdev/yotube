import { NextRequest, NextResponse } from "next/server";
import { completeYotoSession, YOTO_FLOW_COOKIE } from "@/lib/yoto-session";
import { clearFlowCookie, setSessionCookie } from "@/lib/yoto-route-session";

export async function GET(request: NextRequest) {
  const destination = new URL("/yoto-connected", request.url);
  try {
    const sessionCookie = await completeYotoSession(
      request.url,
      request.cookies.get(YOTO_FLOW_COOKIE)?.value,
    );
    const response = NextResponse.redirect(destination);
    setSessionCookie(response, request, sessionCookie);
    clearFlowCookie(response, request);
    return response;
  } catch {
    destination.searchParams.set("error", "login_failed");
    const response = NextResponse.redirect(destination);
    clearFlowCookie(response, request);
    return response;
  }
}
