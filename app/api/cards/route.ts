import { createCard, listCards } from "@/lib/jobs";

export async function GET() {
  const cards = await listCards();
  return Response.json(cards);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as { title?: string });
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const card = await createCard(title);
  return Response.json(card, { status: 201 });
}
