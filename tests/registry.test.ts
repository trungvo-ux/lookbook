import { describe, expect, it } from "vitest";
import {
  REQUIRED_SOURCE_NAMES,
  SOURCES,
  getSource,
  listSources,
  sourceSummary,
} from "../src/sources/registry.js";

describe("source registry", () => {
  it("includes every required name from the user list plus Godly", () => {
    const names = new Set(SOURCES.map((s) => s.name));
    for (const required of REQUIRED_SOURCE_NAMES) {
      expect(names.has(required), `missing source: ${required}`).toBe(true);
    }
  });

  it("marks Godly, Minimal Gallery, and Cosmos as dedicated fetchers", () => {
    expect(getSource("godly")?.hasDedicatedFetcher).toBe(true);
    expect(getSource("minimal-gallery")?.hasDedicatedFetcher).toBe(true);
    expect(getSource("cosmos")?.hasDedicatedFetcher).toBe(true);
  });

  it("list_sources summary shape is complete", () => {
    const summaries = listSources().map(sourceSummary);
    expect(summaries.length).toBeGreaterThanOrEqual(48);
    for (const s of summaries) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.homeUrl).toMatch(/^https?:\/\//);
      expect([
        "mobile",
        "web",
        "component",
        "moodboard",
        "tool",
        "other",
      ]).toContain(s.category);
      expect(s.description.length).toBeGreaterThan(5);
      expect(typeof s.hasDedicatedFetcher).toBe("boolean");
    }
  });

  it("has unique ids", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
