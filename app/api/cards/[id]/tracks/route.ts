import { addTrack } from "@/lib/jobs";
import { normalizeYoutubeInput } from "@/lib/validate";

export async function POST(request: Request, ctx: RouteContext<"/api/cards/[id]/tracks">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}) as { url?: string });
  const url = body.url?.trim();
  const normalized = url ? normalizeYoutubeInput(url) : undefined;
  if (!normalized) {
    return Response.json(
      { error: "Enter a valid YouTube URL or an 11-character video ID" },
      { status: 400 },
    );
  }
  const track = await addTrack(id, normalized);
  if (!track) return Response.json({ error: "Card not found" }, { status: 404 });
  return Response.json(track, { status: 201 });
}
