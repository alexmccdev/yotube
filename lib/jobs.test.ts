import { describe, expect, it } from "vitest";
import { isLocked, sanitizeFilename } from "./jobs";

describe("sanitizeFilename", () => {
  it("strips filesystem-unsafe characters", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("trims whitespace", () => {
    expect(sanitizeFilename("  hello  ")).toBe("hello");
  });

  it("truncates to 80 characters", () => {
    expect(sanitizeFilename("a".repeat(200))).toHaveLength(80);
  });

  it("falls back to 'untitled' when nothing is left", () => {
    expect(sanitizeFilename("")).toBe("untitled");
    expect(sanitizeFilename("***")).toBe("untitled");
  });
});

describe("isLocked", () => {
  it("is locked only once finalized", () => {
    expect(isLocked({ finalized: false } as never)).toBe(false);
    expect(isLocked({ finalized: true } as never)).toBe(true);
  });
});
