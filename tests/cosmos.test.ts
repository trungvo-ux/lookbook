import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCosmosBrowse, parseCosmosPage } from "../src/fetchers/cosmos.js";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("cosmos parser", () => {
  it("extracts elements / collections from explore HTML", () => {
    const html = readFileSync(
      path.join(fixtures, "cosmos-explore.html"),
      "utf8",
    );
    const items = parseCosmosBrowse(
      html,
      "https://www.cosmos.so/explore",
      30,
    );
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(item.sourceId).toBe("cosmos");
      expect(item.url).toMatch(/cosmos\.so/);
      expect(item.title).toBeTruthy();
      expect(item.fetchedAt).toBeTruthy();
    }
    expect(
      items.some((i) => i.url.includes("/e/") || i.tags.includes("collection")),
    ).toBe(true);
  });

  it("parses an element detail page", () => {
    const html = readFileSync(
      path.join(fixtures, "cosmos-element.html"),
      "utf8",
    );
    const page = parseCosmosPage(html, "https://www.cosmos.so/e/909427425");
    expect(page.id).toBe("909427425");
    expect(page.sourceId).toBe("cosmos");
    expect(page.imageUrls.some((u) => u.includes("cdn.cosmos.so"))).toBe(true);
    expect(page.author || page.description || page.rawExcerpt).toBeTruthy();
  });
});
