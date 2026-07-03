import { execa } from "execa";
import { promises as fs } from "fs";

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

const METADATA_TIMEOUT_MS = 30_000;
const PLAYLIST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const FFMPEG_TIMEOUT_MS = 5 * 60_000;
const FFPROBE_TIMEOUT_MS = 30_000;

export async function fetchMetadata(url: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execa("yt-dlp", ["--dump-json", "--no-playlist", url], {
      timeout: METADATA_TIMEOUT_MS,
    });
    const data = JSON.parse(stdout) as { title: string; thumbnail?: string; duration?: number };
    return { title: data.title, thumbnail: data.thumbnail, duration: data.duration };
  } catch (err) {
    throw new ProcessError("Failed to fetch video metadata", stderrOf(err));
  }
}

export interface PlaylistVideo {
  id: string;
  title: string;
}

export interface PlaylistListing {
  playlistTitle?: string;
  videos: PlaylistVideo[];
  /** Entries yt-dlp returned but couldn't be used (unparseable, private, or deleted). */
  skipped: number;
}

/**
 * Lists a playlist's videos without downloading anything. Uses `--flat-playlist` so this
 * stays fast even for large playlists. Unavailable entries (private/deleted videos) come
 * back as stub JSON lines rather than being omitted, so each line is checked individually
 * instead of failing the whole listing.
 */
export async function fetchPlaylistVideoIds(url: string): Promise<PlaylistListing> {
  let stdout: string;
  try {
    const result = await execa("yt-dlp", ["--flat-playlist", "--dump-json", url], {
      timeout: PLAYLIST_TIMEOUT_MS,
    });
    stdout = result.stdout;
  } catch (err) {
    throw new ProcessError("Failed to fetch playlist", stderrOf(err));
  }

  const videos: PlaylistVideo[] = [];
  let skipped = 0;
  let playlistTitle: string | undefined;

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let entry: { id?: string; title?: string; availability?: string; playlist_title?: string };
    try {
      entry = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    if (!playlistTitle && entry.playlist_title) playlistTitle = entry.playlist_title;
    if (!entry.id || !entry.title || (entry.availability && entry.availability !== "public")) {
      skipped++;
      continue;
    }
    videos.push({ id: entry.id, title: entry.title });
  }

  return { playlistTitle, videos, skipped };
}

/** Loudness normalization, applied uniformly so tracks pulled from different sources
 *  don't vary wildly in level when played back to back. */
const AUDIO_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11";

/** Downloads, extracts, and loudness-normalizes audio to `${outPathNoExt}.m4a`, returning
 *  the final path. Normalizing here (rather than at finalize) means it rides along with
 *  yt-dlp's extraction re-encode instead of costing a second one later. */
export async function downloadAudio(url: string, outPathNoExt: string): Promise<string> {
  const outputPath = `${outPathNoExt}.m4a`;
  const rawPath = `${outPathNoExt}.raw.m4a`;
  try {
    await execa(
      "yt-dlp",
      [
        "-x",
        "--audio-format",
        "m4a",
        "--audio-quality",
        "64K",
        "--no-playlist",
        "-o",
        `${outPathNoExt}.raw.%(ext)s`,
        url,
      ],
      { timeout: DOWNLOAD_TIMEOUT_MS },
    );
    await execa(
      "ffmpeg",
      ["-y", "-i", rawPath, "-af", AUDIO_FILTER, "-c:a", "aac", "-b:a", "64k", outputPath],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
  } catch (err) {
    throw new ProcessError("Failed to download audio", stderrOf(err));
  } finally {
    await fs.rm(rawPath, { force: true });
  }
  return outputPath;
}

export async function getDuration(filePath: string): Promise<number> {
  const { stdout } = await execa(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { timeout: FFPROBE_TIMEOUT_MS },
  );
  return Math.round(Number(stdout.trim()));
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
