import { unstageCard } from "@/lib/jobs";

export async function POST(_request: Request, ctx: RouteContext<"/api/cards/[id]/unstage">) {
  const { id } = await ctx.params;
  const ok = await unstageCard(id);
  if (!ok) return Response.json({ error: "Card not found, or not staged" }, { status: 400 });
  return Response.json({ ok: true });
}
