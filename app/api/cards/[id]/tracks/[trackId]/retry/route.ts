import { retryTrack } from "@/lib/jobs";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/cards/[id]/tracks/[trackId]/retry">,
) {
  const { id, trackId } = await ctx.params;
  const ok = await retryTrack(id, trackId);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
