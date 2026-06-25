import { setCoverImageUrl } from "@/lib/jobs";

export async function PATCH(request: Request, ctx: RouteContext<"/api/cards/[id]/cover">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}) as { coverImageUrl?: string });
  const coverImageUrl = body.coverImageUrl?.trim();
  if (!coverImageUrl) return Response.json({ error: "coverImageUrl is required" }, { status: 400 });
  const ok = await setCoverImageUrl(id, coverImageUrl, "custom");
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
