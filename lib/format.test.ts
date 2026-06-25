import { describe, expect, it } from "vitest";
import { catalogNumber, formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats seconds-only durations as m:ss", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats durations over an hour as h:mm:ss", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("rounds fractional seconds", () => {
    expect(formatDuration(59.6)).toBe("1:00");
  });
});

describe("catalogNumber", () => {
  it("strips dashes, uppercases, and takes the first 4 chars", () => {
    expect(catalogNumber("ab12-cd34-ef56")).toBe("AB12");
  });

  it("is stable for the same id", () => {
    const id = "1234-5678-9012";
    expect(catalogNumber(id)).toBe(catalogNumber(id));
  });
});
