import { describe, expect, it } from "vitest";
import {
  cardPublishFingerprint,
  CATALOG_KEY,
  loadCatalog,
  newBrowserCard,
  removeBrowserTrack,
  saveCatalog,
} from "./browser-catalog";

describe("browser catalog", () => {
  it("round trips its versioned local-only representation", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const card = newBrowserCard("Bedtime");
    saveCatalog(storage, [card]);
    expect(JSON.parse(values.get(CATALOG_KEY)!).version).toBe(1);
    expect(loadCatalog(storage)).toEqual([card]);
  });

  it("fails closed for malformed or future catalog data", () => {
    expect(loadCatalog({ getItem: () => "not-json" })).toEqual([]);
    expect(loadCatalog({ getItem: () => JSON.stringify({ version: 2, cards: [{}] }) })).toEqual([]);
  });

  it("keeps a blank new title and infers a missing cover from the first thumbnail", () => {
    const card = newBrowserCard();
    card.tracks.push({
      id: "track-1",
      state: "draft",
      source: {
        url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        title: "First track",
        duration: 19,
        fileSize: 123,
        thumbnail: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
      },
    });
    const loaded = loadCatalog({
      getItem: () => JSON.stringify({ version: 1, cards: [card] }),
    });
    expect(loaded[0]).toMatchObject({
      title: "",
      coverImageUrl: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
      coverSourceTrackId: "track-1",
    });
  });

  it("moves the cover to the next thumbnail when its source track is removed", () => {
    const card = newBrowserCard("Stories");
    card.coverSourceTrackId = "track-1";
    card.coverImageUrl = "https://i.ytimg.com/first.jpg";
    card.tracks = [
      {
        id: "track-1",
        state: "draft",
        source: { url: "https://youtu.be/first", title: "First", duration: 10, fileSize: 100, thumbnail: card.coverImageUrl },
      },
      {
        id: "track-2",
        state: "draft",
        source: { url: "https://youtu.be/second", title: "Second", duration: 20, fileSize: 200, thumbnail: "https://i.ytimg.com/second.jpg" },
      },
    ];

    expect(removeBrowserTrack(card, "track-1")).toMatchObject({
      coverSourceTrackId: "track-2",
      coverImageUrl: "https://i.ytimg.com/second.jpg",
      tracks: [{ id: "track-2" }],
    });
  });

  it("keeps an independently selected cover when another track is removed", () => {
    const card = newBrowserCard("Stories");
    card.coverSourceTrackId = "track-2";
    card.coverImageUrl = "https://i.ytimg.com/second.jpg";
    card.tracks = [
      { id: "track-1", state: "draft", source: { url: "https://youtu.be/first", title: "First", duration: 10, fileSize: 100 } },
      { id: "track-2", state: "draft", source: { url: "https://youtu.be/second", title: "Second", duration: 20, fileSize: 200 } },
    ];

    expect(removeBrowserTrack(card, "track-1")).toMatchObject({
      coverSourceTrackId: "track-2",
      coverImageUrl: "https://i.ytimg.com/second.jpg",
      tracks: [{ id: "track-2" }],
    });
  });

  it("adopts the current browser state as the baseline for legacy published cards", () => {
    const card = newBrowserCard("Published card");
    card.yotoCardId = "card-1";
    const loaded = loadCatalog({
      getItem: () => JSON.stringify({ version: 1, cards: [card] }),
    });
    expect(loaded[0].publishedFingerprint).toBe(cardPublishFingerprint(card));
  });

  it("fingerprints only fields that affect the published Yoto card", () => {
    const card = newBrowserCard("Stories");
    card.coverImageUrl = "https://i.ytimg.com/cover.jpg";
    card.tracks = [{
      id: "track-1",
      state: "uploaded",
      source: { url: "https://youtu.be/first", title: "First", duration: 10, fileSize: 100 },
      ingested: { url: "https://youtu.be/first", title: "First", duration: 10, fileSize: 100, sha256: "sha-1", format: "aac" },
      icon: { source: "yotoicons", id: "42", url: "https://www.yotoicons.com/42.png" },
    }];
    const baseline = cardPublishFingerprint(card);

    expect(cardPublishFingerprint({ ...card, updatedAt: "later", tracks: [{ ...card.tracks[0], state: "error", error: "Retry" }] })).toBe(baseline);
    expect(cardPublishFingerprint({ ...card, title: "Different" })).not.toBe(baseline);
    expect(cardPublishFingerprint({ ...card, coverImageUrl: "https://i.ytimg.com/other.jpg" })).not.toBe(baseline);
    expect(cardPublishFingerprint({ ...card, tracks: [{ ...card.tracks[0], icon: undefined }] })).not.toBe(baseline);
    expect(cardPublishFingerprint({ ...card, tracks: [...card.tracks, { ...card.tracks[0], id: "track-2" }] })).not.toBe(baseline);
  });
});
