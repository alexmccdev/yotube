import { finalizeCard } from "@/lib/jobs";

export async function POST(_request: Request, ctx: RouteContext<"/api/cards/[id]/finalize">) {
  const { id } = await ctx.params;
  const result = await finalizeCard(id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ outputDir: result.outputDir });
}
