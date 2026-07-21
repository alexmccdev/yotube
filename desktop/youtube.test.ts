import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { normalizeYoutubeUrl, probeYoutube, uploadYoutube, ytDlpPath } from "./youtube.mjs";

const spawnMock = vi.mocked(spawn);

function mockProcess(stdout: string, stderr = "", exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = Readable.from([Buffer.from(stdout)]);
  child.stderr = Readable.from([Buffer.from(stderr)]);
  child.kill = vi.fn();
  queueMicrotask(() => child.emit("close", exitCode));
  return child;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("desktop YouTube bridge", () => {
  it("accepts only canonical YouTube video inputs", () => {
    expect(normalizeYoutubeUrl("Qzi2R_uuk2E")).toBe("https://www.youtube.com/watch?v=Qzi2R_uuk2E");
    expect(normalizeYoutubeUrl("https://youtu.be/Qzi2R_uuk2E?t=1")).toBe(
      "https://www.youtube.com/watch?v=Qzi2R_uuk2E",
    );
    expect(normalizeYoutubeUrl("https://evil.example/watch?v=Qzi2R_uuk2E")).toBeUndefined();
    expect(normalizeYoutubeUrl("file:///etc/passwd")).toBeUndefined();
  });

  it("uses the selected local browser and Electron's Node runtime", async () => {
    spawnMock.mockReturnValueOnce(mockProcess(JSON.stringify({
        title: "Local track",
        duration: 30,
        thumbnail: "https://i.ytimg.com/thumb.jpg",
        requested_downloads: [{ filesize: 456 }],
      })) as never);

    await expect(probeYoutube({
      binary: "/resources/yt-dlp",
      nodePath: "/Applications/Yotube.app/Electron",
      url: "Qzi2R_uuk2E",
      browser: "chrome",
    })).resolves.toMatchObject({ title: "Local track", fileSize: 456 });

    expect(spawnMock).toHaveBeenCalledWith(
      "/resources/yt-dlp",
      expect.arrayContaining([
        "--js-runtimes",
        "node:/Applications/Yotube.app/Electron",
        "--cookies-from-browser",
        "chrome",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: "1" }),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  });

  it("streams local audio only to an HTTPS signed destination", async () => {
    spawnMock.mockReturnValueOnce(mockProcess("audio") as never);
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "PUT",
        headers: { "Content-Type": "audio/mp4", "Content-Length": "5" },
      });
      await new Response(init?.body).arrayBuffer();
      return new Response();
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: number[] = [];
    await uploadYoutube({
      binary: "/resources/yt-dlp",
      nodePath: "/Applications/Yotube.app/Electron",
      source: { url: "Qzi2R_uuk2E", fileSize: 5 },
      uploadUrl: "https://signed-upload.example/audio",
      browser: "none",
      onProgress: (event: { transferPercent: number }) => progress.push(event.transferPercent),
    });
    expect(progress).toEqual([100]);
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(uploadYoutube({
      binary: "/resources/yt-dlp",
      nodePath: "/Applications/Yotube.app/Electron",
      source: { url: "Qzi2R_uuk2E", fileSize: 5 },
      uploadUrl: "http://signed-upload.example/audio",
      browser: "none",
    })).rejects.toThrow("invalid upload destination");
  });

  it("resolves packaged binaries outside the app archive", () => {
    const originalOverride = process.env.YT_DLP_PATH;
    process.env.YT_DLP_PATH = "/tmp/untrusted-yt-dlp";
    try {
      expect(ytDlpPath({
        isPackaged: true,
        resourcesPath: "/Applications/Yotube.app/Contents/Resources",
        appPath: "/app.asar",
        platform: "darwin",
      })).toBe("/Applications/Yotube.app/Contents/Resources/yt-dlp");
    } finally {
      if (originalOverride === undefined) delete process.env.YT_DLP_PATH;
      else process.env.YT_DLP_PATH = originalOverride;
    }
  });
});
