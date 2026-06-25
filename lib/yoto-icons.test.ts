import { describe, expect, it } from "vitest";
import { deriveSearchKeyword } from "./yoto-icons";

describe("deriveSearchKeyword", () => {
  it("strips bracketed tags", () => {
    expect(deriveSearchKeyword("Never Gonna Give You Up (Official Video)")).toBe(
      "Never Gonna Give",
    );
  });

  it("drops common noise words", () => {
    expect(deriveSearchKeyword("Some Song Official Audio HD")).toBe("Some");
    expect(deriveSearchKeyword("Cool Track Remastered")).toBe("Cool Track");
  });

  it("keeps at most 3 words", () => {
    expect(deriveSearchKeyword("one two three four five")).toBe("one two three");
  });

  it("falls back to the full title if nothing survives filtering", () => {
    expect(deriveSearchKeyword("Official Video HD")).toBe("Official Video HD");
  });
});
