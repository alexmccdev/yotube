import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ytdlp", () => {
  class ProcessError extends Error {
    stderr: string;
    constructor(message: string, stderr: string) {
      super(message);
      this.stderr = stderr;
    }
  }
  return {
    ProcessError,
    fetchMetadata: vi.fn(async () => ({
      title: "Mock Title",
      duration: 42,
      thumbnail: "https://example.com/thumb.jpg",
    })),
    downloadAudio: vi.fn(async (_url: string, outPathNoExt: string) => {
      await mkdir(path.dirname(outPathNoExt), { recursive: true });
      await writeFile(`${outPathNoExt}.m4a`, "fake audio");
      return `${outPathNoExt}.m4a`;
    }),
    getDuration: vi.fn(async () => 42),
  };
});

vi.mock("./yoto-icons", () => ({
  pickIcon: vi.fn(async () => undefined),
}));

import { isLocked, sanitizeFilename } from "./jobs";

describe("sanitizeFilename", () => {
  it("strips filesystem-unsafe characters", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("trims whitespace", () => {
    expect(sanitizeFilename("  hello  ")).toBe("hello");
  });

  it("truncates to 80 characters", () => {
    expect(sanitizeFilename("a".repeat(200))).toHaveLength(80);
  });

  it("falls back to 'untitled' when nothing is left", () => {
    expect(sanitizeFilename("")).toBe("untitled");
    expect(sanitizeFilename("***")).toBe("untitled");
  });
});

describe("isLocked", () => {
  it("is locked only once finalized", () => {
    expect(isLocked({ finalized: false } as never)).toBe(false);
    expect(isLocked({ finalized: true } as never)).toBe(true);
  });
});

describe("WORK_DIR override", () => {
  let dir: string;
  const originalWorkDir = process.env.WORK_DIR;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "yotube-work-"));
    process.env.WORK_DIR = dir;
    vi.resetModules();
  });

  afterEach(async () => {
    process.env.WORK_DIR = originalWorkDir;
    vi.resetModules();
    // maxRetries/retryDelay: some tests don't await background processTrack() calls before
    // finishing, so a persist() write can still be landing (mkdir + tmp-write + rename) when
    // teardown starts — retrying absorbs that harmless race instead of failing on ENOTEMPTY.
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("persists and lists cards under WORK_DIR when set", async () => {
    const { createCard, listCards } = await import("./jobs");
    const card = await createCard("Electron-stored card");
    const cards = await listCards();
    expect(cards.map((c) => c.id)).toContain(card.id);

    const stateFile = path.join(dir, card.id, "state.json");
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(stateFile, "utf8"));
    expect(JSON.parse(raw).title).toBe("Electron-stored card");
  });
});

/** Polls getCard until a track reaches the given status, or throws after a timeout
 *  — used to wait out the fire-and-forget processTrack() that addTrack() kicks off. */
async function waitForTrackStatus(
  jobs: typeof import("./jobs"),
  cardId: string,
  trackId: string,
  status: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const card = await jobs.getCard(cardId);
    const track = card?.tracks.find((t) => t.id === trackId);
    if (track?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`track never reached status "${status}"`);
}

describe("card/track lifecycle", () => {
  let dir: string;
  const originalWorkDir = process.env.WORK_DIR;
  const originalCardsDir = process.env.CARDS_DIR;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "yotube-work-"));
    process.env.WORK_DIR = path.join(dir, "work");
    process.env.CARDS_DIR = path.join(dir, "cards");
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env.WORK_DIR = originalWorkDir;
    process.env.CARDS_DIR = originalCardsDir;
    vi.resetModules();
    // maxRetries/retryDelay: some tests don't await background processTrack() calls before
    // finishing, so a persist() write can still be landing (mkdir + tmp-write + rename) when
    // teardown starts — retrying absorbs that harmless race instead of failing on ENOTEMPTY.
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function readyCardWithOneTrack(jobs: typeof import("./jobs")) {
    const card = await jobs.createCard("My Card");
    const track = await jobs.addTrack(card.id, "https://youtu.be/jNQXAC9IVRw", "Hint Title");
    await waitForTrackStatus(jobs, card.id, track!.id, "ready");
    return { cardId: card.id, trackId: track!.id };
  }

  it("addTrack downloads metadata and lands the track in 'ready'", async () => {
    const jobs = await import("./jobs");
    const { cardId, trackId } = await readyCardWithOneTrack(jobs);
    const card = await jobs.getCard(cardId);
    const track = card?.tracks.find((t) => t.id === trackId);
    expect(track?.title).toBe("Mock Title");
    expect(track?.duration).toBe(42);
  });

  it("rejects mutation on a finalized (locked) card", async () => {
    const jobs = await import("./jobs");
    const { cardId, trackId } = await readyCardWithOneTrack(jobs);

    const finalizeResult = await jobs.finalizeCard(cardId);
    expect(finalizeResult.ok).toBe(true);

    await expect(jobs.addTrack(cardId, "https://youtu.be/abc")).resolves.toBeUndefined();
    await expect(jobs.removeTrack(cardId, trackId)).resolves.toBe(false);
    await expect(jobs.retryTrack(cardId, trackId)).resolves.toBe(false);
    await expect(jobs.renameCard(cardId, "New title")).resolves.toBe(false);
    await expect(jobs.renameTrack(cardId, trackId, "New track title")).resolves.toBe(false);
    await expect(jobs.reorderTracks(cardId, [trackId])).resolves.toBe(false);
  });

  it("finalizeCard refuses a card that doesn't exist", async () => {
    const jobs = await import("./jobs");
    expect(await jobs.finalizeCard("nonexistent")).toEqual({
      ok: false,
      error: "Card not found",
    });
  });

  it("finalizeCard refuses an empty card", async () => {
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Empty");
    expect(await jobs.finalizeCard(card.id)).toEqual({
      ok: false,
      error: "Card has no tracks",
    });
  });

  it("finalizeCard refuses a card with tracks still downloading", async () => {
    const ytdlp = await import("./ytdlp");
    // Delay metadata fetch so the track is still mid-flight when we call finalizeCard,
    // then let it finish before the test ends so cleanup doesn't race the background write.
    vi.mocked(ytdlp.fetchMetadata).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ title: "Mock Title", duration: 42 }), 50),
        ),
    );
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Still downloading");
    const track = await jobs.addTrack(card.id, "https://youtu.be/jNQXAC9IVRw");

    const result = await jobs.finalizeCard(card.id);
    expect(result).toEqual({
      ok: false,
      error: "All tracks must finish downloading before staging",
    });

    await waitForTrackStatus(jobs, card.id, track!.id, "ready");
  });

  it("finalizeCard refuses a card that is already staged", async () => {
    const jobs = await import("./jobs");
    const { cardId } = await readyCardWithOneTrack(jobs);
    await jobs.finalizeCard(cardId);
    expect(await jobs.finalizeCard(cardId)).toEqual({
      ok: false,
      error: "Card is already staged",
    });
  });

  it("reorderTracks rejects a permutation that doesn't match the existing track set", async () => {
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Reorder me");
    const t1 = await jobs.addTrack(card.id, "https://youtu.be/jNQXAC9IVRw");
    const t2 = await jobs.addTrack(card.id, "https://youtu.be/jNQXAC9IVRw");

    expect(await jobs.reorderTracks(card.id, [t1!.id])).toBe(false); // wrong length
    expect(await jobs.reorderTracks(card.id, [t1!.id, "bogus-id"])).toBe(false); // unknown id

    expect(await jobs.reorderTracks(card.id, [t2!.id, t1!.id])).toBe(true);
    const reordered = await jobs.getCard(card.id);
    expect(reordered?.tracks.map((t) => t.id)).toEqual([t2!.id, t1!.id]);
  });

  it("unstageCard unlocks a staged card and reverts done tracks to ready", async () => {
    const jobs = await import("./jobs");
    const { cardId, trackId } = await readyCardWithOneTrack(jobs);
    await jobs.finalizeCard(cardId);

    const staged = await jobs.getCard(cardId);
    expect(staged?.tracks.find((t) => t.id === trackId)?.status).toBe("done");

    expect(await jobs.unstageCard(cardId)).toBe(true);
    const unstaged = await jobs.getCard(cardId);
    expect(unstaged?.finalized).toBe(false);
    expect(unstaged?.tracks.find((t) => t.id === trackId)?.status).toBe("ready");
  });

  it("unstageCard is a no-op on a card that isn't finalized", async () => {
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Draft");
    expect(await jobs.unstageCard(card.id)).toBe(false);
  });

  it("clearYotoCardId unlinks, unstages, and reverts done tracks to ready", async () => {
    const jobs = await import("./jobs");
    const { cardId, trackId } = await readyCardWithOneTrack(jobs);
    await jobs.finalizeCard(cardId);
    await jobs.setYotoCardId(cardId, "yoto-card-123");

    expect(await jobs.clearYotoCardId(cardId)).toBe(true);
    const card = await jobs.getCard(cardId);
    expect(card?.yotoCardId).toBeUndefined();
    expect(card?.finalized).toBe(false);
    expect(card?.tracks.find((t) => t.id === trackId)?.status).toBe("ready");
  });

  it("setTrackIcon and setCoverImageUrl fail gracefully for unknown cards/tracks", async () => {
    const jobs = await import("./jobs");
    expect(
      await jobs.setTrackIcon("nope", "nope", { url: "x", source: "yotoicons", id: "1" }),
    ).toBe(false);
    expect(await jobs.setCoverImageUrl("nope", "https://x", "custom")).toBe(false);

    const card = await jobs.createCard("Icons");
    const track = await jobs.addTrack(card.id, "https://youtu.be/jNQXAC9IVRw");
    expect(
      await jobs.setTrackIcon(card.id, track!.id, { url: "https://icon", source: "yotoicons", id: "1" }),
    ).toBe(true);
    const updated = await jobs.getCard(card.id);
    expect(updated?.tracks[0].iconUrl).toBe("https://icon");
  });

  it("deleteCard removes the card and reports false for an unknown id", async () => {
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Doomed");
    expect(await jobs.deleteCard(card.id)).toBe(true);
    expect(await jobs.getCard(card.id)).toBeUndefined();
    expect(await jobs.deleteCard(card.id)).toBe(false);
  });

  it("setPushingToYoto clears any prior push error, and setPushError records one", async () => {
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Pusher");

    await jobs.setPushError(card.id, "boom");
    let updated = await jobs.getCard(card.id);
    expect(updated?.pushError).toBe("boom");
    expect(updated?.pushingToYoto).toBe(false);

    await jobs.setPushingToYoto(card.id, true);
    updated = await jobs.getCard(card.id);
    expect(updated?.pushingToYoto).toBe(true);
    expect(updated?.pushError).toBeUndefined();
  });

  it("processTrack records an error status when fetchMetadata fails", async () => {
    const ytdlp = await import("./ytdlp");
    vi.mocked(ytdlp.fetchMetadata).mockRejectedValueOnce(
      new ytdlp.ProcessError("Failed to fetch video metadata", "yt-dlp: video unavailable"),
    );
    const jobs = await import("./jobs");
    const card = await jobs.createCard("Will fail");
    const track = await jobs.addTrack(card.id, "https://youtu.be/jNQXAC9IVRw");
    await waitForTrackStatus(jobs, card.id, track!.id, "error");
    const updated = await jobs.getCard(card.id);
    expect(updated?.tracks[0].error).toBe(
      "Failed to fetch video metadata: yt-dlp: video unavailable",
    );
  });
});
