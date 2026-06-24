import { getLastConnectError, isConnected } from "@/lib/yoto-auth";

export async function GET() {
  return Response.json({ connected: await isConnected(), error: getLastConnectError() });
}
