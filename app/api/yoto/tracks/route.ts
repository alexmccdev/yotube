import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/route-safety";
import { rateLimit } from "@/lib/rate-limit";
import { probeTrackSource, readTrackTranscode, uploadTrack, type TrackSource } from "@/lib/track-ingest";
import { normalizeYoutubeInput } from "@/lib/validate";
import { routeYotoAccessToken } from "@/lib/yoto-route-session";

export const maxDuration = 60;

function isTrackSource(value: unknown): value is TrackSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<TrackSource>;
  return typeof source.url === "string"
    && typeof source.title === "string"
    && Number.isFinite(source.duration)
    && Number.isFinite(source.fileSize)
    && source.fileSize! > 0;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    uploadId?: unknown;
    url?: unknown;
    source?: unknown;
  };
  const url = typeof body.url === "string" ? normalizeYoutubeInput(body.url) : undefined;
  if (!url) return Response.json({ error: "Enter a valid YouTube URL or video ID" }, { status: 400 });
  if (body.action === "status") {
    const limited = rateLimit(request, { scope: "yoto-track-status", limit: 120, windowMs: 60_000 });
    if (limited) return limited;
    if (
      typeof body.uploadId !== "string"
      || body.uploadId.length > 200
      || !/^[A-Za-z0-9_-]+$/.test(body.uploadId)
      || !isTrackSource(body.source)
      || body.source.url !== url
    ) {
      return Response.json({ error: "The pending upload is invalid" }, { status: 400 });
    }
    try {
      const accessToken = await routeYotoAccessToken(request);
      const result = await readTrackTranscode(accessToken, body.uploadId, body.source, request.signal);
      return result
        ? Response.json({ status: "complete", result })
        : Response.json({ status: "processing" }, { status: 202 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Track status check failed" },
        { status: 500 },
      );
    }
  }
  const limited = rateLimit(request, { scope: "yoto-track-upload", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({
          type: "progress",
          progress: { phase: "authorizing", totalBytes: isTrackSource(body.source) ? body.source.fileSize : 0 },
        });
        const accessToken = await routeYotoAccessToken(request);
        const source = isTrackSource(body.source) && body.source.url === url
          ? body.source
          : await probeTrackSource(url, request.signal);
        const uploadId = await uploadTrack(accessToken, source, request.signal, (progress) => {
          send({ type: "progress", progress });
        });
        send({ type: "uploaded", uploadId });
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
