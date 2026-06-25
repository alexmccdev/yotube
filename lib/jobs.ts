import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { downloadAudio, fetchMetadata, tagAndCopy, ProcessError } from "./ytdlp";
import { pickIcon } from "./yoto-icons";

export type TrackStatus =
  | "queued"
  | "fetching"
  | "downloading"
  | "ready"
  | "tagging"
  | "done"
  | "error";

export interface Track {
  id: string;
  url: string;
  title: string;
  status: TrackStatus;
  error?: string;
  duration?: number;
  filePath?: string;
  thumbnail?: string;
  iconUrl?: string;
  iconSource?: "yotoicons" | "yoto-library";
  iconId?: string;
  iconMediaId?: string;
}

export interface Card {
  id: string;
  title: string;
  tracks: Track[];
  finalized: boolean;
  outputDir?: string;
  createdAt: string;
  yotoCardId?: string;
  pushingToYoto?: boolean;
  pushError?: string;
  coverImageUrl?: string;
  coverImageSource?: "youtube-thumbnail" | "custom";
}

const WORK_DIR = path.join(process.cwd(), "work");
const CARDS_DIR = process.env.CARDS_DIR ?? path.join(process.cwd(), "cards");

const cache = new Map<string, Card>();

function cardDir(cardId: string) {
  return path.join(WORK_DIR, cardId);
}

function statePath(cardId: string) {
  return path.join(cardDir(cardId), "state.json");
}

function rawAudioPath(cardId: string, trackId: string) {
  return path.join(cardDir(cardId), `${trackId}`);
}

async function persist(card: Card): Promise<void> {
  cache.set(card.id, card);
  await fs.mkdir(cardDir(card.id), { recursive: true });
  await fs.writeFile(statePath(card.id), JSON.stringify(card, null, 2));
}

export async function getCard(cardId: string): Promise<Card | undefined> {
  if (cache.has(cardId)) return cache.get(cardId);
  try {
    const raw = await fs.readFile(statePath(cardId), "utf8");
    const card = JSON.parse(raw) as Card;
    cache.set(cardId, card);
    return card;
  } catch {
    return undefined;
  }
}

export async function listCards(): Promise<Card[]> {
  const ids = await fs.readdir(WORK_DIR).catch(() => [] as string[]);
  const cards = await Promise.all(ids.map((id) => getCard(id)));
  return cards
    .filter((c): c is Card => c !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createCard(title: string): Promise<Card> {
  const card: Card = {
    id: randomUUID(),
    title,
    tracks: [],
    finalized: false,
    createdAt: new Date().toISOString(),
  };
  await persist(card);
  return card;
}

export function sanitizeFilename(value: string): string {
  return value.replace(/[\/\\:*?"<>|]/g, "").trim().slice(0, 80) || "untitled";
}

// --- bounded concurrency queue ---
const CONCURRENCY = 3;
let active = 0;
const waiting: (() => void)[] = [];

async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiting.shift();
    if (next) next();
  }
}

async function updateTrack(
  cardId: string,
  trackId: string,
  patch: Partial<Track>,
): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;
  const track = card.tracks.find((t) => t.id === trackId);
  if (!track) return;
  Object.assign(track, patch);
  await persist(card);
}

async function processTrack(cardId: string, trackId: string): Promise<void> {
  await withLimit(async () => {
    const card = await getCard(cardId);
    const track = card?.tracks.find((t) => t.id === trackId);
    if (!card || !track) return;

    try {
      await updateTrack(cardId, trackId, { status: "fetching", error: undefined });
      const meta = await fetchMetadata(track.url);

      await updateTrack(cardId, trackId, {
        status: "downloading",
        title: meta.title,
        duration: meta.duration,
        thumbnail: meta.thumbnail,
      });
      void assignIconForTrack(cardId, trackId, meta.title);
      void assignCoverFromThumbnail(cardId, meta.thumbnail);

      await downloadAudio(track.url, rawAudioPath(cardId, trackId));

      await updateTrack(cardId, trackId, { status: "ready" });
    } catch (err) {
      const message = err instanceof ProcessError ? `${err.message}: ${err.stderr}` : String(err);
      await updateTrack(cardId, trackId, { status: "error", error: message });
    }
  });
}

export async function addTrack(cardId: string, url: string): Promise<Track | undefined> {
  const card = await getCard(cardId);
  if (!card) return undefined;
  const track: Track = {
    id: randomUUID(),
    url,
    title: url,
    status: "queued",
  };
  card.tracks.push(track);
  await persist(card);
  void processTrack(cardId, track.id);
  return track;
}

export async function retryTrack(cardId: string, trackId: string): Promise<boolean> {
  const card = await getCard(cardId);
  const track = card?.tracks.find((t) => t.id === trackId);
  if (!card || !track) return false;
  await updateTrack(cardId, trackId, { status: "queued", error: undefined });
  void processTrack(cardId, trackId);
  return true;
}

export async function renameTrack(
  cardId: string,
  trackId: string,
  title: string,
): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card || !card.tracks.some((t) => t.id === trackId)) return false;
  if (card.finalized) return false;
  await updateTrack(cardId, trackId, { title });
  return true;
}

export async function reorderTracks(cardId: string, trackIds: string[]): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card) return false;
  if (
    trackIds.length !== card.tracks.length ||
    !trackIds.every((id) => card.tracks.some((t) => t.id === id))
  ) {
    return false;
  }
  const byId = new Map(card.tracks.map((t) => [t.id, t]));
  card.tracks = trackIds.map((id) => byId.get(id)!);
  await persist(card);
  return true;
}

export async function finalizeCard(
  cardId: string,
): Promise<{ ok: true; outputDir: string } | { ok: false; error: string }> {
  const card = await getCard(cardId);
  if (!card) return { ok: false, error: "Card not found" };
  if (card.tracks.length === 0) return { ok: false, error: "Card has no tracks" };
  if (card.tracks.some((t) => t.status !== "ready")) {
    return { ok: false, error: "All tracks must finish downloading before finalizing" };
  }

  const outputDir = path.join(CARDS_DIR, sanitizeFilename(card.title));
  await fs.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < card.tracks.length; i++) {
    const track = card.tracks[i];
    const trackNumber = i + 1;
    const filename = `${String(trackNumber).padStart(2, "0")} - ${sanitizeFilename(track.title)}.m4a`;
    const outputPath = path.join(outputDir, filename);

    try {
      await updateTrack(cardId, track.id, { status: "tagging" });
      await tagAndCopy(`${rawAudioPath(cardId, track.id)}.m4a`, outputPath, {
        title: track.title,
        track: trackNumber,
        album: card.title,
      });
      await updateTrack(cardId, track.id, { status: "done", filePath: outputPath });
    } catch (err) {
      const message = err instanceof ProcessError ? `${err.message}: ${err.stderr}` : String(err);
      await updateTrack(cardId, track.id, { status: "error", error: message });
      return { ok: false, error: `Failed tagging "${track.title}": ${message}` };
    }
  }

  const fresh = await getCard(cardId);
  if (fresh) {
    fresh.finalized = true;
    fresh.outputDir = outputDir;
    await persist(fresh);
  }

  await cleanupWorkAudio(cardId);

  void autoAssignIconsAndCover(cardId);

  return { ok: true, outputDir };
}

async function assignIconForTrack(cardId: string, trackId: string, title: string): Promise<void> {
  const icon = await pickIcon(title);
  if (icon) await setTrackIcon(cardId, trackId, icon);
}

async function assignCoverFromThumbnail(cardId: string, thumbnail?: string): Promise<void> {
  if (!thumbnail) return;
  const card = await getCard(cardId);
  if (!card || card.coverImageUrl) return;
  await setCoverImageUrl(cardId, thumbnail, "youtube-thumbnail");
}

async function autoAssignIconsAndCover(cardId: string): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;

  if (!card.coverImageUrl) {
    const thumbnail = card.tracks.find((t) => t.thumbnail)?.thumbnail;
    if (thumbnail) await setCoverImageUrl(cardId, thumbnail, "youtube-thumbnail");
  }

  for (const track of card.tracks) {
    if (track.iconUrl) continue;
    const icon = await pickIcon(track.title);
    if (icon) await setTrackIcon(cardId, track.id, icon);
  }
}

export async function setTrackIcon(
  cardId: string,
  trackId: string,
  icon: { url: string; source: "yotoicons" | "yoto-library"; id: string; mediaId?: string },
): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card || !card.tracks.some((t) => t.id === trackId)) return false;
  await updateTrack(cardId, trackId, {
    iconUrl: icon.url,
    iconSource: icon.source,
    iconId: icon.id,
    iconMediaId: icon.mediaId,
  });
  return true;
}

export async function setCoverImageUrl(
  cardId: string,
  coverImageUrl: string,
  source: "youtube-thumbnail" | "custom",
): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card) return false;
  card.coverImageUrl = coverImageUrl;
  card.coverImageSource = source;
  await persist(card);
  return true;
}

export async function deleteCard(cardId: string): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card) return false;
  cache.delete(cardId);
  await fs.rm(cardDir(cardId), { recursive: true, force: true });
  if (card.outputDir) await fs.rm(card.outputDir, { recursive: true, force: true });
  return true;
}

export async function setYotoCardId(cardId: string, yotoCardId: string): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;
  card.yotoCardId = yotoCardId;
  await persist(card);
}

export async function setPushingToYoto(cardId: string, pushing: boolean): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;
  card.pushingToYoto = pushing;
  if (pushing) delete card.pushError;
  await persist(card);
}

export async function setPushError(cardId: string, error: string): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;
  card.pushingToYoto = false;
  card.pushError = error;
  await persist(card);
}

export async function clearYotoCardId(cardId: string): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card) return false;
  delete card.yotoCardId;
  await persist(card);
  return true;
}

async function cleanupWorkAudio(cardId: string): Promise<void> {
  const dir = cardDir(cardId);
  const entries = await fs.readdir(dir).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name !== "state.json")
      .map((name) => fs.rm(path.join(dir, name), { force: true })),
  );
}
