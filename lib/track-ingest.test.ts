import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import { probeTrackSource, readTrackTranscode, uploadTrack } from "./track-ingest";

const execaMock = vi.mocked(execa);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("track ingest", () => {
  it("probes an exact M4A and streams it to Yoto with Content-Length", async () => {
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        title: "Me at the zoo",
        duration: 19,
        thumbnail: "https://i.ytimg.com/thumb.jpg",
        requested_downloads: [{ filesize: 123 }],
      }),
    } as never);
    const process = Promise.resolve({ exitCode: 0, stderr: "" });
    Object.assign(process, { stdout: Readable.from([Buffer.from("audio")]), kill: vi.fn() });
    execaMock.mockReturnValueOnce(process as never);

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media/transcode/audio/uploadUrl")) {
        return new Response(JSON.stringify({ upload: { uploadId: "up-1", uploadUrl: "https://put.example/audio" } }));
      }
      if (url === "https://put.example/audio") {
        expect(init).toMatchObject({
          method: "PUT",
          headers: { "Content-Type": "audio/mp4", "Content-Length": "123" },
          duplex: "half",
        });
        expect(init?.body).toBeInstanceOf(ReadableStream);
        await new Response(init?.body).arrayBuffer();
        return new Response();
      }
      if (url.includes("/media/upload/up-1/transcoded")) {
        return new Response(JSON.stringify({ transcode: { transcodedSha256: "sha-1", transcodedInfo: { duration: 20, fileSize: 100, format: "aac", channels: "stereo" } } }));
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: string[] = [];
    const source = await probeTrackSource("https://youtu.be/abc");
    expect(execaMock.mock.calls[0]?.[0]).toBe("yt-dlp");
    expect(execaMock.mock.calls[0]?.[1]).toContain("node");
    await expect(uploadTrack("token", source, undefined, (event) => progress.push(event.phase))).resolves.toBe("up-1");
    expect(execaMock.mock.calls[1]?.[1]).toContain("node");
    await expect(readTrackTranscode("token", "up-1", source, undefined, (event) => progress.push(event.phase))).resolves.toMatchObject({
      title: "Me at the zoo",
      sha256: "sha-1",
      duration: 20,
      fileSize: 100,
    });
    expect(progress).toEqual(["opening", "streaming", "processing", "complete"]);
  });

  it("rejects sources whose exact selected filesize is unavailable", async () => {
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify({ title: "Unknown", duration: 10 }) } as never);
    await expect(probeTrackSource("https://youtu.be/abc")).rejects.toThrow("exact M4A size");
  });

  it("does not expose subprocess details when YouTube blocks the server", async () => {
    execaMock.mockRejectedValueOnce(Object.assign(
      new Error("Command failed: /var/task/vendor/yt-dlp --dump-json https://youtube.example/private"),
      { stderr: "ERROR: Sign in to confirm you’re not a bot" },
    ));

    const result = probeTrackSource("https://youtu.be/abc");
    await expect(result).rejects.toThrow("YouTube temporarily blocked this server request");
    await expect(result).rejects.not.toThrow("/var/task/vendor/yt-dlp");
  });

  it("reports an upload as pending while Yoto is still transcoding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(readTrackTranscode("token", "up-1", {
      url: "https://youtu.be/abc",
      title: "Pending",
      duration: 10,
      fileSize: 123,
    })).resolves.toBeUndefined();
  });
});
