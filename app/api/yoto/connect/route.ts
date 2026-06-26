import { disconnect, startConnectYotoAccount } from "@/lib/yoto-auth";

export async function POST() {
  try {
    const { authorizeUrl } = await startConnectYotoAccount();
    return Response.json({ authorizeUrl });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  await disconnect();
  return Response.json({ ok: true });
}
