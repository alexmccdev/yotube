import { deleteCard, getCard, renameCard } from "@/lib/jobs";

export async function GET(_request: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(card);
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}) as { title?: string });
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const ok = await renameCard(id, title);
  if (!ok) return Response.json({ error: "Card not found, or locked — unstage it to edit" }, { status: 400 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const { id } = await ctx.params;
  const ok = await deleteCard(id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
