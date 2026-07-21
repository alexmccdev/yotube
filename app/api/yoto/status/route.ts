import { NextRequest, NextResponse } from "next/server";
import { routeHasYotoSession } from "@/lib/yoto-route-session";

export async function GET(request: NextRequest) {
  return NextResponse.json({ connected: routeHasYotoSession(request), error: null });
}
