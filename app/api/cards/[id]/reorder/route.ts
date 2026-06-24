import { reorderTracks } from "@/lib/jobs";

export async function POST(request: Request, ctx: RouteContext<"/api/cards/[id]/reorder">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}) as { trackIds?: string[] });
  if (!body.trackIds) return Response.json({ error: "trackIds is required" }, { status: 400 });
  const ok = await reorderTracks(id, body.trackIds);
  if (!ok) return Response.json({ error: "invalid trackIds" }, { status: 400 });
  return Response.json({ ok: true });
}
