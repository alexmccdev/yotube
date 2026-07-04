import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./yoto-auth", () => ({
  getValidAccessToken: vi.fn(async () => "test-token"),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(async () => Buffer.from("fake-audio-bytes")),
    stat: vi.fn(async () => ({ size: 1234 })),
  },
}));

import { pushCardToYoto, type YotoTrackInput } from "./yoto-api";

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const baseTrack: YotoTrackInput = {
  title: "Track One",
  filePath: "/tmp/track1.m4a",
  duration: 60,
  trackNumber: 1,
};

let fetchMock: ReturnType<typeof vi.fn<FetchImpl>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) =>
    fetchMock(String(input), init),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function calls(): [string, RequestInit | undefined][] {
  return fetchMock.mock.calls as [string, RequestInit | undefined][];
}

/** Routes the upload-url/upload/poll/content sequence to canned responses; the poll
 *  response can be overridden per test to exercise retry/timeout behavior. */
function happyPathFetch(pollResponses?: unknown[]): FetchImpl {
  const pollQueue = [...(pollResponses ?? [{ transcode: { transcodedSha256: "sha-1" } }])];

  return async (url, init) => {
    if (url.includes("/media/transcode/audio/uploadUrl")) {
      return jsonResponse({ upload: { uploadId: "upload-1", uploadUrl: "https://put.example/audio" } });
    }
    if (url === "https://put.example/audio") {
      return jsonResponse({});
    }
    if (url.includes("/media/upload/upload-1/transcoded")) {
      const next = pollQueue.shift() ?? { transcode: {} };
      return jsonResponse(next);
    }
    if (url.includes("/media/displayIcons/user/me/upload")) {
      return jsonResponse({ displayIcon: { mediaId: "icon-media-1" } });
    }
    if (url.includes("/media/coverImage/user/me/upload")) {
      return jsonResponse({ coverImage: { mediaUrl: "https://cover.example/img" } });
    }
    if (url === "https://example.com/cover.jpg" || url === "https://example.com/icon.png") {
      return {
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => new ArrayBuffer(4),
      } as Response;
    }
    if (url.includes("/content") && init?.method === "POST") {
      return jsonResponse({ card: { cardId: "card-xyz" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

function wireHappyPathFetch(opts: { pollResponses?: unknown[] } = {}) {
  fetchMock.mockImplementation(happyPathFetch(opts.pollResponses));
}

function contentCalls() {
  return calls().filter(([url, init]) => url.includes("/content") && init?.method === "POST");
}

function lastContentBody() {
  const calls = contentCalls();
  return JSON.parse(calls[calls.length - 1][1]!.body as string);
}

describe("pushCardToYoto", () => {
  it("creates an empty card immediately, then fills it in as tracks finish uploading", async () => {
    wireHappyPathFetch();
    const onCardCreated = vi.fn();
    const result = await pushCardToYoto("My Card", [baseTrack], undefined, undefined, onCardCreated);
    expect(result).toEqual({ yotoCardId: "card-xyz" });
    expect(onCardCreated).toHaveBeenCalledWith("card-xyz");

    const posts = contentCalls();
    // first call creates the card with no chapters yet and no cardId
    const firstBody = JSON.parse(posts[0][1]!.body as string);
    expect(firstBody.cardId).toBeUndefined();
    expect(firstBody.content.chapters).toEqual([]);
    // subsequent calls update the same card by id
    expect(posts.slice(1).every(([, init]) => JSON.parse(init!.body as string).cardId === "card-xyz")).toBe(true);

    const body = lastContentBody();
    expect(body.title).toBe("My Card");
    expect(body.content.chapters[0].tracks[0].trackUrl).toBe("yoto:#sha-1");
    expect(body.content.chapters[0].tracks[0].fileSize).toBe(1234);
  });

  it("reuses an existing yotoCardId instead of creating a new card", async () => {
    wireHappyPathFetch();
    await pushCardToYoto("My Card", [baseTrack], undefined, undefined, undefined, "existing-card");

    const posts = contentCalls();
    expect(posts.every(([, init]) => JSON.parse(init!.body as string).cardId === "existing-card")).toBe(true);
  });

  it("retries polling until the transcode finishes", async () => {
    vi.useFakeTimers();
    wireHappyPathFetch({
      pollResponses: [
        { transcode: {} },
        { transcode: {} },
        { transcode: { transcodedSha256: "sha-eventually" } },
      ],
    });

    const promise = pushCardToYoto("My Card", [baseTrack]);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toEqual({ yotoCardId: "card-xyz" });

    const pollCalls = calls().filter(([url]) => url.includes("/transcoded"));
    expect(pollCalls).toHaveLength(3);
  });

  it("times out after repeated failed polls with a descriptive error", async () => {
    vi.useFakeTimers();
    wireHappyPathFetch({ pollResponses: Array(120).fill({ transcode: {} }) });

    const promise = pushCardToYoto("My Card", [baseTrack]);
    const expectation = expect(promise).rejects.toThrow(/Timed out waiting for Yoto to transcode/);
    await vi.advanceTimersByTimeAsync(5000 * 120);
    await expectation;
  });

  it("throws when the upload URL request fails", async () => {
    const fallback = happyPathFetch();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        return jsonResponse({ error: "nope" }, false);
      }
      return fallback(url, init);
    });
    await expect(pushCardToYoto("My Card", [baseTrack])).rejects.toThrow("Failed to get upload URL");
  });

  it("uses an existing iconMediaId without uploading a new icon", async () => {
    wireHappyPathFetch();
    await pushCardToYoto("My Card", [{ ...baseTrack, iconMediaId: "already-uploaded" }]);

    const iconUploadCalls = calls().filter(([url]) => url.includes("/media/displayIcons/user/me/upload"));
    expect(iconUploadCalls).toHaveLength(0);

    const body = lastContentBody();
    expect(body.content.chapters[0].display.icon16x16).toBe("yoto:#already-uploaded");
  });

  it("uploads a custom icon from iconUrl when no iconMediaId is set", async () => {
    wireHappyPathFetch();
    await pushCardToYoto("My Card", [{ ...baseTrack, iconUrl: "https://example.com/icon.png" }]);

    const body = lastContentBody();
    expect(body.content.chapters[0].display.icon16x16).toBe("yoto:#icon-media-1");
  });

  it("never fails the push if the cover image upload fails — it's best-effort", async () => {
    const fallback = happyPathFetch();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://example.com/cover.jpg") {
        return { ok: false, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      }
      return fallback(url, init);
    });

    const result = await pushCardToYoto("My Card", [baseTrack], "https://example.com/cover.jpg");
    expect(result).toEqual({ yotoCardId: "card-xyz" });

    const body = lastContentBody();
    expect(body.metadata).toBeUndefined();
  });

  it("includes the cover image when the upload succeeds", async () => {
    wireHappyPathFetch();
    await pushCardToYoto("My Card", [baseTrack], "https://example.com/cover.jpg");

    const body = lastContentBody();
    expect(body.metadata.cover.imageL).toBe("https://cover.example/img");
  });

  it("places chapters by trackNumber (not array/completion order) and reports progress via onProgress", async () => {
    // Array order is deliberately reversed from trackNumber order, so a naive
    // push-in-completion-order implementation would produce chapters in the wrong sequence.
    const trackA = { ...baseTrack, title: "Second", trackNumber: 2 };
    const trackB = { ...baseTrack, title: "First", trackNumber: 1 };

    let uploadUrlCalls = 0;
    const fallback = happyPathFetch();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/media/transcode/audio/uploadUrl")) {
        uploadUrlCalls++;
        return jsonResponse({
          upload: { uploadId: `upload-${uploadUrlCalls}`, uploadUrl: `https://put.example/audio-${uploadUrlCalls}` },
        });
      }
      if (url.startsWith("https://put.example/audio-")) {
        return jsonResponse({});
      }
      if (url.includes("/media/upload/upload-1/transcoded")) {
        return jsonResponse({ transcode: { transcodedSha256: "sha-track2" } });
      }
      if (url.includes("/media/upload/upload-2/transcoded")) {
        return jsonResponse({ transcode: { transcodedSha256: "sha-track1" } });
      }
      return fallback(url, init);
    });

    const onProgress = vi.fn();
    await pushCardToYoto("My Card", [trackA, trackB], undefined, onProgress);

    const body = lastContentBody();
    expect(body.content.chapters.map((c: { title: string }) => c.title)).toEqual(["First", "Second"]);
    expect(body.content.chapters[0].tracks[0].trackUrl).toBe("yoto:#sha-track1");
    expect(body.content.chapters[1].tracks[0].trackUrl).toBe("yoto:#sha-track2");

    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("rewrites YouTube webp thumbnails to the native jpg before fetching", async () => {
    wireHappyPathFetch();
    await pushCardToYoto(
      "My Card",
      [baseTrack],
      "https://i.ytimg.com/vi_webp/abc123/maxresdefault.webp",
    );

    const fetchedUrls = calls().map(([url]) => url);
    expect(fetchedUrls).toContain("https://i.ytimg.com/vi/abc123/maxresdefault.jpg");
    expect(fetchedUrls).not.toContain("https://i.ytimg.com/vi_webp/abc123/maxresdefault.webp");
  });

  it("throws when the final card-creation request fails", async () => {
    const fallback = happyPathFetch();
    let contentPostCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/content") && init?.method === "POST") {
        contentPostCount++;
        // let the initial (empty) card creation succeed so a cardId exists; the incremental
        // update after the track finishes is best-effort and swallows failures, so only the
        // final authoritative update (outside the upload loop) actually surfaces the error.
        if (contentPostCount === 1) return fallback(url, init);
        return jsonResponse({ error: "rejected" }, false);
      }
      return fallback(url, init);
    });

    await expect(pushCardToYoto("My Card", [baseTrack])).rejects.toThrow("Failed to create Yoto card");
  });
});
