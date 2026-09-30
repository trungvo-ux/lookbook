import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGodlyBrowse, parseGodlyPage } from "../src/fetchers/godly.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("godly parser", () => {
  it("extracts website cards from gallery HTML", () => {
    const html = readFileSync(path.join(fixtures, "godly-home.html"), "utf8");
    const items = parseGodlyBrowse(html, "https://godly.design/websites", 20);
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(item.sourceId).toBe("godly");
      expect(item.url).toMatch(/^https:\/\/godly\.design\/website\//);
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.thumbnailUrl).toMatch(/cdn\.godly\.design|thumbnail/);
      expect(item.fetchedAt).toBeTruthy();
    }
  });

  it("parses a detail page into a structured InspoPage", () => {
    const html = readFileSync(path.join(fixtures, "godly-detail.html"), "utf8");
    const page = parseGodlyPage(html, "https://godly.design/website/gitnimble");
    expect(page.id).toBe("gitnimble");
    expect(page.sourceId).toBe("godly");
    expect(page.title.toLowerCase()).toContain("gitnimble");
    expect(page.imageUrls.length).toBeGreaterThan(3);
    expect(page.imageUrls.some((u) => u.includes("cdn.godly.design"))).toBe(
      true,
    );
    expect(page.description || page.rawExcerpt).toBeTruthy();
  });
});
