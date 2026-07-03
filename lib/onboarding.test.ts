import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOnboardingState, saveOnboardingState } from "./onboarding";

// lib/onboarding.ts reads/writes browser localStorage; stub an in-memory version since
// vitest runs in the "node" environment with no DOM globals.
let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadOnboardingState", () => {
  it("defaults to empty hint views when nothing is stored", () => {
    expect(loadOnboardingState()).toEqual({ hintViews: {} });
  });

  it("round-trips a saved state", () => {
    saveOnboardingState({ hintViews: { "track-url-input": 2 } });
    expect(loadOnboardingState()).toEqual({ hintViews: { "track-url-input": 2 } });
  });

  it("falls back to defaults on malformed JSON", () => {
    store["yotube:onboarding:v1"] = "{not json";
    expect(loadOnboardingState()).toEqual({ hintViews: {} });
  });

  it("falls back to an empty object when hintViews is missing or the wrong shape", () => {
    store["yotube:onboarding:v1"] = JSON.stringify({ hintViews: "nope" });
    expect(loadOnboardingState()).toEqual({ hintViews: {} });
  });
});

describe("saveOnboardingState", () => {
  it("does not throw when localStorage.setItem fails", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });
    expect(() => saveOnboardingState({ hintViews: {} })).not.toThrow();
  });
});
