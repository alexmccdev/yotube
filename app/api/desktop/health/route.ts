import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const expected = process.env.YOTUBE_DESKTOP_STARTUP_TOKEN;
  const supplied = request.headers.get("x-yotube-startup-token");
  if (!expected || !supplied) return new Response(null, { status: 404 });
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
