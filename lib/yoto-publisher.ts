import { randomUUID } from "node:crypto";
import type { IngestedTrack } from "./track-ingest";

const API_BASE = "https://api.yotoplay.com";
const YOUTUBE_THUMBNAIL_HOSTS = new Set(["i.ytimg.com", "img.youtube.com"]);

export type TrackIconSelection =
  | { source: "yoto-library"; mediaId: string; url: string }
  | { source: "yotoicons"; id: string; url: string };

export interface PublishTrack extends IngestedTrack {
  icon?: TrackIconSelection;
}

function deletedCardResponse(status: number, detail: string): boolean {
  return status === 404 || status === 410 || /card[^\n]*(not found|does not exist|deleted|unknown|invalid)/i.test(detail);
}

async function submitCard(
  accessToken: string,
  title: string,
  chapters: unknown[],
  cardId?: string,
  coverMediaUrl?: string,
): Promise<{ cardId: string; replacedDeletedCard: boolean }> {
  const response = await fetch(`${API_BASE}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(cardId ? { cardId } : {}),
      title,
      content: { chapters },
      ...(coverMediaUrl ? { metadata: { cover: { imageL: coverMediaUrl } } } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (cardId && deletedCardResponse(response.status, detail)) {
      const replacement = await submitCard(accessToken, title, chapters, undefined, coverMediaUrl);
      return { ...replacement, replacedDeletedCard: true };
    }
    throw new Error(`Yoto could not publish the card (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }
  const body = (await response.json()) as { card?: { cardId?: string }; cardId?: string };
  const publishedCardId = body.card?.cardId ?? body.cardId;
  if (!publishedCardId) throw new Error("Yoto published the card without returning its ID");
  return { cardId: publishedCardId, replacedDeletedCard: false };
}

function trustedYotoIconsUrl(icon: Extract<TrackIconSelection, { source: "yotoicons" }>): string {
  if (!/^\d+$/.test(icon.id)) throw new Error("Invalid community icon");
  return `https://www.yotoicons.com/static/uploads/${icon.id}.png`;
}

async function materializeIcon(accessToken: string, icon?: TrackIconSelection) {
  if (!icon) return undefined;
  if (icon.source === "yoto-library") return icon.mediaId;
  const image = await fetch(trustedYotoIconsUrl(icon), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; yotube/1.0)" },
  });
  if (!image.ok) throw new Error("The selected community icon is no longer available");
  const bytes = await image.arrayBuffer();
  if (bytes.byteLength > 1_000_000) throw new Error("The selected icon is too large");
  const response = await fetch(`${API_BASE}/media/displayIcons/user/me/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
    body: bytes,
  });
  if (!response.ok) throw new Error("Yoto could not save the selected icon");
  const body = (await response.json()) as { displayIcon?: { mediaId?: string } };
  return body.displayIcon?.mediaId;
}

function trustedThumbnailUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !YOUTUBE_THUMBNAIL_HOSTS.has(url.hostname)) {
    throw new Error("The selected card image is not a YouTube thumbnail");
  }
  return url.toString().replace("/vi_webp/", "/vi/").replace(/\.webp($|\?)/, ".jpg$1");
}

async function materializeCover(accessToken: string, coverImageUrl?: string) {
  if (!coverImageUrl) return undefined;
  const image = await fetch(trustedThumbnailUrl(coverImageUrl), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; yotube/1.0)" },
  });
  if (!image.ok) throw new Error("The selected card image is no longer available");
  const bytes = await image.arrayBuffer();
  if (bytes.byteLength > 10_000_000) throw new Error("The selected card image is too large");
  const contentType = image.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("The selected card image is not an image");
  const response = await fetch(
    `${API_BASE}/media/coverImage/user/me/upload?autoconvert=true&coverType=default`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
      body: bytes,
    },
  );
  if (!response.ok) throw new Error("Yoto could not save the card image");
  const body = (await response.json()) as { coverImage?: { mediaUrl?: string } };
  if (!body.coverImage?.mediaUrl) throw new Error("Yoto saved the card image without returning its URL");
  return body.coverImage.mediaUrl;
}

export async function publishCard(
  accessToken: string,
  title: string,
  tracks: PublishTrack[],
  existingCardId?: string,
  coverImageUrl?: string,
): Promise<{ cardId: string; replacedDeletedCard: boolean }> {
  if (!title.trim() || tracks.length === 0) throw new Error("A title and at least one track are required");
  const [icons, coverMediaUrl] = await Promise.all([
    Promise.all(tracks.map((track) => materializeIcon(accessToken, track.icon))),
    materializeCover(accessToken, coverImageUrl),
  ]);
  const chapters = tracks.map((track, index) => {
    const key = String(index + 1).padStart(2, "0");
    const display = icons[index] ? { icon16x16: `yoto:#${icons[index]}` } : {};
    return {
      key,
      title: track.title,
      display,
      defaultTrackDisplay: key,
      defaultTrackAmbient: key,
      tracks: [{
        key,
        uid: randomUUID(),
        title: track.title,
        trackUrl: `yoto:#${track.sha256}`,
        type: "audio",
        format: track.format,
        channels: track.channels,
        duration: track.duration,
        fileSize: track.fileSize,
        display,
      }],
    };
  });
  return submitCard(accessToken, title.trim(), chapters, existingCardId, coverMediaUrl);
}
