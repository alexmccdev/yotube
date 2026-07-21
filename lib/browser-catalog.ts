import type { IngestedTrack, TrackSource } from "./track-ingest";
import type { TrackIconSelection } from "./yoto-publisher";

export const CATALOG_KEY = "yotube.catalog.v1";

export type BrowserTrackState = "draft" | "uploading" | "uploaded" | "error";

export interface BrowserTrack {
  id: string;
  source: TrackSource;
  ingested?: IngestedTrack;
  icon?: TrackIconSelection;
  state: BrowserTrackState;
  error?: string;
}

export interface BrowserCard {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  tracks: BrowserTrack[];
  coverImageUrl?: string;
  coverSourceTrackId?: string;
  yotoCardId?: string;
  publishedFingerprint?: string;
}

interface BrowserCatalog {
  version: 1;
  cards: BrowserCard[];
}

export function loadCatalog(storage: Pick<Storage, "getItem">): BrowserCard[] {
  try {
    const parsed = JSON.parse(storage.getItem(CATALOG_KEY) ?? "null") as BrowserCatalog | null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cards)) return [];
    return parsed.cards
      .filter((card) => card?.id && typeof card?.title === "string" && Array.isArray(card.tracks))
      .map((storedCard) => {
        const card = storedCard.coverImageUrl ? storedCard : (() => {
          const firstWithThumbnail = storedCard.tracks.find((track) => track.source?.thumbnail);
          return firstWithThumbnail ? {
            ...storedCard,
            coverImageUrl: firstWithThumbnail.source.thumbnail,
            coverSourceTrackId: firstWithThumbnail.id,
          } : storedCard;
        })();
        return card.yotoCardId && !card.publishedFingerprint
          ? { ...card, publishedFingerprint: cardPublishFingerprint(card) }
          : card;
      });
  } catch {
    return [];
  }
}

export function saveCatalog(storage: Pick<Storage, "setItem">, cards: BrowserCard[]): void {
  storage.setItem(CATALOG_KEY, JSON.stringify({ version: 1, cards } satisfies BrowserCatalog));
}

export function newBrowserCard(title = ""): BrowserCard {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, tracks: [] };
}

export function cardPublishFingerprint(card: BrowserCard): string {
  return JSON.stringify({
    title: card.title.trim(),
    coverImageUrl: card.coverImageUrl ?? null,
    tracks: card.tracks.map((track) => ({
      url: track.source.url,
      ingest: track.ingested ? {
        sha256: track.ingested.sha256,
        title: track.ingested.title,
        duration: track.ingested.duration,
        fileSize: track.ingested.fileSize,
        format: track.ingested.format,
        channels: track.ingested.channels ?? null,
      } : null,
      icon: track.icon?.source === "yoto-library"
        ? { source: track.icon.source, mediaId: track.icon.mediaId }
        : track.icon ? { source: track.icon.source, id: track.icon.id } : null,
    })),
  });
}

export function removeBrowserTrack(card: BrowserCard, trackId: string): BrowserCard {
  const tracks = card.tracks.filter((track) => track.id !== trackId);
  if (card.coverSourceTrackId !== trackId) {
    return { ...card, tracks };
  }
  const fallback = tracks.find((track) => track.source.thumbnail);
  return {
    ...card,
    tracks,
    coverImageUrl: fallback?.source.thumbnail,
    coverSourceTrackId: fallback?.id,
  };
}
