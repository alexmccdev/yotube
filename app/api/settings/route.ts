import { clearClientId, getClientId, setClientId } from "@/lib/yoto-auth";

export async function GET() {
  return Response.json({ clientId: await getClientId() });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}) as { clientId?: string });
  const clientId = body.clientId?.trim();
  if (!clientId) return Response.json({ error: "clientId is required" }, { status: 400 });
  await setClientId(clientId);
  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearClientId();
  return Response.json({ ok: true });
}
