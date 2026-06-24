import { checkBinaries } from "@/lib/ytdlp";

export async function GET() {
  const binaries = await checkBinaries();
  return Response.json(binaries);
}
