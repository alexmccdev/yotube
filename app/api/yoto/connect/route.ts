import { NextRequest, NextResponse } from "next/server";
import { beginYotoSession } from "@/lib/yoto-session";
import { clearFlowCookie, clearSessionCookie, setFlowCookie } from "@/lib/yoto-route-session";
import { isSameOrigin } from "@/lib/route-safety";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const { authorizeUrl, flowCookie } = await beginYotoSession(
      request.url,
      clientId,
      request.headers.get("origin"),
    );
    const response = NextResponse.json({ authorizeUrl });
    setFlowCookie(response, request, flowCookie);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to begin Yoto login" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, request);
  clearFlowCookie(response, request);
  return response;
}
