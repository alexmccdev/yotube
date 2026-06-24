import { startConnectYotoAccount } from "@/lib/yoto-auth";

export async function POST() {
  try {
    const { authorizeUrl } = startConnectYotoAccount();
    return Response.json({ authorizeUrl });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
