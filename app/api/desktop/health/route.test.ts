import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.YOTUBE_DESKTOP_STARTUP_TOKEN;
});

describe("desktop server health check", () => {
  it("is unavailable outside a desktop server", () => {
    expect(GET(new Request("http://127.0.0.1/api/desktop/health")).status).toBe(404);
  });

  it("requires the exact per-launch startup token", () => {
    process.env.YOTUBE_DESKTOP_STARTUP_TOKEN = "private-startup-token";
    const wrong = new Request("http://127.0.0.1/api/desktop/health", {
      headers: { "X-Yotube-Startup-Token": "wrong-startup-token!!" },
    });
    const correct = new Request("http://127.0.0.1/api/desktop/health", {
      headers: { "X-Yotube-Startup-Token": "private-startup-token" },
    });

    expect(GET(wrong).status).toBe(404);
    expect(GET(correct).status).toBe(204);
  });
});
