import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isSameOrigin } from "./route-safety";

describe("same-origin route safety", () => {
  it("accepts the browser's same-origin fetch metadata behind a proxy", () => {
    const request = new NextRequest("http://internal:3000/api/yoto/tracks", {
      headers: { origin: "https://app.example", "sec-fetch-site": "same-origin" },
    });
    expect(isSameOrigin(request)).toBe(true);
  });

  it("compares origin against forwarded host and protocol", () => {
    const request = new NextRequest("http://internal:3000/api/yoto/tracks", {
      headers: {
        origin: "https://app.example",
        host: "internal:3000",
        "x-forwarded-host": "app.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOrigin(request)).toBe(true);
  });

  it("rejects cross-site requests", () => {
    const request = new NextRequest("https://app.example/api/yoto/tracks", {
      headers: { origin: "https://evil.example", host: "app.example", "sec-fetch-site": "cross-site" },
    });
    expect(isSameOrigin(request)).toBe(false);
  });
});
