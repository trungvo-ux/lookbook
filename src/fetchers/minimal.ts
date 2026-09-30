import * as cheerio from "cheerio";
import type { InspoItem, InspoPage } from "../types/inspo.js";
import { absoluteUrl, nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "minimal-gallery";
const ORIGIN = "https://minimal.gallery";

function slugFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!/minimal\.gallery$/i.test(u.hostname.replace(/^www\./, ""))) return undefined;
    const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length !== 1) return undefined;
    const slug = parts[0]!;
    if (
      [
        "websites",
        "templates",
        "tools",
        "about",
        "submit",
        "bookmarks",
        "tag",
        "page",
        "feed",
        "subscribe",
        "sponsor",
        "legal",
        "contact",
        "privacy",
        "terms",
        "login",
        "signup",
        "search",
      ].includes(slug)
    ) {
      return undefined;
    }
    return slug;
  } catch {
    return undefined;
  }
}

/**
 * Parse Minimal Gallery homepage / search / websites listing.
 */
export function parseMinimalBrowse(
  html: string,
  pageUrl = ORIGIN,
  limit = 24,
): InspoItem[] {
  const $ = cheerio.load(html);
  const items: InspoItem[] = [];
  const seen = new Set<string>();
  const fetchedAt = nowIso();

  $(".post.website, .post, article").each((_, el) => {
    if (items.length >= limit) return false;
    const root = $(el);
    const detailLink = root
      .find('a[href*="minimal.gallery/"]')
      .filter((_, a) => {
        const href = $(a).attr("href") || "";
        return !!slugFromUrl(absoluteUrl(pageUrl, href));
      })
      .first();

    const href = detailLink.attr("href");
    if (!href) return;
    const abs = absoluteUrl(pageUrl, href);
    const slug = slugFromUrl(abs);
    if (!slug || seen.has(slug)) return;

    const img =
      root.find("img").first().attr("src") ||
      root.find("img").first().attr("data-src");
    const title =
      detailLink.attr("aria-label")?.replace(/^View details for\s+/i, "") ||
      root.find("img").first().attr("alt")?.replace(/\s+website$/i, "") ||
      slug.replace(/-/g, " ");

    const live = root
      .find('a.site-button, a[href*="?ref=minimal.gallery"]')
      .first()
      .attr("href");

    seen.add(slug);
    items.push({
      id: slug,
      sourceId: SOURCE_ID,
      title: title.replace(/\s+/g, " ").trim(),
      url: `${ORIGIN}/${slug}/`,
      thumbnailUrl: img ? absoluteUrl(pageUrl, img) : undefined,
      imageUrls: img ? [absoluteUrl(pageUrl, img)] : [],
      tags: ["website", "minimal"],
      category: "web",
      description: live
        ? `Featured site: ${live.replace(/\?ref=minimal\.gallery.*$/, "")}`
        : undefined,
      fetchedAt,
    });
  });

  // Fallback: any detail anchors with images
  if (items.length === 0) {
    $('a[href*="minimal.gallery/"]').each((_, el) => {
      if (items.length >= limit) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const abs = absoluteUrl(pageUrl, href);
      const slug = slugFromUrl(abs);
      if (!slug || seen.has(slug)) return;
      const img = $(el).find("img").first();
      const src = img.attr("src");
      const title =
        $(el).attr("aria-label")?.replace(/^View details for\s+/i, "") ||
        img.attr("alt") ||
        slug;
      seen.add(slug);
      items.push({
        id: slug,
        sourceId: SOURCE_ID,
        title: title.replace(/\s+/g, " ").trim(),
        url: `${ORIGIN}/${slug}/`,
        thumbnailUrl: src ? absoluteUrl(pageUrl, src) : undefined,
        imageUrls: src ? [absoluteUrl(pageUrl, src)] : [],
        tags: ["website"],
        fetchedAt,
      });
    });
  }

  return items.slice(0, limit);
}

/**
 * Parse a Minimal Gallery website detail page.
 */
export function parseMinimalPage(html: string, pageUrl: string): InspoPage {
  const $ = cheerio.load(html);
  const slug = slugFromUrl(pageUrl) || "unknown";
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);

  const tags = uniq([
    ...base.tags,
    ...$('a[href*="/tag/"]')
      .map((_, el) => {
        const href = $(el).attr("href") || "";
        const m = href.match(/\/tag\/([^/]+)/);
        return m?.[1]?.replace(/-/g, " ") || $(el).text().trim();
      })
      .get()
      .filter((t) => t && t.length < 40),
  ]).slice(0, 24);

  const live = $('a[href*="?ref=minimal.gallery"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .find((h) => h && !/minimal\.gallery/i.test(new URL(h, ORIGIN).hostname));

  const imageUrls = uniq([
    ...$("img")
      .map((_, el) => $(el).attr("src"))
      .get()
      .filter(
        (s): s is string =>
          !!s &&
          (/uploads\//.test(s) || /delivery\.rocketcdn/.test(s)) &&
          !/themes\//.test(s),
      )
      .map((s) => absoluteUrl(pageUrl, s)),
    ...base.imageUrls,
  ]).slice(0, 16);

  const title =
    base.title
      .replace(/\s+on Minimal Gallery\s*$/i, "")
      .replace(/\s*[—|–-]\s*Minimal Gallery\s*$/i, "")
      .trim() || slug;

  return {
    ...base,
    id: slug,
    sourceId: SOURCE_ID,
    title,
    url: `${ORIGIN}/${slug}/`,
    thumbnailUrl: imageUrls[0] || base.thumbnailUrl,
    imageUrls,
    tags: uniq([...tags, "minimal", "website"]),
    category: "web",
    description: base.description,
    rawExcerpt: [
      base.description,
      live ? `Live site: ${live.replace(/\?ref=minimal\.gallery.*$/, "")}` : undefined,
      base.rawExcerpt,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 800),
    fetchedAt: nowIso(),
  };
}

export function isMinimalUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "minimal.gallery";
  } catch {
    return false;
  }
}

export { SOURCE_ID as MINIMAL_SOURCE_ID };
