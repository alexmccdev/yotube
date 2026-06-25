import { getCard, isLocked, setTrackIcon } from "@/lib/jobs";
import { findIconCandidates, type IconCandidate } from "@/lib/yoto-icons";

const MAX_CANDIDATES = 12;

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/cards/[id]/tracks/[trackId]/icon">,
) {
  const { id, trackId } = await ctx.params;
  const card = await getCard(id);
  const track = card?.tracks.find((t) => t.id === trackId);
  if (!card || !track) return Response.json({ error: "not found" }, { status: 404 });

  const keyword = new URL(request.url).searchParams.get("keyword")?.trim() || undefined;
  const candidates = await findIconCandidates(track.title, keyword);
  return Response.json({ candidates: candidates.slice(0, MAX_CANDIDATES) });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/cards/[id]/tracks/[trackId]/icon">,
) {
  const { id, trackId } = await ctx.params;
  const card = await getCard(id);
  const track = card?.tracks.find((t) => t.id === trackId);
  if (!card || !track) return Response.json({ error: "not found" }, { status: 404 });
  if (isLocked(card)) {
    return Response.json({ error: "Card is staged — unstage it to edit" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}) as Partial<IconCandidate>);
  if (!body.url || !body.source || !body.id) {
    return Response.json({ error: "url, source, and id are required" }, { status: 400 });
  }

  await setTrackIcon(id, trackId, {
    url: body.url,
    source: body.source,
    id: body.id,
    mediaId: body.mediaId,
  });
  return Response.json({ ok: true });
}
