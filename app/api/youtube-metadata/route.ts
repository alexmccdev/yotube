import { normalizeYoutubeInput } from "@/lib/validate";
import { fetchMetadata, ProcessError } from "@/lib/ytdlp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as { url?: string });
  const url = body.url?.trim();
  const normalized = url ? normalizeYoutubeInput(url) : undefined;
  if (!normalized) {
    return Response.json(
      { error: "Enter a valid YouTube URL or an 11-character video ID" },
      { status: 400 },
    );
  }

  try {
    const meta = await fetchMetadata(normalized);
    return Response.json({ title: meta.title, duration: meta.duration });
  } catch (err) {
    const message = err instanceof ProcessError ? summarize(err.stderr) : "Failed to fetch video info";
    return Response.json({ error: message }, { status: 502 });
  }
}

/** Pulls yt-dlp's actual ERROR line out of its (often noisy) stderr, if present. */
function summarize(stderr: string): string {
  const errorLine = stderr.split("\n").find((line) => line.startsWith("ERROR:"));
  return (errorLine ?? stderr).replace(/^ERROR:\s*/, "").split(". ")[0];
}
