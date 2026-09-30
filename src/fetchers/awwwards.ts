import * as cheerio from "cheerio";
import type { InspoItem, InspoPage } from "../types/inspo.js";
import { absoluteUrl, nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "awwwards";
const ORIGIN = "https://www.awwwards.com";

function firstSrcFromSrcset(srcset?: string): string | undefined {
  if (!srcset) return undefined;
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first;
}

/**
 * Parse Awwwards gallery / category / search HTML (figure-rollover site cards).
 */
export function parseAwwwardsBrowse(
  html: string,
  pageUrl = ORIGIN,
  limit = 24,
): InspoItem[] {
  const $ = cheerio.load(html);
  const items: InspoItem[] = [];
  const seen = new Set<string>();
  const fetchedAt = nowIso();

  $("a.figure-rollover__link, a[href*='/sites/']").each((_, el) => {
    if (items.length >= limit) return false;
    const a = $(el);
    const href = a.attr("href");
    if (!href || !href.includes("/sites/")) return;
    const abs = absoluteUrl(pageUrl, href.split("?")[0]!);
    const slug = abs.match(/\/sites\/([^/]+)/)?.[1];
    if (!slug || seen.has(slug)) return;

    const title =
      a.attr("aria-label") ||
      a.find("img").first().attr("alt") ||
      slug.replace(/-/g, " ");

    // Prefer real submission thumbs over avatars / data-uri placeholders
    let thumb =
      a.find("img").first().attr("data-src") ||
      firstSrcFromSrcset(a.find("img").first().attr("data-srcset")) ||
      firstSrcFromSrcset(a.find("img").first().attr("srcset"));
    const src = a.find("img").first().attr("src");
    if (!thumb && src && !src.startsWith("data:")) thumb = src;

    // Parent figure may hold the lazy image
    if (!thumb || thumb.startsWith("data:")) {
      const parent = a.closest(".figure-rollover, figure, li, article");
      thumb =
        parent.find("img").first().attr("data-src") ||
        firstSrcFromSrcset(parent.find("img").first().attr("data-srcset")) ||
        firstSrcFromSrcset(parent.find("img").first().attr("srcset")) ||
        thumb;
    }

    if (thumb?.includes(" ")) {
      thumb = firstSrcFromSrcset(thumb) || thumb;
    }

    seen.add(slug);
    items.push({
      id: slug,
      sourceId: SOURCE_ID,
      title: title.replace(/&#039;/g, "'").replace(/\s+/g, " ").trim(),
      url: `${ORIGIN}/sites/${slug}`,
      thumbnailUrl: thumb && !thumb.startsWith("data:") ? absoluteUrl(pageUrl, thumb) : undefined,
      imageUrls:
        thumb && !thumb.startsWith("data:")
          ? [absoluteUrl(pageUrl, thumb)]
          : [],
      tags: uniq(["awwwards", "website", ...slug.split("-").slice(0, 4)]),
      category: "web",
      fetchedAt,
    });
  });

  return items.slice(0, limit);
}

export function parseAwwwardsPage(html: string, pageUrl: string): InspoPage {
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);
  const slug = pageUrl.match(/\/sites\/([^/]+)/)?.[1] || base.id;
  const $ = cheerio.load(html);
  const imgs = uniq([
    ...$("img")
      .map((_, el) => $(el).attr("data-src") || $(el).attr("src"))
      .get()
      .filter(
        (s): s is string =>
          !!s &&
          !s.startsWith("data:") &&
          /awwwards\.com|assets\.awwwards/.test(s) &&
          !/avatar|thumb_user/.test(s),
      )
      .map((s) => absoluteUrl(pageUrl, s)),
    ...base.imageUrls,
  ]);

  return {
    ...base,
    id: slug,
    sourceId: SOURCE_ID,
    title: base.title.replace(/\s*[|—–-]\s*Awwwards.*$/i, "").trim(),
    url: `${ORIGIN}/sites/${slug}`,
    thumbnailUrl: imgs[0] || base.thumbnailUrl,
    imageUrls: imgs.slice(0, 12),
    tags: uniq([...base.tags, "awwwards", "website"]),
    category: "web",
    fetchedAt: nowIso(),
  };
}

export function awwwardsSearchUrls(query: string, categories: string[]): string[] {
  const urls: string[] = [];
  for (const cat of categories.slice(0, 2)) {
    urls.push(`${ORIGIN}/websites/${cat}/`);
  }
  const slug = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug) {
    urls.push(`${ORIGIN}/inspiration_search/${slug}/`);
  }
  return uniq(urls);
}

export function isAwwwardsUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "awwwards.com";
  } catch {
    return false;
  }
}

export { SOURCE_ID as AWWWARDS_SOURCE_ID };
