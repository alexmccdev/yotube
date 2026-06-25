import { getCard, isLocked, setCoverImageUrl } from "@/lib/jobs";

export async function PATCH(request: Request, ctx: RouteContext<"/api/cards/[id]/cover">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "not found" }, { status: 404 });
  if (isLocked(card)) {
    return Response.json({ error: "Card is staged — unstage it to edit" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}) as { coverImageUrl?: string });
  const coverImageUrl = body.coverImageUrl?.trim();
  if (!coverImageUrl) return Response.json({ error: "coverImageUrl is required" }, { status: 400 });
  await setCoverImageUrl(id, coverImageUrl, "custom");
  return Response.json({ ok: true });
}
