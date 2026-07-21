import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCookie, sealCookie } from "./sealed-cookie";
import {
  YotoSessionError,
  beginYotoSession,
  completeYotoSession,
  readYotoAccessToken,
  refreshYotoSession,
  type YotoSession,
} from "./yoto-session";

function jwt(expiry: number): string {
  return `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString("base64url")}.signature`;
}

beforeEach(() => {
  process.env.WEB_SESSION_SECRET = "test-secret-with-enough-entropy-for-tests";
  process.env.APP_ORIGIN = "https://app.example";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WEB_SESSION_SECRET;
  delete process.env.APP_ORIGIN;
});

describe("Yoto browser session", () => {
  it("requires a user-supplied Client ID", async () => {
    await expect(
      beginYotoSession("http://localhost:3000/api/yoto/connect", "  "),
    ).rejects.toThrow("Enter a valid Yoto Client ID");
  });

  it("creates a PKCE authorization request with a sealed flow", async () => {
    const result = await beginYotoSession("http://localhost:3000/api/yoto/connect", "client-123");
    const authorizeUrl = new URL(result.authorizeUrl);
    expect(authorizeUrl.origin).toBe("https://login.yotoplay.com");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("client-123");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/yoto/callback",
    );
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result.flowCookie).not.toContain(authorizeUrl.searchParams.get("state")!);
  });

  it("uses the validated browser origin for a local callback", async () => {
    delete process.env.APP_ORIGIN;
    const result = await beginYotoSession(
      "http://localhost:3000/api/yoto/connect",
      "client-123",
      "http://127.0.0.1:3000",
    );
    expect(new URL(result.authorizeUrl).searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3000/api/yoto/callback",
    );
  });

  it("verifies the callback and seals returned tokens", async () => {
    const started = await beginYotoSession("http://localhost:3000/api/yoto/connect", "client-123");
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return {
        ok: true,
        json: async () => ({ access_token: "access-1", refresh_token: "refresh-1" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const sealed = await completeYotoSession(
      `https://app.example/api/yoto/callback?code=code-1&state=${state}`,
      started.flowCookie,
    );
    expect(openCookie<YotoSession>(sealed)).toEqual({
      clientId: "client-123",
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    const tokenBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("client_id")).toBe("client-123");
    expect(tokenBody.get("code_verifier")).toBeTruthy();
  });

  it("rejects a callback with the wrong state", async () => {
    const started = await beginYotoSession("http://localhost:3000/api/yoto/connect", "client-123");
    await expect(
      completeYotoSession(
        "https://app.example/api/yoto/callback?code=code-1&state=wrong",
        started.flowCookie,
      ),
    ).rejects.toMatchObject({ code: "invalid_flow" });
  });

  it("requires an explicit refresh before using an expiring access token", () => {
    const sealed = sealCookie({
      clientId: "client-123",
      accessToken: jwt(Math.floor(Date.now() / 1000) + 30),
      refreshToken: "refresh-1",
    } satisfies YotoSession);
    expect(() => readYotoAccessToken(sealed)).toThrow(YotoSessionError);
  });

  it("rotates the refresh token and returns a new sealed session", async () => {
    const sealed = sealCookie({
      clientId: "client-123",
      accessToken: jwt(Math.floor(Date.now() / 1000) - 10),
      refreshToken: "refresh-1",
    } satisfies YotoSession);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return {
      ok: true,
      json: async () => ({
        access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
        refresh_token: "refresh-2",
      }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const refreshed = await refreshYotoSession(sealed);
    expect(openCookie<YotoSession>(refreshed)?.refreshToken).toBe("refresh-2");
    expect(openCookie<YotoSession>(refreshed)?.clientId).toBe("client-123");
    expect(readYotoAccessToken(refreshed)).toContain("header.");
    const tokenBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(tokenBody.get("client_id")).toBe("client-123");
  });
});
