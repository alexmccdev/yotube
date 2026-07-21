import { afterEach, describe, expect, it, vi } from "vitest";
import { publishCard, type PublishTrack } from "./yoto-publisher";

const track: PublishTrack = {
  url: "https://youtu.be/abc",
  title: "Track one",
  duration: 19,
  fileSize: 123,
  sha256: "audio-sha",
  format: "aac",
  channels: "stereo",
  icon: { source: "yotoicons", id: "42", url: "https://ignored.example/icon.png" },
};

afterEach(() => vi.unstubAllGlobals());

describe("Yoto card publisher", () => {
  it("reconstructs trusted community icon URLs and publishes ordered media", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://www.yotoicons.com/static/uploads/42.png") return new Response(new Uint8Array([1, 2, 3]));
      if (url.endsWith("/media/displayIcons/user/me/upload")) {
        expect(init?.body).toBeInstanceOf(ArrayBuffer);
        return new Response(JSON.stringify({ displayIcon: { mediaId: "icon-media" } }));
      }
      if (url.endsWith("/content")) {
        const body = JSON.parse(init?.body as string);
        expect(body.content.chapters[0]).toMatchObject({
          key: "01",
          display: { icon16x16: "yoto:#icon-media" },
          tracks: [{ trackUrl: "yoto:#audio-sha", duration: 19 }],
        });
        return new Response(JSON.stringify({ card: { cardId: "card-1" } }));
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(publishCard("token", "My card", [track])).resolves.toEqual({
      cardId: "card-1",
      replacedDeletedCard: false,
    });
  });

  it("creates a replacement with the current title when the stored Yoto card was deleted", async () => {
    const submittedBodies: { cardId?: string; title: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://www.yotoicons.com/static/uploads/42.png") return new Response(new Uint8Array([1]));
      if (url.endsWith("/media/displayIcons/user/me/upload")) {
        return new Response(JSON.stringify({ displayIcon: { mediaId: "icon-media" } }));
      }
      if (url.endsWith("/content")) {
        const body = JSON.parse(init?.body as string);
        submittedBodies.push(body);
        if (body.cardId) return new Response("Card not found", { status: 404 });
        return new Response(JSON.stringify({ card: { cardId: "replacement-1" } }));
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    await expect(publishCard("token", "New playlist name", [track], "deleted-card")).resolves.toEqual({
      cardId: "replacement-1",
      replacedDeletedCard: true,
    });
    expect(submittedBodies).toMatchObject([
      { cardId: "deleted-card", title: "New playlist name" },
      { title: "New playlist name" },
    ]);
    expect(submittedBodies[1]).not.toHaveProperty("cardId");
  });

  it("updates an existing card by submitting its stored card ID once", async () => {
    const submittedBodies: { cardId?: string; title: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://www.yotoicons.com/static/uploads/42.png") return new Response(new Uint8Array([1]));
      if (url.endsWith("/media/displayIcons/user/me/upload")) {
        return new Response(JSON.stringify({ displayIcon: { mediaId: "icon-media" } }));
      }
      if (url.endsWith("/content")) {
        submittedBodies.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ card: { cardId: "existing-card" } }));
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    await expect(publishCard("token", "Updated name", [track], "existing-card")).resolves.toEqual({
      cardId: "existing-card",
      replacedDeletedCard: false,
    });
    expect(submittedBodies).toEqual([{ cardId: "existing-card", title: "Updated name", content: expect.any(Object) }]);
  });

  it("uploads a trusted YouTube thumbnail and attaches it as the card cover", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://www.yotoicons.com/static/uploads/42.png") return new Response(new Uint8Array([1]));
      if (url.endsWith("/media/displayIcons/user/me/upload")) {
        return new Response(JSON.stringify({ displayIcon: { mediaId: "icon-media" } }));
      }
      if (url === "https://i.ytimg.com/vi/abc/hqdefault.jpg") {
        return new Response(new Uint8Array([2, 3]), { headers: { "Content-Type": "image/jpeg" } });
      }
      if (url.includes("/media/coverImage/user/me/upload")) {
        expect(init).toMatchObject({ method: "POST", headers: expect.objectContaining({ "Content-Type": "image/jpeg" }) });
        return new Response(JSON.stringify({ coverImage: { mediaUrl: "https://yoto.example/cover.jpg" } }));
      }
      if (url.endsWith("/content")) {
        const body = JSON.parse(init?.body as string);
        expect(body.metadata.cover.imageL).toBe("https://yoto.example/cover.jpg");
        return new Response(JSON.stringify({ card: { cardId: "card-with-cover" } }));
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishCard(
        "token",
        "Covered card",
        [track],
        undefined,
        "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      ),
    ).resolves.toEqual({ cardId: "card-with-cover", replacedDeletedCard: false });
  });

  it("refuses non-YouTube card image URLs", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "https://www.yotoicons.com/static/uploads/42.png") {
        return new Response(new Uint8Array([1]));
      }
      if (String(input).endsWith("/media/displayIcons/user/me/upload")) {
        return new Response(JSON.stringify({ displayIcon: { mediaId: "icon-media" } }));
      }
      throw new Error(`Unexpected fetch ${String(input)}`);
    }));
    await expect(
      publishCard("token", "Card", [track], undefined, "https://evil.example/cover.jpg"),
    ).rejects.toThrow("not a YouTube thumbnail");
  });

  it("rejects community icon IDs instead of fetching arbitrary URLs", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(publishCard("token", "My card", [{ ...track, icon: { source: "yotoicons", id: "../secret", url: "https://evil.example" } }])).rejects.toThrow("Invalid community icon");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized image from its headers before buffering it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "https://www.yotoicons.com/static/uploads/42.png") {
        return new Response(new Uint8Array([1]), { headers: { "Content-Length": "1000001" } });
      }
      throw new Error(`Unexpected fetch ${String(input)}`);
    }));

    await expect(publishCard("token", "My card", [track])).rejects.toThrow("selected icon is too large");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
