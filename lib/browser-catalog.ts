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
      .map((card) => {
        if (card.coverImageUrl) return card;
        const firstWithThumbnail = card.tracks.find((track) => track.source?.thumbnail);
        return firstWithThumbnail ? {
          ...card,
          coverImageUrl: firstWithThumbnail.source.thumbnail,
          coverSourceTrackId: firstWithThumbnail.id,
        } : card;
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
