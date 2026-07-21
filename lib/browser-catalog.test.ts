import { describe, expect, it } from "vitest";
import { CATALOG_KEY, loadCatalog, newBrowserCard, saveCatalog } from "./browser-catalog";

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
});
