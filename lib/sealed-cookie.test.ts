import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCookie, sealCookie } from "./sealed-cookie";

describe("sealed cookies", () => {
  beforeEach(() => {
    process.env.WEB_SESSION_SECRET = "test-secret-with-enough-entropy-for-tests";
  });

  afterEach(() => {
    delete process.env.WEB_SESSION_SECRET;
  });

  it("round-trips JSON without exposing the plaintext", () => {
    const sealed = sealCookie({ accessToken: "private-token", count: 2 });
    expect(sealed).not.toContain("private-token");
    expect(openCookie(sealed)).toEqual({ accessToken: "private-token", count: 2 });
  });

  it("rejects a tampered value", () => {
    const sealed = sealCookie({ value: "safe" });
    const tampered = `${sealed.slice(0, -1)}${sealed.endsWith("a") ? "b" : "a"}`;
    expect(openCookie(tampered)).toBeUndefined();
  });

  it("rejects a weak production secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.WEB_SESSION_SECRET = "too-short";
    try {
      expect(() => sealCookie({ value: "safe" })).toThrow("at least 32 bytes");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
