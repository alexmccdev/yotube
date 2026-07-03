import { addTracksBatch, getCard, renameCard } from "@/lib/jobs";
import { canonicalPlaylistUrl, isValidVideoId, isYoutubePlaylistUrl } from "@/lib/validate";
import { fetchPlaylistVideoIds, ProcessError } from "@/lib/ytdlp";

/** Resolves a playlist URL for the preview/confirm step, without creating any tracks. */
export async function GET(request: Request, ctx: RouteContext<"/api/cards/[id]/playlist">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "Card not found" }, { status: 404 });

  const url = new URL(request.url).searchParams.get("url")?.trim();
  if (!url || !isYoutubePlaylistUrl(url)) {
    return Response.json({ error: "Enter a valid YouTube playlist URL" }, { status: 400 });
  }

  try {
    const { playlistTitle, videos, skipped } = await fetchPlaylistVideoIds(canonicalPlaylistUrl(url) ?? url);
    return Response.json({ playlistTitle, videos, count: videos.length, skipped });
  } catch (err) {
    const message = err instanceof ProcessError ? `${err.message}: ${err.stderr}` : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}

/** Creates tracks for a confirmed list of videos from a playlist. */
export async function POST(request: Request, ctx: RouteContext<"/api/cards/[id]/playlist">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "Card not found" }, { status: 404 });

  const body = await request
    .json()
    .catch(() => ({}) as { videos?: { id?: string; title?: string }[]; playlistTitle?: string });
  const videos = (body.videos ?? [])
    .filter((v: { id?: string; title?: string }): v is { id: string; title: string } =>
      Boolean(v.id && v.title && isValidVideoId(v.id)),
    )
    .map((v: { id: string; title: string }) => ({
      videoId: v.id,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      title: v.title,
    }));

  if (videos.length === 0) {
    return Response.json({ error: "No videos to add" }, { status: 400 });
  }

  if (
    body.playlistTitle &&
    card.tracks.length === 0 &&
    !card.finalized &&
    card.title.trim() === "Untitled card"
  ) {
    await renameCard(id, body.playlistTitle);
  }

  const { added, skipped } = await addTracksBatch(id, videos);
  return Response.json({ added, skipped }, { status: 201 });
}
