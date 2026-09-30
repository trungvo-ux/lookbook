import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { understandQuery, scoreAgainstQuery } from "../src/lib/query.js";
import { parseMobbinBrowse } from "../src/fetchers/mobbin.js";
import { parseAwwwardsBrowse } from "../src/fetchers/awwwards.js";
import { parseCuratedBrowse } from "../src/fetchers/curated.js";
import {
  filterSixtyfpsUrls,
  parseSixtyfpsBrowseFromUrls,
  parseSixtyfpsPage,
} from "../src/fetchers/sixtyfps.js";
import { getSource, listSources } from "../src/sources/registry.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("query understanding", () => {
  it("maps conversational dashboard query to product-ui + mobbin pattern", () => {
    const q = understandQuery("Hey Lookbook, find me a dashboard design");
    expect(q.intent).toBe("product-ui");
    expect(q.terms).toContain("dashboard");
    expect(q.preferProductSources).toBe(true);
    expect(q.mobbinPatterns).toContain("dashboard");
    expect(q.expandedTerms).toEqual(
      expect.arrayContaining(["dashboard", "analytics", "admin"]),
    );
  });

  it("scores Mobbin dashboard titles highly", () => {
    const q = understandQuery("dashboard");
    const score = scoreAgainstQuery(
      {
        title: "Stripe — Home Dashboard",
        description: "Dashboard displaying net worth",
        tags: ["mobbin", "mobile", "dashboard"],
        url: "https://mobbin.com/explore/mobile/screens/dashboard",
        thumbnailUrl: "https://example.com/t.png",
        sourceId: "mobbin",
      },
      q,
    );
    expect(score).toBeGreaterThan(10);
  });
});

describe("mobbin parser", () => {
  it("extracts screen cards with thumbnails from dashboard fixture", () => {
    const html = readFileSync(
      path.join(fixtures, "mobbin-dashboard.html"),
      "utf8",
    );
    const items = parseMobbinBrowse(
      html,
      "https://mobbin.com/explore/mobile/screens/dashboard",
      12,
    );
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.sourceId).toBe("mobbin");
      expect(item.url).toMatch(/mobbin\.com\/explore\/screens\//);
      expect(item.thumbnailUrl).toMatch(/app_screens/);
      expect(item.title.length).toBeGreaterThan(2);
    }
  });
});

describe("awwwards parser", () => {
  it("extracts site cards from dashboard category fixture", () => {
    const html = readFileSync(
      path.join(fixtures, "awwwards-dashboard.html"),
      "utf8",
    );
    const items = parseAwwwardsBrowse(
      html,
      "https://www.awwwards.com/websites/dashboard/",
      10,
    );
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some((i) => /dashboard/i.test(i.title))).toBe(true);
    expect(items[0]?.thumbnailUrl).toMatch(/awwwards/);
  });
});

describe("curated design parser", () => {
  it("extracts ItemList site cards (not breadcrumbs)", () => {
    const html = readFileSync(
      path.join(fixtures, "curated-web-apps.html"),
      "utf8",
    );
    const items = parseCuratedBrowse(
      html,
      "https://curated.design/inspiration/web-apps/",
      10,
    );
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => /\/sites\/s\//.test(i.url))).toBe(true);
    expect(items[0]?.title.toLowerCase()).not.toBe("curated");
  });
});

describe("60fps sitemap search", () => {
  it("ranks graph/chart shots for dashboard-like queries", () => {
    const xml = readFileSync(path.join(fixtures, "60fps-sitemap.xml"), "utf8");
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    const matched = filterSixtyfpsUrls(urls, {
      query: "dashboard charts",
      hints: ["graph", "chart"],
      limit: 8,
    });
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.some((u) => /graph|chart/i.test(u))).toBe(true);
    const items = parseSixtyfpsBrowseFromUrls(matched, 5, ["graph"]);
    expect(items[0]?.sourceId).toBe("60fps");
    expect(items[0]?.tags).toContain("motion");
  });

  it("parses shot detail OG metadata", () => {
    const html = readFileSync(path.join(fixtures, "60fps-shot.html"), "utf8");
    const page = parseSixtyfpsPage(
      html,
      "https://60fps.design/shots/x-stock-graph-interaction",
    );
    expect(page.title.toLowerCase()).toContain("graph");
    expect(page.thumbnailUrl).toMatch(/framerusercontent|og|gif|png/i);
  });
});

describe("registry dedicated flags", () => {
  it("marks all priority search sources as dedicated", () => {
    for (const id of [
      "godly",
      "minimal-gallery",
      "cosmos",
      "60fps",
      "awwwards",
      "curated-design",
      "mobbin",
    ]) {
      expect(getSource(id)?.hasDedicatedFetcher).toBe(true);
    }
    expect(listSources().length).toBeGreaterThanOrEqual(48);
  });
});
