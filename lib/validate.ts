const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
]);

export function isYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, "");
    return YOUTUBE_HOSTS.has(host);
  } catch {
    return false;
  }
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Accepts either a full YouTube URL or a bare 11-char video ID (the part
 * after `v=`) and returns a canonical watch URL, or undefined if neither matches.
 */
export function normalizeYoutubeInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (isYoutubeUrl(trimmed)) return trimmed;
  if (VIDEO_ID_PATTERN.test(trimmed)) return `https://www.youtube.com/watch?v=${trimmed}`;
  return undefined;
}

/**
 * A URL counts as a playlist link if it has a `list=` param, even when a `v=` param is
 * also present — that's the common case of copying the address bar URL while watching the
 * first video of a playlist. The exception is auto-generated Mix/Radio lists (`list=RD...`),
 * which YouTube can't list independently of the seed video, so those stay single-video adds.
 */
export function isYoutubePlaylistUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!isYoutubeUrl(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    const list = url.searchParams.get("list");
    if (list) return !list.startsWith("RD");
    if (url.searchParams.get("v")) return false;
    return url.pathname.startsWith("/playlist");
  } catch {
    return false;
  }
}

/**
 * Extracts the canonical `https://www.youtube.com/playlist?list=...` URL from any playlist
 * link. yt-dlp's playlist-tab extractor doesn't reliably resolve a `watch?v=...&list=...`
 * URL (it sometimes decides the video isn't part of the playlist and falls back to a single
 * video), but it always resolves the bare `/playlist?list=...` form, so callers should pass
 * that to yt-dlp instead of the original URL.
 */
export function canonicalPlaylistUrl(value: string): string | undefined {
  if (!isYoutubePlaylistUrl(value)) return undefined;
  const list = new URL(value.trim()).searchParams.get("list");
  return list ? `https://www.youtube.com/playlist?list=${list}` : undefined;
}

/** Extracts the 11-char video ID from a YouTube URL or bare ID, for dedupe comparisons. */
export function extractVideoId(value: string): string | undefined {
  const trimmed = value.trim();
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (!YOUTUBE_HOSTS.has(host)) return undefined;
    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return VIDEO_ID_PATTERN.test(id) ? id : undefined;
    }
    const id = url.searchParams.get("v");
    return id && VIDEO_ID_PATTERN.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
