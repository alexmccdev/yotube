import { deleteCard, getCard } from "@/lib/jobs";

export async function GET(_request: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(card);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const { id } = await ctx.params;
  const ok = await deleteCard(id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
