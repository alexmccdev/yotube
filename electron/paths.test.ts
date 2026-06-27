import { describe, expect, it } from "vitest";
import { resolveDataDirs } from "./paths.js";

describe("resolveDataDirs", () => {
  it("defaults to subfolders of the given userData path", () => {
    const { workDir, cardsDir } = resolveDataDirs("/Users/alex/Library/Application Support/Yotube", {});
    expect(workDir).toBe("/Users/alex/Library/Application Support/Yotube/work");
    expect(cardsDir).toBe("/Users/alex/Library/Application Support/Yotube/cards");
  });

  it("respects WORK_DIR/CARDS_DIR env overrides", () => {
    const { workDir, cardsDir } = resolveDataDirs("/unused", {
      WORK_DIR: "/custom/work",
      CARDS_DIR: "/custom/cards",
    });
    expect(workDir).toBe("/custom/work");
    expect(cardsDir).toBe("/custom/cards");
  });

  it("falls back to userData when only one override is set", () => {
    const { workDir, cardsDir } = resolveDataDirs("/data", { WORK_DIR: "/custom/work" });
    expect(workDir).toBe("/custom/work");
    expect(cardsDir).toBe("/data/cards");
  });
});
