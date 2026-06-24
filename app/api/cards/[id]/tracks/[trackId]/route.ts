import { renameTrack } from "@/lib/jobs";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/cards/[id]/tracks/[trackId]">,
) {
  const { id, trackId } = await ctx.params;
  const body = await request.json().catch(() => ({}) as { title?: string });
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const ok = await renameTrack(id, trackId, title);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
