import { describe, expect, it } from "vitest";
import { extractVideoId, isYoutubeUrl, normalizeYoutubeInput } from "./validate";

describe("isYoutubeUrl", () => {
  it("accepts known youtube hosts", () => {
    expect(isYoutubeUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw")).toBe(true);
    expect(isYoutubeUrl("https://youtu.be/jNQXAC9IVRw")).toBe(true);
    expect(isYoutubeUrl("https://music.youtube.com/watch?v=jNQXAC9IVRw")).toBe(true);
  });

  it("rejects other hosts and garbage", () => {
    expect(isYoutubeUrl("https://vimeo.com/12345")).toBe(false);
    expect(isYoutubeUrl("not a url")).toBe(false);
    expect(isYoutubeUrl("")).toBe(false);
  });
});

describe("normalizeYoutubeInput", () => {
  it("passes through a full youtube url unchanged", () => {
    const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    expect(normalizeYoutubeInput(url)).toBe(url);
  });

  it("expands a bare 11-char video id into a canonical watch url", () => {
    expect(normalizeYoutubeInput("jNQXAC9IVRw")).toBe(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    );
  });

  it("trims whitespace before validating", () => {
    expect(normalizeYoutubeInput("  jNQXAC9IVRw  ")).toBe(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    );
  });

  it("returns undefined for invalid input", () => {
    expect(normalizeYoutubeInput("not-a-video-id")).toBeUndefined();
    expect(normalizeYoutubeInput("https://vimeo.com/12345")).toBeUndefined();
    expect(normalizeYoutubeInput("")).toBeUndefined();
  });
});

describe("extractVideoId", () => {
  it("extracts from watch urls", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=jNQXAC9IVRw")).toBe("jNQXAC9IVRw");
  });

  it("extracts from youtu.be short urls", () => {
    expect(extractVideoId("https://youtu.be/jNQXAC9IVRw")).toBe("jNQXAC9IVRw");
  });

  it("passes through a bare id", () => {
    expect(extractVideoId("jNQXAC9IVRw")).toBe("jNQXAC9IVRw");
  });

  it("returns undefined for non-youtube urls", () => {
    expect(extractVideoId("https://vimeo.com/12345")).toBeUndefined();
  });

  it("returns undefined when the watch url has no v param", () => {
    expect(extractVideoId("https://www.youtube.com/watch")).toBeUndefined();
  });
});
