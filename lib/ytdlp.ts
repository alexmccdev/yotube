import { execa } from "execa";

export class ProcessError extends Error {
  stderr: string;
  constructor(message: string, stderr: string) {
    super(message);
    this.stderr = stderr;
  }
}

function stderrOf(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  }
  return err instanceof Error ? err.message : String(err);
}

export interface VideoMetadata {
  title: string;
  thumbnail?: string;
  duration?: number;
}

export async function fetchMetadata(url: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execa("yt-dlp", ["--dump-json", "--no-playlist", url]);
    const data = JSON.parse(stdout) as { title: string; thumbnail?: string; duration?: number };
    return { title: data.title, thumbnail: data.thumbnail, duration: data.duration };
  } catch (err) {
    throw new ProcessError("Failed to fetch video metadata", stderrOf(err));
  }
}

/** Downloads + extracts audio to `${outPathNoExt}.m4a`, returning the final path. */
export async function downloadAudio(url: string, outPathNoExt: string): Promise<string> {
  try {
    await execa("yt-dlp", [
      "-x",
      "--audio-format",
      "m4a",
      "--audio-quality",
      "128K",
      "--no-playlist",
      "-o",
      `${outPathNoExt}.%(ext)s`,
      url,
    ]);
  } catch (err) {
    throw new ProcessError("Failed to download audio", stderrOf(err));
  }
  return `${outPathNoExt}.m4a`;
}

/** Remuxes (no re-encode) and tags the already-AAC audio. */
export async function tagAndCopy(
  inputPath: string,
  outputPath: string,
  opts: { title: string; track: number; album: string },
): Promise<void> {
  try {
    await execa("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-c:a",
      "copy",
      "-metadata",
      `title=${opts.title}`,
      "-metadata",
      `track=${opts.track}`,
      "-metadata",
      `album=${opts.album}`,
      outputPath,
    ]);
  } catch (err) {
    throw new ProcessError("Failed to tag audio", stderrOf(err));
  }
}

export async function checkBinaries(): Promise<{ ytDlpOk: boolean; ffmpegOk: boolean }> {
  const [ytDlp, ffmpeg] = await Promise.allSettled([
    execa("yt-dlp", ["--version"]),
    execa("ffmpeg", ["-version"]),
  ]);
  return {
    ytDlpOk: ytDlp.status === "fulfilled",
    ffmpegOk: ffmpeg.status === "fulfilled",
  };
}
