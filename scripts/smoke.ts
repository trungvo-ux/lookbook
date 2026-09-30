/**
 * Live smoke test for priority sources (skips if network blocked).
 * Run: npx tsx scripts/smoke.ts
 */
import { listSources, sourceSummary } from "../src/sources/registry.js";
import {
  browseSource,
  getInspoPage,
  searchInspo,
} from "../src/fetchers/index.js";

async function main() {
  const sources = listSources().map(sourceSummary);
  console.log("list_sources count:", sources.length);
  console.log(
    "dedicated:",
    sources.filter((s) => s.hasDedicatedFetcher).map((s) => s.id),
  );

  for (const id of ["godly", "minimal-gallery", "cosmos"] as const) {
    try {
      const browse = await browseSource(id, { limit: 5 });
      console.log(`\nbrowse_source ${id}: ${browse.items.length} items`);
      console.log(
        browse.items
          .slice(0, 3)
          .map((i) => `  - ${i.title} → ${i.url}`)
          .join("\n"),
      );
      if (browse.items[0]) {
        const page = await getInspoPage({
          url: browse.items[0].url,
          sourceId: id,
          id: browse.items[0].id,
        });
        console.log(
          `get_inspo_page: ${page.title} images=${page.imageUrls.length}`,
        );
      }
    } catch (err) {
      console.error(`FAIL ${id}:`, err instanceof Error ? err.message : err);
    }
  }

  try {
    const search = await searchInspo({
      query: "saas",
      sourceIds: ["godly", "minimal-gallery"],
      limit: 5,
    });
    console.log(`\nsearch_inspo saas: ${search.items.length} results`);
  } catch (err) {
    console.error("search fail", err);
  }
}

main();
