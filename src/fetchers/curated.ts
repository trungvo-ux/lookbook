import * as cheerio from "cheerio";
import type { InspoItem, InspoPage } from "../types/inspo.js";
import { absoluteUrl, nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "curated-design";
const ORIGIN = "https://curated.design";

/**
 * Parse Curated Design category / home pages.
 * Prefers JSON-LD ItemList; falls back to /sites/s/{id}/ anchors.
 */
export function parseCuratedBrowse(
  html: string,
  pageUrl = ORIGIN,
  limit = 24,
): InspoItem[] {
  const $ = cheerio.load(html);
  const fetchedAt = nowIso();
  const items: InspoItem[] = [];
  const seen = new Set<string>();

  const category =
    pageUrl.match(/\/inspiration\/([^/]+)/)?.[1] ||
    pageUrl.match(/\/sections\/([^/]+)/)?.[1] ||
    "inspiration";

  // JSON-LD ItemList — prefer CollectionPage.mainEntity, skip BreadcrumbList
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const candidates: unknown[] = [];
      if (data?.mainEntity?.itemListElement) {
        candidates.push(...data.mainEntity.itemListElement);
      } else if (data?.["@type"] === "ItemList" && Array.isArray(data.itemListElement)) {
        candidates.push(...data.itemListElement);
      } else if (
        data?.["@type"] !== "BreadcrumbList" &&
        Array.isArray(data?.itemListElement)
      ) {
        candidates.push(...data.itemListElement);
      }

      for (const entry of candidates) {
        if (items.length >= limit) break;
        const e = entry as {
          name?: string;
          url?: string;
          item?: string | { name?: string; url?: string };
        };
        const name = e?.name || (typeof e?.item === "object" ? e.item?.name : undefined);
        const urlRaw =
          e?.url ||
          (typeof e?.item === "string" ? e.item : e?.item?.url);
        if (!name || !urlRaw || typeof urlRaw !== "string") continue;
        const abs = absoluteUrl(pageUrl, urlRaw);
        // Only keep real site cards
        const id = abs.match(/\/sites\/s\/(\d+)/)?.[1];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          sourceId: SOURCE_ID,
          title: String(name).trim(),
          url: abs,
          thumbnailUrl: undefined,
          imageUrls: [],
          tags: uniq(["curated", category, "website"]),
          category: "web",
          fetchedAt,
        });
      }
    } catch {
      /* ignore */
    }
  });

  // Enrich thumbnails from nearby CDN images when present
  if (items.length) {
    const imgs = $(
      'img[src*="b-cdn.net"], img[data-src*="b-cdn.net"], source[srcset*="b-cdn.net"]',
    )
      .map((_, el) => $(el).attr("src") || $(el).attr("data-src") || $(el).attr("srcset"))
      .get()
      .map((s) => (s.includes(" ") ? s.split(/\s+/)[0]! : s))
      .filter((s) => /b-cdn\.net/.test(s));
    for (let i = 0; i < Math.min(items.length, imgs.length); i++) {
      const abs = absoluteUrl(pageUrl, imgs[i]!);
      items[i]!.thumbnailUrl = abs;
      items[i]!.imageUrls = [abs];
    }
  }

  // Anchor fallback
  if (items.length < 3) {
    $('a[href*="/sites/s/"]').each((_, el) => {
      if (items.length >= limit) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const abs = absoluteUrl(pageUrl, href);
      const id = abs.match(/\/sites\/s\/(\d+)/)?.[1];
      if (!id || seen.has(id)) return;
      const title =
        $(el).text().trim() ||
        $(el).attr("aria-label") ||
        `Curated site ${id}`;
      if (title.length < 2) return;
      seen.add(id);
      items.push({
        id,
        sourceId: SOURCE_ID,
        title,
        url: abs,
        thumbnailUrl: undefined,
        imageUrls: [],
        tags: uniq(["curated", category]),
        category: "web",
        fetchedAt,
      });
    });
  }

  return items.slice(0, limit);
}

export function parseCuratedPage(html: string, pageUrl: string): InspoPage {
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);
  const id = pageUrl.match(/\/sites\/s\/(\d+)/)?.[1] || base.id;
  const $ = cheerio.load(html);
  const imgs = uniq([
    ...$("img")
      .map((_, el) => $(el).attr("src") || $(el).attr("data-src"))
      .get()
      .filter((s): s is string => !!s && /b-cdn\.net|curated/i.test(s))
      .map((s) => absoluteUrl(pageUrl, s)),
    ...base.imageUrls,
  ]);

  const live = $('a[href^="http"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .find(
      (h) =>
        h &&
        !/curated\.design|b-cdn\.net|twitter|instagram|dribbble/i.test(h),
    );

  return {
    ...base,
    id,
    sourceId: SOURCE_ID,
    title: base.title.replace(/\s*[|—–-]\s*Curated.*$/i, "").trim(),
    url: pageUrl.includes("/sites/") ? pageUrl : `${ORIGIN}/sites/s/${id}/`,
    thumbnailUrl: imgs[0] || base.thumbnailUrl,
    imageUrls: imgs.slice(0, 12),
    tags: uniq([...base.tags, "curated", "website"]),
    category: "web",
    description: base.description,
    rawExcerpt: [base.description, live ? `Live site: ${live}` : undefined, base.rawExcerpt]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 800),
    fetchedAt: nowIso(),
  };
}

export function curatedSearchUrls(categories: string[]): string[] {
  const urls = categories.slice(0, 3).map(
    (c) => `${ORIGIN}/inspiration/${c}/`,
  );
  if (!urls.length) urls.push(`${ORIGIN}/inspiration/web-apps/`);
  return uniq(urls);
}

export function isCuratedUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "curated.design";
  } catch {
    return false;
  }
}

export { SOURCE_ID as CURATED_SOURCE_ID };
