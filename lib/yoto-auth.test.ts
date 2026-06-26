import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/yoto-auth.ts persists to a real file under work/ — mock node:fs/promises with an
// in-memory store so tests never touch the user's actual saved client ID / tokens.
let files: Record<string, string>;

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(async (path: string) => {
      if (!(path in files)) throw new Error("ENOENT");
      return files[path];
    }),
    writeFile: vi.fn(async (path: string, data: string) => {
      files[path] = data;
    }),
    mkdir: vi.fn(async () => undefined),
    rm: vi.fn(async (path: string) => {
      delete files[path];
    }),
  },
}));

const { clearClientId, getClientId, setClientId } = await import("./yoto-auth");

describe("client ID storage", () => {
  beforeEach(() => {
    files = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("has nothing set by default", async () => {
    expect(await getClientId()).toBeUndefined();
  });

  it("returns a saved client ID", async () => {
    await setClientId("custom-client-id");
    expect(await getClientId()).toBe("custom-client-id");
  });

  it("clears back to unset", async () => {
    await setClientId("custom-client-id");
    await clearClientId();
    expect(await getClientId()).toBeUndefined();
  });

  it("invalidates stored tokens when the client ID changes", async () => {
    const fs = (await import("node:fs/promises")).default;
    await setClientId("custom-client-id");
    expect(fs.rm).toHaveBeenCalled();
  });
});
