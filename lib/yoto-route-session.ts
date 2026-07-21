import { NextRequest, NextResponse } from "next/server";
import {
  YOTO_FLOW_COOKIE,
  YOTO_SESSION_COOKIE,
  hasYotoSession,
  readYotoAccessToken,
} from "./yoto-session";

const MONTH = 30 * 24 * 60 * 60;

function secure(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

export function setFlowCookie(response: NextResponse, request: NextRequest, value: string): void {
  response.cookies.set(YOTO_FLOW_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(request),
    path: "/api/yoto/callback",
    maxAge: 10 * 60,
  });
}

export function clearFlowCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set(YOTO_FLOW_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(request),
    path: "/api/yoto/callback",
    maxAge: 0,
  });
}

export function setSessionCookie(response: NextResponse, request: NextRequest, value: string): void {
  response.cookies.set(YOTO_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(request),
    path: "/",
    maxAge: MONTH,
    priority: "high",
  });
}

export function clearSessionCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set(YOTO_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(request),
    path: "/",
    maxAge: 0,
  });
}

export function routeHasYotoSession(request: NextRequest): boolean {
  return hasYotoSession(request.cookies.get(YOTO_SESSION_COOKIE)?.value);
}

export function routeYotoAccessToken(request: NextRequest): string {
  return readYotoAccessToken(request.cookies.get(YOTO_SESSION_COOKIE)?.value);
}
