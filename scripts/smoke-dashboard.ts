/**
 * Integration smoke: search "dashboard" across priority sources.
 * Run: npx tsx scripts/smoke-dashboard.ts
 * Skips gracefully when a source blocks the network.
 */
import { searchInspo, browseSource } from "../src/fetchers/index.js";
import { understandQuery } from "../src/lib/query.js";

async function main() {
  const query = "find me a dashboard design";
  console.log("query:", query);
  console.log("understood:", understandQuery(query));

  console.log("\n=== per-source browse ===");
  for (const id of [
    "mobbin",
    "awwwards",
    "curated-design",
    "60fps",
    "godly",
    "minimal-gallery",
    "cosmos",
  ]) {
    try {
      const r = await browseSource(id, { query: "dashboard", limit: 4 });
      console.log(
        `\n${id}: ${r.items.length} items${r.note ? ` (${r.note.slice(0, 80)})` : ""}`,
      );
      for (const item of r.items.slice(0, 3)) {
        console.log(
          `  - ${item.title}\n    ${item.url}\n    thumb=${item.thumbnailUrl ? "yes" : "no"} tags=${item.tags.slice(0, 4).join(",")}`,
        );
      }
    } catch (err) {
      console.log(
        `\n${id}: FAILED —`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log("\n=== search_inspo fan-out ===");
  const result = await searchInspo({ query, limit: 6 });
  console.log("notes:", result.notes);
  console.log(`results: ${result.items.length}`);
  for (const item of result.items) {
    console.log(
      JSON.stringify(
        {
          sourceId: item.sourceId,
          title: item.title,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          tags: item.tags.slice(0, 6),
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
