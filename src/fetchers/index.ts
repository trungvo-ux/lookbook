import type { BrowseResult, InspoItem, InspoPage } from "../types/inspo.js";
import { getSource, resolveSourceFromUrl } from "../sources/registry.js";
import { FetchError, fetchHtml, nowIso } from "../lib/http.js";
import {
  pickSearchSources,
  scoreAgainstQuery,
  understandQuery,
  type UnderstoodQuery,
} from "../lib/query.js";
import {
  extractGenericBrowse,
  extractGenericPage,
} from "./generic.js";
import {
  isGodlyUrl,
  parseGodlyBrowse,
  parseGodlyPage,
} from "./godly.js";
import {
  isMinimalUrl,
  parseMinimalBrowse,
  parseMinimalPage,
} from "./minimal.js";
import {
  isCosmosUrl,
  parseCosmosBrowse,
  parseCosmosPage,
} from "./cosmos.js";
import {
  isMobbinUrl,
  mobbinSearchUrls,
  parseMobbinBrowse,
  parseMobbinPage,
} from "./mobbin.js";
import {
  awwwardsSearchUrls,
  isAwwwardsUrl,
  parseAwwwardsBrowse,
  parseAwwwardsPage,
} from "./awwwards.js";
import {
  curatedSearchUrls,
  isCuratedUrl,
  parseCuratedBrowse,
  parseCuratedPage,
} from "./curated.js";
import {
  browseSixtyfps,
  isSixtyfpsUrl,
  parseSixtyfpsPage,
} from "./sixtyfps.js";

function softFilterByQuery(
  items: InspoItem[],
  q?: UnderstoodQuery,
): InspoItem[] {
  if (!q || (!q.terms.length && !q.expandedTerms.length)) return items;
  const scored = items
    .map((item) => ({ item, score: scoreAgainstQuery(item, q) }))
    .sort((a, b) => b.score - a.score);
  const positive = scored.filter((s) => s.score > 0);
  // Keep positives when available; otherwise return ranked originals (don't empty)
  return (positive.length ? positive : scored).map((s) => s.item);
}

async function fetchAndParseBrowse(
  sourceId: string,
  url: string,
  limit: number,
  platform?: "mobile" | "web",
): Promise<{ items: InspoItem[]; finalUrl: string; note?: string }> {
  const { html, finalUrl } = await fetchHtml(url);
  let items: InspoItem[] = [];

  if (sourceId === "godly") {
    items = parseGodlyBrowse(html, finalUrl, limit * 2);
  } else if (sourceId === "minimal-gallery") {
    items = parseMinimalBrowse(html, finalUrl, limit * 2);
  } else if (sourceId === "cosmos") {
    items = parseCosmosBrowse(html, finalUrl, limit * 2);
  } else if (sourceId === "mobbin") {
    const plat =
      platform ||
      (/\/web\//.test(finalUrl) || /\/web\//.test(url) ? "web" : "mobile");
    items = parseMobbinBrowse(html, finalUrl, limit * 2, plat);
  } else if (sourceId === "awwwards") {
    items = parseAwwwardsBrowse(html, finalUrl, limit * 2);
  } else if (sourceId === "curated-design") {
    items = parseCuratedBrowse(html, finalUrl, limit * 2);
  } else if (sourceId === "60fps") {
    // URL fetch unused for listing — sitemap-driven
    items = [];
  } else {
    items = extractGenericBrowse(html, finalUrl, sourceId, limit * 2);
  }

  return { items, finalUrl };
}

export async function browseSource(
  sourceId: string,
  options: { query?: string; limit?: number } = {},
): Promise<BrowseResult> {
  const source = getSource(sourceId);
  if (!source) {
    throw new Error(
      `Unknown source id "${sourceId}". Call list_sources for valid ids.`,
    );
  }

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const understood = options.query?.trim()
    ? understandQuery(options.query)
    : undefined;
  const fetchedAt = nowIso();
  let note: string | undefined;
  let items: InspoItem[] = [];

  try {
    if (sourceId === "60fps") {
      items = await browseSixtyfps({
        query: understood?.normalized || options.query,
        hints: understood?.sixtyfpsHints,
        limit: limit * 2,
      });
    } else if (sourceId === "mobbin") {
      const patterns = understood?.mobbinPatterns?.length
        ? understood.mobbinPatterns
        : options.query
          ? [options.query.toLowerCase().replace(/[^a-z0-9]+/g, "-")]
          : ["dashboard", "home"];
      const urls = mobbinSearchUrls(patterns, "mobile");
      const results = await Promise.allSettled(
        urls.slice(0, 3).map((u) =>
          fetchAndParseBrowse(
            "mobbin",
            u,
            limit,
            /\/web\//.test(u) ? "web" : "mobile",
          ),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") items.push(...r.value.items);
        else {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason);
          note = (note ? `${note}; ` : "") + msg;
        }
      }
      if (!items.length) {
        const fallback = await fetchAndParseBrowse(
          "mobbin",
          "https://mobbin.com/explore/mobile",
          limit,
          "mobile",
        );
        items = fallback.items;
        note =
          note ||
          "Mobbin pattern pages returned no cards; fell back to explore/mobile.";
      }
    } else if (sourceId === "awwwards") {
      const urls = options.query?.trim()
        ? awwwardsSearchUrls(
            understood?.terms.join(" ") || options.query,
            understood?.awwwardsCategories || [],
          )
        : ["https://www.awwwards.com/websites/nominees/"];
      const results = await Promise.allSettled(
        urls.slice(0, 2).map((u) => fetchAndParseBrowse("awwwards", u, limit)),
      );
      for (const r of results) {
        if (r.status === "fulfilled") items.push(...r.value.items);
      }
    } else if (sourceId === "curated-design") {
      const urls = options.query?.trim()
        ? curatedSearchUrls(understood?.curatedCategories || ["web-apps"])
        : ["https://curated.design/inspiration/web-apps/"];
      const results = await Promise.allSettled(
        urls.slice(0, 2).map((u) =>
          fetchAndParseBrowse("curated-design", u, limit),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") items.push(...r.value.items);
      }
    } else if (sourceId === "cosmos") {
      const q = encodeURIComponent(
        (understood?.terms.join(" ") || options.query || "").trim(),
      );
      const url = q
        ? `https://www.cosmos.so/explore?q=${q}`
        : "https://www.cosmos.so/explore";
      const result = await fetchAndParseBrowse("cosmos", url, limit);
      items = result.items;
    } else if (sourceId === "minimal-gallery") {
      const q = encodeURIComponent(
        (understood?.terms[0] || options.query || "").trim(),
      );
      const url = q
        ? `https://minimal.gallery/?s=${q}`
        : "https://minimal.gallery/";
      const result = await fetchAndParseBrowse("minimal-gallery", url, limit);
      items = result.items;
      // Soft-fallback to home if search page is sparse
      if (options.query && items.length < 3) {
        const home = await fetchAndParseBrowse(
          "minimal-gallery",
          "https://minimal.gallery/",
          limit,
        );
        items = [...items, ...home.items];
      }
    } else if (sourceId === "godly") {
      const url = "https://godly.design/websites";
      const result = await fetchAndParseBrowse("godly", url, limit);
      items = result.items;
      if (!items.length) {
        const home = await fetchAndParseBrowse("godly", "https://godly.design/", limit);
        items = home.items;
      }
    } else {
      const browseUrl = source.browseUrl || source.homeUrl;
      let url = browseUrl;
      if (options.query?.trim()) {
        try {
          const u = new URL(browseUrl);
          u.searchParams.set("q", options.query.trim());
          url = u.toString();
        } catch {
          /* keep */
        }
      }
      const result = await fetchAndParseBrowse(sourceId, url, limit);
      items = result.items;
      if (!items.length) {
        note =
          "No gallery cards detected via generic extractor. Try get_inspo_page with a specific URL.";
        const { html, finalUrl } = await fetchHtml(url);
        items = [extractGenericPage(html, finalUrl, sourceId)];
      }
    }
  } catch (err) {
    if (err instanceof FetchError) {
      throw err;
    }
    throw err;
  }

  // Dedup by URL
  const dedup = new Map<string, InspoItem>();
  for (const item of items) {
    if (!dedup.has(item.url)) dedup.set(item.url, item);
  }
  let merged = [...dedup.values()];

  if (understood) {
    merged = softFilterByQuery(merged, understood);
  }

  const sliced = merged.slice(0, limit);

  return {
    sourceId,
    query: options.query,
    items: sliced,
    fetchedAt,
    note:
      sliced.length === 0 && options.query
        ? `No items matched query "${options.query}" from ${sourceId}.`
        : note,
  };
}

export async function getInspoPage(input: {
  url?: string;
  sourceId?: string;
  id?: string;
}): Promise<InspoPage> {
  let url = input.url?.trim();

  if (!url && input.sourceId && input.id) {
    const source = getSource(input.sourceId);
    if (!source) throw new Error(`Unknown source id "${input.sourceId}"`);
    if (input.sourceId === "godly") {
      url = `https://godly.design/website/${input.id}`;
    } else if (input.sourceId === "minimal-gallery") {
      url = `https://minimal.gallery/${input.id}/`;
    } else if (input.sourceId === "cosmos") {
      url = `https://www.cosmos.so/e/${input.id}`;
    } else if (input.sourceId === "mobbin") {
      url = `https://mobbin.com/explore/screens/${input.id}`;
    } else if (input.sourceId === "awwwards") {
      url = `https://www.awwwards.com/sites/${input.id}`;
    } else if (input.sourceId === "curated-design") {
      url = `https://curated.design/sites/s/${input.id}/`;
    } else if (input.sourceId === "60fps") {
      url = `https://60fps.design/shots/${input.id}`;
    } else {
      throw new Error(
        `sourceId+id resolution is only supported for dedicated sources. Pass a full url instead.`,
      );
    }
  }

  if (!url) {
    throw new Error("Provide url, or sourceId + id");
  }

  if (isGodlyUrl(url) && /godly\.website/i.test(url)) {
    const slug = url.match(/\/website\/([a-z0-9-]+)/i)?.[1];
    if (slug) url = `https://godly.design/website/${slug}`;
  }

  const source =
    (input.sourceId && getSource(input.sourceId)) ||
    resolveSourceFromUrl(url);

  const { html, finalUrl } = await fetchHtml(url);
  const sourceId = source?.id || "unknown";

  try {
    if (isMobbinUrl(finalUrl) || isMobbinUrl(url) || sourceId === "mobbin") {
      return parseMobbinPage(html, finalUrl);
    }
    if (isAwwwardsUrl(finalUrl) || isAwwwardsUrl(url) || sourceId === "awwwards") {
      return parseAwwwardsPage(html, finalUrl);
    }
    if (isCuratedUrl(finalUrl) || isCuratedUrl(url) || sourceId === "curated-design") {
      return parseCuratedPage(html, finalUrl);
    }
    if (isSixtyfpsUrl(finalUrl) || isSixtyfpsUrl(url) || sourceId === "60fps") {
      return parseSixtyfpsPage(html, finalUrl);
    }
    if (isGodlyUrl(finalUrl) || isGodlyUrl(url) || sourceId === "godly") {
      if (
        /godly\.design\/website\//i.test(finalUrl) ||
        /godly\.design\/website\//i.test(url)
      ) {
        return parseGodlyPage(html, finalUrl);
      }
    }
    if (isMinimalUrl(finalUrl) || isMinimalUrl(url) || sourceId === "minimal-gallery") {
      return parseMinimalPage(html, finalUrl);
    }
    if (isCosmosUrl(finalUrl) || isCosmosUrl(url) || sourceId === "cosmos") {
      return parseCosmosPage(html, finalUrl);
    }
    return extractGenericPage(html, finalUrl, sourceId);
  } catch (err) {
    if (err instanceof FetchError) throw err;
    return extractGenericPage(html, finalUrl, sourceId);
  }
}

export async function searchInspo(input: {
  query: string;
  sourceIds?: string[];
  limit?: number;
}): Promise<{
  query: string;
  understood: ReturnType<typeof understandQuery>;
  items: InspoItem[];
  fetchedAt: string;
  notes: string[];
}> {
  const query = input.query.trim();
  if (!query) throw new Error("query is required");

  const understood = understandQuery(query);
  // Default 6 high-quality hits (clamp to 3–8 unless caller asks for more)
  const requested = input.limit ?? 6;
  const limit =
    input.limit == null
      ? 6
      : Math.min(Math.max(requested, 1), 50);

  const targets = pickSearchSources(understood, input.sourceIds).slice(0, 7);
  const perSource = Math.max(4, Math.ceil(limit / 2) + 2);
  const notes: string[] = [];
  const all: InspoItem[] = [];

  const results = await Promise.allSettled(
    targets.map((id) =>
      browseSource(id, {
        query: understood.terms.join(" ") || query,
        limit: perSource,
      }),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const id = targets[i]!;
    if (r.status === "fulfilled") {
      all.push(...r.value.items);
      if (r.value.note) notes.push(`${id}: ${r.value.note}`);
      if (!r.value.items.length) notes.push(`${id}: 0 items`);
    } else {
      const msg =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
      notes.push(`${id}: failed — ${msg}`);
    }
  }

  const scored = all.map((item) => ({
    item,
    score: scoreAgainstQuery(item, understood),
  }));
  scored.sort((a, b) => b.score - a.score);

  const dedup = new Map<string, InspoItem>();
  for (const { item, score } of scored) {
    if (score <= 0 && dedup.size >= limit) continue;
    if (!dedup.has(item.url)) dedup.set(item.url, item);
  }

  // Ensure we still return something useful
  if (dedup.size < Math.min(3, limit)) {
    for (const { item } of scored) {
      if (!dedup.has(item.url)) dedup.set(item.url, item);
      if (dedup.size >= limit) break;
    }
  }

  let items = [...dedup.values()].slice(0, limit);

  // Prefer a mix that includes Mobbin when product-UI intent and Mobbin returned hits
  if (understood.preferProductSources) {
    const mobbinHits = scored
      .filter((s) => s.item.sourceId === "mobbin" && s.score > 0)
      .map((s) => s.item);
    if (mobbinHits.length) {
      const rest = items.filter((i) => i.sourceId !== "mobbin");
      items = [...mobbinHits.slice(0, Math.min(4, limit)), ...rest]
        .filter((item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx)
        .slice(0, limit);
    }
  }

  notes.unshift(
    `understood intent=${understood.intent}; terms=[${understood.terms.join(", ")}]; sources=${targets.join(",")}`,
  );

  return {
    query,
    understood,
    items,
    fetchedAt: nowIso(),
    notes,
  };
}
