import { describe, expect, it } from "vitest";
import { getCardStages, getStatusLine, type StageCard } from "./stage";

function card(overrides: Partial<StageCard>): StageCard {
  return { tracks: [], finalized: false, ...overrides };
}

describe("getCardStages", () => {
  it("marks only 'created' done for a fresh card", () => {
    const stages = getCardStages(card({}));
    expect(stages.map((s) => [s.id, s.status])).toEqual([
      ["created", "done"],
      ["editing", "active"],
      ["staged", "pending"],
      ["on-yoto", "pending"],
    ]);
  });

  it("marks editing/staged done once finalized", () => {
    const stages = getCardStages(card({ finalized: true, tracks: [{ status: "done" }] }));
    const byId = Object.fromEntries(stages.map((s) => [s.id, s.status]));
    expect(byId.editing).toBe("done");
    expect(byId.staged).toBe("done");
    expect(byId["on-yoto"]).toBe("pending");
  });

  it("marks on-yoto active while pushing and done once linked", () => {
    const pushing = getCardStages(card({ pushingToYoto: true }));
    expect(pushing.find((s) => s.id === "on-yoto")?.status).toBe("active");

    const linked = getCardStages(card({ yotoCardId: "abc" }));
    expect(linked.find((s) => s.id === "on-yoto")?.status).toBe("done");
  });

  it("includes an error caption when a track has failed", () => {
    const stages = getCardStages(
      card({ tracks: [{ status: "ready" }, { status: "error" }] }),
    );
    expect(stages.find((s) => s.id === "editing")?.caption).toBe("1/2 ready — needs attention");
  });
});

describe("getStatusLine", () => {
  it("prioritizes pushing over other states", () => {
    expect(getStatusLine(card({ pushingToYoto: true, yotoCardId: "abc" }))).toEqual({
      text: "Pushing to Yoto…",
      tone: "active",
    });
  });

  it("reports on-yoto once linked", () => {
    expect(getStatusLine(card({ yotoCardId: "abc" }))).toEqual({ text: "On Yoto", tone: "done" });
  });

  it("reports staged when finalized but not yet pushed", () => {
    expect(getStatusLine(card({ finalized: true }))).toEqual({
      text: "Staged — ready to push",
      tone: "done",
    });
  });

  it("reports awaiting tracks for an empty card", () => {
    expect(getStatusLine(card({}))).toEqual({ text: "Awaiting tracks", tone: "idle" });
  });

  it("reports an error tone when a track has failed", () => {
    expect(getStatusLine(card({ tracks: [{ status: "ready" }, { status: "error" }] }))).toEqual({
      text: "1/2 ready — needs attention",
      tone: "error",
    });
  });

  it("reports all-ready before staging", () => {
    expect(getStatusLine(card({ tracks: [{ status: "ready" }] }))).toEqual({
      text: "All tracks ready to stage",
      tone: "active",
    });
  });

  it("reports in-progress downloading otherwise", () => {
    expect(getStatusLine(card({ tracks: [{ status: "ready" }, { status: "downloading" }] }))).toEqual({
      text: "Downloading — 1/2 ready",
      tone: "active",
    });
  });
});
