import { removeTrack, renameTrack } from "@/lib/jobs";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/cards/[id]/tracks/[trackId]">,
) {
  const { id, trackId } = await ctx.params;
  const body = await request.json().catch(() => ({}) as { title?: string });
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const ok = await renameTrack(id, trackId, title);
  if (!ok) return Response.json({ error: "not found, or locked — unstage it to edit" }, { status: 400 });
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/cards/[id]/tracks/[trackId]">,
) {
  const { id, trackId } = await ctx.params;
  const ok = await removeTrack(id, trackId);
  if (!ok) return Response.json({ error: "not found, or locked — unstage it to edit" }, { status: 400 });
  return Response.json({ ok: true });
}
