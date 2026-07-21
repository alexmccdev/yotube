import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimitsForTests } from "./rate-limit";

afterEach(() => {
  resetRateLimitsForTests();
  vi.useRealTimers();
});

describe("request rate limiting", () => {
  it("limits one client without affecting another", async () => {
    const first = new NextRequest("https://app.example/api/test", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const second = new NextRequest("https://app.example/api/test", {
      headers: { "x-forwarded-for": "203.0.113.2" },
    });

    expect(rateLimit(first, { scope: "test", limit: 1, windowMs: 60_000 })).toBeUndefined();
    const blocked = rateLimit(first, { scope: "test", limit: 1, windowMs: 60_000 });
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBe("60");
    await expect(blocked?.json()).resolves.toEqual({ error: "Too many requests. Try again shortly." });
    expect(rateLimit(second, { scope: "test", limit: 1, windowMs: 60_000 })).toBeUndefined();
  });

  it("opens a fresh window after the reset time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const request = new NextRequest("https://app.example/api/test");
    const options = { scope: "test", limit: 1, windowMs: 1_000 };

    expect(rateLimit(request, options)).toBeUndefined();
    expect(rateLimit(request, options)?.status).toBe(429);
    vi.advanceTimersByTime(1_000);
    expect(rateLimit(request, options)).toBeUndefined();
  });
});
