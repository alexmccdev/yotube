import { describe, expect, it } from "vitest";
import {
  canonicalPlaylistUrl,
  extractVideoId,
  isYoutubePlaylistUrl,
  isYoutubeUrl,
  normalizeYoutubeInput,
} from "./validate";

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
  it("cleans a full youtube url to its canonical watch form", () => {
    expect(
      normalizeYoutubeInput(
        "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123&utm_source=share",
      ),
    ).toBe("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  });

  it("cleans a short youtube url to its canonical watch form", () => {
    expect(normalizeYoutubeInput("https://youtu.be/jNQXAC9IVRw?t=14")).toBe(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    );
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

describe("isYoutubePlaylistUrl", () => {
  it("accepts a watch url with a list param and no video id", () => {
    expect(isYoutubePlaylistUrl("https://www.youtube.com/watch?list=PL123")).toBe(true);
  });

  it("accepts a /playlist path", () => {
    expect(isYoutubePlaylistUrl("https://www.youtube.com/playlist?list=PL123")).toBe(true);
  });

  it("accepts a url with both v= and list= as a playlist (copied from a playing video)", () => {
    expect(isYoutubePlaylistUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123")).toBe(
      true,
    );
  });

  it("treats an auto-generated Mix/Radio list as a single video, not a playlist", () => {
    expect(
      isYoutubePlaylistUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDjNQXAC9IVRw"),
    ).toBe(false);
  });

  it("rejects plain video urls and non-youtube urls", () => {
    expect(isYoutubePlaylistUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw")).toBe(false);
    expect(isYoutubePlaylistUrl("https://vimeo.com/12345")).toBe(false);
    expect(isYoutubePlaylistUrl("not a url")).toBe(false);
  });
});

describe("canonicalPlaylistUrl", () => {
  it("strips v= and other params, keeping only the bare playlist form", () => {
    expect(
      canonicalPlaylistUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123&pp=sAgC"),
    ).toBe("https://www.youtube.com/playlist?list=PL123");
  });

  it("passes through an already-bare playlist url unchanged", () => {
    expect(canonicalPlaylistUrl("https://www.youtube.com/playlist?list=PL123")).toBe(
      "https://www.youtube.com/playlist?list=PL123",
    );
  });

  it("returns undefined for non-playlist urls", () => {
    expect(canonicalPlaylistUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw")).toBeUndefined();
  });
});
