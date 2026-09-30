import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseMinimalBrowse,
  parseMinimalPage,
} from "../src/fetchers/minimal.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("minimal gallery parser", () => {
  it("extracts website cards from homepage HTML", () => {
    const html = readFileSync(
      path.join(fixtures, "minimal-home.html"),
      "utf8",
    );
    const items = parseMinimalBrowse(html, "https://minimal.gallery/", 20);
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.sourceId).toBe("minimal-gallery");
      expect(item.url).toMatch(/^https:\/\/minimal\.gallery\//);
      expect(item.title).toBeTruthy();
      expect(item.fetchedAt).toBeTruthy();
    }
    expect(items.some((i) => i.thumbnailUrl)).toBe(true);
  });

  it("parses a detail page with tags and images", () => {
    const html = readFileSync(
      path.join(fixtures, "minimal-detail.html"),
      "utf8",
    );
    const page = parseMinimalPage(
      html,
      "https://minimal.gallery/xanvier-allison/",
    );
    expect(page.id).toBe("xanvier-allison");
    expect(page.sourceId).toBe("minimal-gallery");
    expect(page.title.toLowerCase()).toContain("xanvier");
    expect(page.imageUrls.length).toBeGreaterThan(0);
    expect(page.tags.length).toBeGreaterThan(0);
  });
});
