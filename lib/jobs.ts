import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { downloadAudio, fetchMetadata, getDuration, ProcessError } from "./ytdlp";
import { extractVideoId } from "./validate";
import { pickIcon } from "./yoto-icons";
import type { TrackStatus } from "./track-status";

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

const WORK_DIR = process.env.WORK_DIR ?? path.join(process.cwd(), "work");
const CARDS_DIR = process.env.CARDS_DIR ?? path.join(process.cwd(), "cards");

const cache = new Map<string, Card>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Card IDs are always `randomUUID()`. Rejecting anything else here keeps route params
 *  (which may contain `../` after URL-decoding) from ever reaching a filesystem path. */
function isValidCardId(cardId: string): boolean {
  return UUID_PATTERN.test(cardId);
}

function cardDir(cardId: string) {
  return path.join(WORK_DIR, cardId);
}

function statePath(cardId: string) {
  return path.join(cardDir(cardId), "state.json");
}

function rawAudioPath(cardId: string, trackId: string) {
  return path.join(cardDir(cardId), `${trackId}`);
}

/** Chains persist() calls per card so concurrent writes (e.g. multiple tracks in the
 *  same card downloading at once) never interleave two writeFile calls to the same path. */
const persistQueue = new Map<string, Promise<void>>();

async function persist(card: Card): Promise<void> {
  cache.set(card.id, card);
  const prior = persistQueue.get(card.id) ?? Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(cardDir(card.id), { recursive: true });
      const target = statePath(card.id);
      const tmpPath = `${target}.${randomUUID()}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(card, null, 2));
      await fs.rename(tmpPath, target);
    });
  persistQueue.set(card.id, next);
  return next;
}

export async function getCard(cardId: string): Promise<Card | undefined> {
  if (!isValidCardId(cardId)) return undefined;
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
  const cleaned = value.replace(/[\/\\:*?"<>|]/g, "").trim().slice(0, 80);
  // Reject dot-only results ("", ".", "..") so a title can never resolve to the parent
  // (or same) directory when joined with a base path.
  return /^\.*$/.test(cleaned) ? "untitled" : cleaned;
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

      const rawPath = await downloadAudio(track.url, rawAudioPath(cardId, trackId));
      const duration = await getDuration(rawPath);

      await updateTrack(cardId, trackId, { status: "ready", duration });
    } catch (err) {
      const message = err instanceof ProcessError ? `${err.message}: ${err.stderr}` : String(err);
      await updateTrack(cardId, trackId, { status: "error", error: message });
    }
  });
}

/** A staged (finalized) card is locked — unstage it (or unlink from Yoto, which unstages too) to edit. */
export function isLocked(card: Card): boolean {
  return card.finalized;
}

export async function addTrack(cardId: string, url: string, titleHint?: string): Promise<Track | undefined> {
  const card = await getCard(cardId);
  if (!card || isLocked(card)) return undefined;
  const track: Track = {
    id: randomUUID(),
    url,
    title: titleHint || url,
    status: "queued",
  };
  card.tracks.push(track);
  await persist(card);
  if (titleHint) void assignIconForTrack(cardId, track.id, titleHint);
  void processTrack(cardId, track.id);
  return track;
}

/**
 * Adds many tracks at once (e.g. from a playlist import). Dedupes against video IDs already
 * on the card — playlists, especially auto-generated "Mix" playlists, commonly repeat videos.
 * Paced with a small delay between job starts: the concurrency-3 pool only bounds simultaneous
 * yt-dlp processes, not how fast new ones get queued, and bursting 100+ requests risks YouTube
 * IP throttling.
 */
export async function addTracksBatch(
  cardId: string,
  videos: { videoId: string; url: string; title: string }[],
): Promise<{ added: Track[]; skipped: number }> {
  const card = await getCard(cardId);
  if (!card || isLocked(card)) return { added: [], skipped: videos.length };

  const existingIds = new Set(card.tracks.map((t) => extractVideoId(t.url)).filter(Boolean));
  const added: Track[] = [];
  let skipped = 0;

  for (const video of videos) {
    if (existingIds.has(video.videoId)) {
      skipped++;
      continue;
    }
    existingIds.add(video.videoId);
    const track = await addTrack(cardId, video.url, video.title);
    if (track) added.push(track);
    else skipped++;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { added, skipped };
}

export async function removeTrack(cardId: string, trackId: string): Promise<boolean> {
  const card = await getCard(cardId);
  const track = card?.tracks.find((t) => t.id === trackId);
  if (!card || !track || isLocked(card)) return false;
  card.tracks = card.tracks.filter((t) => t.id !== trackId);
  await persist(card);
  await fs.rm(`${rawAudioPath(cardId, trackId)}.m4a`, { force: true });
  if (track.filePath) await fs.rm(track.filePath, { force: true });
  return true;
}

export async function retryTrack(cardId: string, trackId: string): Promise<boolean> {
  const card = await getCard(cardId);
  const track = card?.tracks.find((t) => t.id === trackId);
  if (!card || !track || isLocked(card)) return false;
  await updateTrack(cardId, trackId, { status: "queued", error: undefined });
  void processTrack(cardId, trackId);
  return true;
}

export async function renameCard(cardId: string, title: string): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card || isLocked(card)) return false;
  card.title = title;
  await persist(card);
  return true;
}

export async function renameTrack(
  cardId: string,
  trackId: string,
  title: string,
): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card || !card.tracks.some((t) => t.id === trackId) || isLocked(card)) return false;
  await updateTrack(cardId, trackId, { title });
  return true;
}

export async function reorderTracks(cardId: string, trackIds: string[]): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card || isLocked(card)) return false;
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

/** Reverts a staged card to a draft: unlocks editing and puts tagged tracks back to "ready". */
export async function unstageCard(cardId: string): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card || !card.finalized) return false;
  card.finalized = false;
  card.tracks = card.tracks.map((t) => (t.status === "done" ? { ...t, status: "ready" } : t));
  await persist(card);
  return true;
}

export async function finalizeCard(
  cardId: string,
): Promise<{ ok: true; outputDir: string } | { ok: false; error: string }> {
  const card = await getCard(cardId);
  if (!card) return { ok: false, error: "Card not found" };
  if (card.finalized) return { ok: false, error: "Card is already staged" };
  if (card.tracks.length === 0) return { ok: false, error: "Card has no tracks" };
  if (card.tracks.some((t) => t.status !== "ready")) {
    return { ok: false, error: "All tracks must finish downloading before staging" };
  }

  // Suffix with a slice of the card ID so two cards sharing a title (or titles that
  // sanitize down to the same string) don't collide on the same output directory.
  const outputDir = path.join(CARDS_DIR, `${sanitizeFilename(card.title)}-${card.id.slice(0, 8)}`);
  if (card.outputDir && card.outputDir !== outputDir) {
    await fs.rm(card.outputDir, { recursive: true, force: true });
  }
  await fs.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < card.tracks.length; i++) {
    const track = card.tracks[i];
    const trackNumber = i + 1;
    const filename = `${String(trackNumber).padStart(2, "0")} - ${sanitizeFilename(track.title)}.m4a`;
    const outputPath = path.join(outputDir, filename);

    try {
      await fs.copyFile(`${rawAudioPath(cardId, track.id)}.m4a`, outputPath);
      await updateTrack(cardId, track.id, { status: "done", filePath: outputPath });
    } catch (err) {
      const message = err instanceof ProcessError ? `${err.message}: ${err.stderr}` : String(err);
      await updateTrack(cardId, track.id, { status: "error", error: message });
      return { ok: false, error: `Failed finalizing "${track.title}": ${message}` };
    }
  }

  const fresh = await getCard(cardId);
  if (fresh) {
    fresh.finalized = true;
    fresh.outputDir = outputDir;
    await persist(fresh);
  }

  void autoAssignIconsAndCover(cardId);

  return { ok: true, outputDir };
}

async function assignIconForTrack(cardId: string, trackId: string, title: string): Promise<void> {
  const card = await getCard(cardId);
  const track = card?.tracks.find((t) => t.id === trackId);
  if (!track || track.iconUrl) return;
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

/** Unlinking also unstages the card, since the Yoto card it was linked to no longer reflects any edits. */
export async function clearYotoCardId(cardId: string): Promise<boolean> {
  const card = await getCard(cardId);
  if (!card) return false;
  delete card.yotoCardId;
  card.finalized = false;
  card.tracks = card.tracks.map((t) => (t.status === "done" ? { ...t, status: "ready" } : t));
  await persist(card);
  return true;
}

/** In-memory progress is lost on restart: tracks mid-download just resume, and a push
 *  to Yoto that was interrupted mid-flight is reset so the UI doesn't show a stuck spinner. */
async function recoverIncompleteJobs(): Promise<void> {
  const cards = await listCards();
  for (const card of cards) {
    if (card.pushingToYoto) {
      await setPushError(card.id, "Interrupted by a server restart — please try again.");
    }
    if (card.finalized) continue;
    for (const track of card.tracks) {
      if (track.status === "queued" || track.status === "fetching" || track.status === "downloading") {
        void processTrack(card.id, track.id);
      }
    }
  }
}

declare global {
  var __yotubeJobsRecovered: boolean | undefined;
}

// Guard against `next build` (which imports route modules to collect metadata) kicking off
// real downloads or Yoto pushes as a side effect of module evaluation.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!isBuildPhase && !globalThis.__yotubeJobsRecovered) {
  globalThis.__yotubeJobsRecovered = true;
  void recoverIncompleteJobs();
}
