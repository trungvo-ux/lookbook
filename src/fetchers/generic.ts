import * as cheerio from "cheerio";
import type { InspoItem, InspoPage } from "../types/inspo.js";
import { absoluteUrl, nowIso } from "../lib/http.js";

function uniq(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function meta($: cheerio.CheerioAPI, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const byProp = $(`meta[property="${key}"]`).attr("content");
    if (byProp) return byProp.trim();
    const byName = $(`meta[name="${key}"]`).attr("content");
    if (byName) return byName.trim();
  }
  return undefined;
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed && typeof parsed === "object") out.push(parsed);
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return out;
}

function textExcerpt($: cheerio.CheerioAPI, max = 600): string | undefined {
  $("script,style,noscript,nav,footer,header").remove();
  const text = $("main, article, .content, .entry-content, body")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function collectImages(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  limit = 12,
): string[] {
  const imgs: string[] = [];
  const push = (src?: string) => {
    if (!src) return;
    if (src.startsWith("data:")) return;
    const abs = absoluteUrl(pageUrl, src);
    if (/\.(svg)(\?|$)/i.test(abs) && !/og|poster|thumb|hero/i.test(abs)) return;
    imgs.push(abs);
  };

  push(meta($, "og:image", "og:image:url", "twitter:image", "twitter:image:src"));

  $("img").each((_, el) => {
    if (imgs.length >= limit) return false;
    push($(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src"));
  });

  return uniq(imgs).slice(0, limit);
}

function idFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return Buffer.from(`${u.hostname}${path}`).toString("base64url").slice(0, 24);
  } catch {
    return Buffer.from(url).toString("base64url").slice(0, 24);
  }
}

export function extractGenericPage(
  html: string,
  pageUrl: string,
  sourceId: string,
): InspoPage {
  const $ = cheerio.load(html);
  const ld = parseJsonLd($);
  const primary =
    ld.find((x) => {
      const t = x["@type"];
      return t === "WebPage" || t === "Article" || t === "CreativeWork" || t === "ImageObject";
    }) || ld[0];

  const title =
    meta($, "og:title", "twitter:title") ||
    (typeof primary?.name === "string" ? primary.name : undefined) ||
    (typeof primary?.headline === "string" ? primary.headline : undefined) ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    pageUrl;

  const description =
    meta($, "og:description", "twitter:description", "description") ||
    (typeof primary?.description === "string" ? primary.description : undefined);

  const author =
    meta($, "author", "article:author") ||
    (typeof (primary?.author as { name?: string } | undefined)?.name === "string"
      ? (primary!.author as { name: string }).name
      : undefined);

  const imageUrls = collectImages($, pageUrl);
  const thumbnailUrl = imageUrls[0];
  const tags = uniq([
    ...$('meta[property="article:tag"]').map((_, el) => $(el).attr("content")).get(),
    ...$('a[rel="tag"], .tag, .tags a')
      .map((_, el) => $(el).text())
      .get()
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && t.length < 40),
  ]).slice(0, 20);

  return {
    id: idFromUrl(pageUrl),
    sourceId,
    title: title.replace(/\s+/g, " ").trim(),
    url: meta($, "og:url") || pageUrl,
    thumbnailUrl,
    imageUrls,
    tags,
    description,
    author,
    publishedAt: meta($, "article:published_time"),
    rawExcerpt: textExcerpt($),
    fetchedAt: nowIso(),
  };
}

/**
 * Best-effort gallery card extraction for generic sources:
 * OG-linked cards, article teasers, and common gallery anchors.
 */
export function extractGenericBrowse(
  html: string,
  pageUrl: string,
  sourceId: string,
  limit = 20,
): InspoItem[] {
  const $ = cheerio.load(html);
  const items: InspoItem[] = [];
  const seen = new Set<string>();
  const fetchedAt = nowIso();

  const pushItem = (partial: Partial<InspoItem> & { url: string; title: string }) => {
    const abs = absoluteUrl(pageUrl, partial.url);
    if (seen.has(abs)) return;
    // skip pure nav / utility links
    if (/\/(login|signup|pricing|about|contact|privacy|terms)\/?$/i.test(abs)) return;
    seen.add(abs);
    items.push({
      id: idFromUrl(abs),
      sourceId,
      title: partial.title.replace(/\s+/g, " ").trim() || abs,
      url: abs,
      thumbnailUrl: partial.thumbnailUrl
        ? absoluteUrl(pageUrl, partial.thumbnailUrl)
        : undefined,
      imageUrls: partial.thumbnailUrl
        ? [absoluteUrl(pageUrl, partial.thumbnailUrl)]
        : [],
      tags: partial.tags || [],
      description: partial.description,
      author: partial.author,
      fetchedAt,
    });
  };

  // Prefer structured cards with images
  $("article, .card, .post, .item, .project, li").each((_, el) => {
    if (items.length >= limit) return false;
    const root = $(el);
    const link =
      root.find("a[href]").filter((_, a) => {
        const href = $(a).attr("href") || "";
        return href.startsWith("http") || href.startsWith("/");
      }).first();
    const href = link.attr("href");
    if (!href) return;
    const img =
      root.find("img").first().attr("src") ||
      root.find("img").first().attr("data-src");
    const title =
      root.find("h1,h2,h3,h4,.title").first().text().trim() ||
      link.attr("aria-label") ||
      root.find("img").first().attr("alt") ||
      link.text().trim();
    if (!title || title.length < 2) return;
    pushItem({ url: href, title, thumbnailUrl: img });
  });

  if (items.length < Math.min(5, limit)) {
    $("a[href]").each((_, el) => {
      if (items.length >= limit) return false;
      const a = $(el);
      const href = a.attr("href");
      if (!href) return;
      const img = a.find("img").first();
      const src = img.attr("src") || img.attr("data-src");
      if (!src) return;
      const title = img.attr("alt") || a.attr("aria-label") || a.text().trim();
      if (!title) return;
      pushItem({ url: href, title, thumbnailUrl: src });
    });
  }

  return items.slice(0, limit);
}

export { uniq, meta, parseJsonLd, idFromUrl };
