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
 * A URL counts as a playlist link if it has a `list=` param (and no `v=` param — a URL
 * with both is a single video played from within a playlist, which yt-dlp treats as the
 * video alone, and we match that to avoid surprising single-video pastes).
 */
export function isYoutubePlaylistUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!isYoutubeUrl(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    if (url.searchParams.get("v")) return false;
    if (url.searchParams.get("list")) return true;
    return url.pathname.startsWith("/playlist");
  } catch {
    return false;
  }
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
