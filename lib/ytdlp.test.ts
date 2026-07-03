import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import {
  ProcessError,
  checkBinaries,
  downloadAudio,
  fetchMetadata,
  fetchPlaylistVideoIds,
  getDuration,
} from "./ytdlp";

const execaMock = vi.mocked(execa);

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchMetadata", () => {
  it("parses yt-dlp's dump-json output", async () => {
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({ title: "A Song", duration: 123, thumbnail: "https://thumb" }),
    } as never);

    const meta = await fetchMetadata("https://youtu.be/abc");
    expect(meta).toEqual({ title: "A Song", duration: 123, thumbnail: "https://thumb" });
    expect(execaMock).toHaveBeenCalledWith(
      "yt-dlp",
      ["--dump-json", "--no-playlist", "https://youtu.be/abc"],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("wraps a failure as ProcessError with the process's stderr", async () => {
    execaMock.mockRejectedValueOnce({ stderr: "ERROR: Video unavailable\n" });

    await expect(fetchMetadata("https://youtu.be/bad")).rejects.toMatchObject({
      message: "Failed to fetch video metadata",
      stderr: "ERROR: Video unavailable",
    });
  });

  it("falls back to the error message when there's no stderr", async () => {
    execaMock.mockRejectedValueOnce(new Error("spawn ENOENT"));

    await expect(fetchMetadata("https://youtu.be/bad")).rejects.toMatchObject({
      stderr: "spawn ENOENT",
    });
  });
});

describe("downloadAudio", () => {
  it("returns the .m4a output path on success", async () => {
    execaMock.mockResolvedValue({} as never);
    const result = await downloadAudio("https://youtu.be/abc", "/tmp/card/track1");
    expect(result).toBe("/tmp/card/track1.m4a");
    expect(execaMock).toHaveBeenCalledWith(
      "yt-dlp",
      expect.arrayContaining(["-x", "--audio-format", "m4a", "https://youtu.be/abc"]),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(execaMock).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-i", "/tmp/card/track1.raw.m4a", "-af", expect.stringContaining("loudnorm")]),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("wraps a failure as ProcessError", async () => {
    execaMock.mockRejectedValueOnce({ stderr: "ERROR: network down" });
    await expect(downloadAudio("https://youtu.be/abc", "/tmp/x")).rejects.toBeInstanceOf(ProcessError);
  });
});

describe("fetchPlaylistVideoIds", () => {
  it("parses NDJSON output and picks up the playlist title", async () => {
    const lines = [
      JSON.stringify({ id: "abc12345678", title: "Track One", playlist_title: "My Mix" }),
      JSON.stringify({ id: "def12345678", title: "Track Two" }),
    ].join("\n");
    execaMock.mockResolvedValueOnce({ stdout: lines } as never);

    const result = await fetchPlaylistVideoIds("https://www.youtube.com/playlist?list=PL1");
    expect(result).toEqual({
      playlistTitle: "My Mix",
      videos: [
        { id: "abc12345678", title: "Track One" },
        { id: "def12345678", title: "Track Two" },
      ],
      skipped: 0,
    });
    expect(execaMock).toHaveBeenCalledWith(
      "yt-dlp",
      ["--flat-playlist", "--dump-json", "https://www.youtube.com/playlist?list=PL1"],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("skips malformed lines and unavailable (private/deleted) entries", async () => {
    const lines = [
      JSON.stringify({ id: "abc12345678", title: "Track One" }),
      "not valid json",
      JSON.stringify({ id: "priv1234567", title: "[Private video]", availability: "private" }),
      "",
    ].join("\n");
    execaMock.mockResolvedValueOnce({ stdout: lines } as never);

    const result = await fetchPlaylistVideoIds("https://www.youtube.com/playlist?list=PL1");
    expect(result.videos).toEqual([{ id: "abc12345678", title: "Track One" }]);
    expect(result.skipped).toBe(2);
  });

  it("wraps a failure as ProcessError", async () => {
    execaMock.mockRejectedValueOnce({ stderr: "ERROR: playlist not found" });
    await expect(
      fetchPlaylistVideoIds("https://www.youtube.com/playlist?list=bad"),
    ).rejects.toBeInstanceOf(ProcessError);
  });
});

describe("getDuration", () => {
  it("rounds ffprobe's fractional duration", async () => {
    execaMock.mockResolvedValueOnce({ stdout: "59.6\n" } as never);
    expect(await getDuration("/tmp/x.m4a")).toBe(60);
  });
});

describe("checkBinaries", () => {
  it("reports both ok when both processes succeed", async () => {
    execaMock.mockResolvedValue({} as never);
    expect(await checkBinaries()).toEqual({ ytDlpOk: true, ffmpegOk: true });
  });

  it("reports a binary as not-ok when its version check fails, without throwing", async () => {
    execaMock.mockImplementation(
      (cmd: string | URL) =>
        (cmd === "yt-dlp" ? Promise.reject(new Error("not found")) : Promise.resolve({})) as never,
    );
    expect(await checkBinaries()).toEqual({ ytDlpOk: false, ffmpegOk: true });
  });
});
