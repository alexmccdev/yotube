import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/route-safety";
import { routeYotoAccessToken } from "@/lib/yoto-route-session";
import { publishCard, type PublishTrack } from "@/lib/yoto-publisher";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as {
    title?: unknown;
    tracks?: unknown;
    existingCardId?: unknown;
    coverImageUrl?: unknown;
  };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const tracks = Array.isArray(body.tracks) ? body.tracks as PublishTrack[] : [];
  if (!title || tracks.length === 0 || tracks.length > 100) {
    return Response.json({ error: "A title and 1–100 uploaded tracks are required" }, { status: 400 });
  }
  if (tracks.some((track) => !track?.sha256 || !track.title || !Number.isFinite(track.duration))) {
    return Response.json({ error: "One or more tracks are incomplete" }, { status: 400 });
  }
  try {
    const accessToken = await routeYotoAccessToken(request);
    const published = await publishCard(
      accessToken,
      title,
      tracks,
      typeof body.existingCardId === "string" ? body.existingCardId : undefined,
      typeof body.coverImageUrl === "string" ? body.coverImageUrl : undefined,
    );
    return Response.json({
      yotoCardId: published.cardId,
      replacedDeletedCard: published.replacedDeletedCard,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Card publish failed" }, { status: 500 });
  }
}
