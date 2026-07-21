import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/route-safety";
import { ingestTrack, probeTrackSource, type TrackSource } from "@/lib/track-ingest";
import { normalizeYoutubeInput } from "@/lib/validate";
import { routeYotoAccessToken } from "@/lib/yoto-route-session";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { url?: unknown; source?: TrackSource };
  const url = typeof body.url === "string" ? normalizeYoutubeInput(body.url) : undefined;
  if (!url) return Response.json({ error: "Enter a valid YouTube URL or video ID" }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ type: "progress", progress: { phase: "authorizing", totalBytes: body.source?.fileSize ?? 0 } });
        const accessToken = await routeYotoAccessToken(request);
        const source = body.source?.url === url ? body.source : await probeTrackSource(url, request.signal);
        const result = await ingestTrack(accessToken, source, request.signal, (progress) => {
          send({ type: "progress", progress });
        });
        send({ type: "result", result });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Track upload failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
