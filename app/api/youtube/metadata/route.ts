import { NextRequest } from "next/server";
import { probeTrackSource } from "@/lib/track-ingest";
import { normalizeYoutubeInput } from "@/lib/validate";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { url?: unknown };
  const url = typeof body.url === "string" ? normalizeYoutubeInput(body.url) : undefined;
  if (!url) return Response.json({ error: "Enter a valid YouTube URL or video ID" }, { status: 400 });
  try {
    return Response.json(await probeTrackSource(url, request.signal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Video lookup failed" }, { status: 422 });
  }
}
