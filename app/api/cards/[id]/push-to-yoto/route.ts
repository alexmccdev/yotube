import {
  clearYotoCardId,
  getCard,
  setPushError,
  setPushingToYoto,
  setYotoCardId,
} from "@/lib/jobs";
import { pushCardToYoto } from "@/lib/yoto-api";

export async function POST(_request: Request, ctx: RouteContext<"/api/cards/[id]/push-to-yoto">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "Card not found" }, { status: 404 });
  if (!card.finalized || !card.outputDir) {
    return Response.json({ error: "Card must be staged before pushing to Yoto" }, { status: 400 });
  }
  if (card.pushingToYoto) {
    return Response.json({ error: "Already pushing this card to Yoto" }, { status: 409 });
  }

  await setPushingToYoto(id, true);

  try {
    const tracks = card.tracks.map((track, index) => {
      const trackNumber = index + 1;
      if (!track.filePath) {
        throw new Error(`Track "${track.title}" has no output file; unstage and re-stage the card`);
      }
      return {
        title: track.title,
        filePath: track.filePath,
        duration: track.duration ?? 0,
        trackNumber,
        iconUrl: track.iconUrl,
        iconMediaId: track.iconMediaId,
      };
    });

    const { yotoCardId } = await pushCardToYoto(card.title, tracks, card.coverImageUrl);
    await setYotoCardId(id, yotoCardId);
    await setPushingToYoto(id, false);
    return Response.json({ yotoCardId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setPushError(id, message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/cards/[id]/push-to-yoto">) {
  const { id } = await ctx.params;
  const ok = await clearYotoCardId(id);
  if (!ok) return Response.json({ error: "Card not found" }, { status: 404 });
  return Response.json({ ok: true });
}
