import * as cheerio from "cheerio";
import type { InspoItem, InspoPage } from "../types/inspo.js";
import { absoluteUrl, nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "godly";
const ORIGIN = "https://godly.design";

function slugFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/website\/([a-z0-9-]+)\/?/i);
    return m?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Parse Godly gallery / websites listing HTML into InspoItem previews.
 * Works against godly.design homepage and /websites.
 */
export function parseGodlyBrowse(html: string, pageUrl = ORIGIN, limit = 24): InspoItem[] {
  const $ = cheerio.load(html);
  const items: InspoItem[] = [];
  const seen = new Set<string>();
  const fetchedAt = nowIso();

  $('a[href*="/website/"]').each((_, el) => {
    if (items.length >= limit) return false;
    const href = $(el).attr("href");
    if (!href) return;
    const abs = absoluteUrl(pageUrl, href.split("#")[0]!);
    const slug = slugFromUrl(abs);
    if (!slug || seen.has(slug)) return;

    const root = $(el);
    const img =
      root.find("img").first().attr("src") ||
      root.parent().find("img").first().attr("src");
    const title =
      (root.find("img").first().attr("alt") ||
        root.find("h1,h2,h3,h4").first().text().trim() ||
        slug)
        .replace(/\s+screenshot$/i, "")
        .replace(/\s+/g, " ")
        .trim();

    // Prefer thumbnail CDN when present
    const thumbnailUrl =
      img ||
      `https://cdn.godly.design/sites/${slug}/thumbnail.png`;

    seen.add(slug);
    items.push({
      id: slug,
      sourceId: SOURCE_ID,
      title: title || slug,
      url: `${ORIGIN}/website/${slug}`,
      thumbnailUrl,
      imageUrls: uniq([thumbnailUrl]),
      tags: ["website"],
      category: "web",
      fetchedAt,
    });
  });

  return items.slice(0, limit);
}

/**
 * Parse a Godly website detail page into a full InspoPage.
 */
export function parseGodlyPage(html: string, pageUrl: string): InspoPage {
  const $ = cheerio.load(html);
  const slug = slugFromUrl(pageUrl) || "unknown";
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);

  const cdnImages = uniq(
    $('img')
      .map((_, el) => $(el).attr("src"))
      .get()
      .filter((s): s is string => !!s && s.includes("cdn.godly.design")),
  );

  // Also harvest known CDN asset paths mentioned in markup
  const fromHtml = uniq(
    [...html.matchAll(/https:\/\/cdn\.godly\.design\/sites\/[^"'\\\s]+/g)].map(
      (m) => m[0]!,
    ),
  );

  const imageUrls = uniq([
    ...cdnImages,
    ...fromHtml,
    ...base.imageUrls,
    `https://cdn.godly.design/sites/${slug}/thumbnail.png`,
    `https://cdn.godly.design/sites/${slug}/og-image.png`,
  ]).filter((u) => !u.endsWith(".svg"));

  const external =
    $('a[href^="http"]')
      .map((_, el) => $(el).attr("href"))
      .get()
      .find(
        (h) =>
          h &&
          !/godly\.(design|website)/i.test(h) &&
          !/cdn\.godly/i.test(h) &&
          !/twitter\.com|x\.com|github\.com/i.test(h),
      );

  const title =
    base.title.replace(/\s*[—|–-]\s*Godly\s*$/i, "").trim() || slug;

  return {
    ...base,
    id: slug,
    sourceId: SOURCE_ID,
    title,
    url: `${ORIGIN}/website/${slug}`,
    thumbnailUrl:
      imageUrls.find((u) => /thumbnail|og-image|hero-desktop/i.test(u)) ||
      imageUrls[0],
    imageUrls,
    tags: uniq([...base.tags, "website", "godly"]),
    category: "web",
    description: base.description,
    rawExcerpt: [
      base.description,
      external ? `Live site: ${external}` : undefined,
      base.rawExcerpt,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 800),
    fetchedAt: nowIso(),
  };
}

export function isGodlyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "godly.design" || host === "godly.website";
  } catch {
    return false;
  }
}

export { SOURCE_ID as GODLY_SOURCE_ID, ORIGIN as GODLY_ORIGIN };
