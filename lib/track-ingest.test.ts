import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import { ingestTrack, probeTrackSource } from "./track-ingest";

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
    await expect(ingestTrack("token", source, undefined, (event) => progress.push(event.phase))).resolves.toMatchObject({
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
});
