import { getCard, isLocked, setTrackIcon } from "@/lib/jobs";
import { pickIcon } from "@/lib/yoto-icons";

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

  const body = await request.json().catch(() => ({}) as { keyword?: string });
  const keyword = body.keyword?.trim() || undefined;

  const icon = await pickIcon(track.title, track.iconId ? [track.iconId] : [], keyword);
  if (!icon) {
    return Response.json({ error: "No matching icon found on yotoicons.com or Yoto's library" }, { status: 404 });
  }

  await setTrackIcon(id, trackId, icon);
  return Response.json({ iconUrl: icon.url, iconSource: icon.source });
}
