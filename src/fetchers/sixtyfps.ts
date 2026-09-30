import type { InspoItem, InspoPage } from "../types/inspo.js";
import { fetchHtml, nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "60fps";
const ORIGIN = "https://60fps.design";
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;

let sitemapCache: { fetchedAt: number; urls: string[] } | null = null;
const SITEMAP_TTL_MS = 60 * 60 * 1000;

function titleFromShotUrl(url: string): string {
  const slug =
    url.match(/\/shots\/(?:filter\/)?([^/]+)\/?$/)?.[1] ||
    url.match(/\/apps\/([^/]+)\/?$/)?.[1] ||
    "60fps";
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function loadSixtyfpsSitemap(force = false): Promise<string[]> {
  if (
    !force &&
    sitemapCache &&
    Date.now() - sitemapCache.fetchedAt < SITEMAP_TTL_MS
  ) {
    return sitemapCache.urls;
  }
  const { html } = await fetchHtml(SITEMAP_URL, { ttlMs: SITEMAP_TTL_MS });
  const urls = [...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  sitemapCache = { fetchedAt: Date.now(), urls };
  return urls;
}

/** Pure helper for tests — score sitemap URLs against query hints. */
export function filterSixtyfpsUrls(
  urls: string[],
  options: {
    query?: string;
    hints?: string[];
    limit?: number;
  } = {},
): string[] {
  const limit = options.limit ?? 24;
  const hints = (options.hints || []).map((h) => h.toLowerCase());
  const terms = (options.query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  const shots = urls.filter(
    (u) => u.includes("/shots/") && !u.endsWith("/shots/"),
  );

  const scored = shots.map((url) => {
    const path = url.toLowerCase();
    let score = 0;
    for (const h of hints) {
      if (path.includes(`/shots/filter/${h}`)) score += 12;
      if (path.includes(h)) score += 6;
    }
    for (const t of terms) {
      if (path.includes(t)) score += 5;
    }
    // Prefer concrete shots over filter index pages slightly for variety,
    // but keep filter pages when they strongly match.
    if (path.includes("/shots/filter/")) score += 1;
    else score += 2;
    return { url, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const positive = scored.filter((s) => s.score > 0);
  const pool = positive.length ? positive : scored;
  return pool.slice(0, limit).map((s) => s.url);
}

export function parseSixtyfpsBrowseFromUrls(
  urls: string[],
  limit = 24,
  tags: string[] = [],
): InspoItem[] {
  const fetchedAt = nowIso();
  return urls.slice(0, limit).map((url) => {
    const isFilter = url.includes("/shots/filter/");
    const id =
      url.match(/\/shots\/(?:filter\/)?([^/]+)\/?$/)?.[1] ||
      url.match(/\/apps\/([^/]+)/)?.[1] ||
      Buffer.from(url).toString("base64url").slice(0, 16);
    return {
      id,
      sourceId: SOURCE_ID,
      title: titleFromShotUrl(url),
      url,
      thumbnailUrl: undefined,
      imageUrls: [],
      tags: uniq([
        "60fps",
        "motion",
        isFilter ? "filter" : "shot",
        ...tags,
        id,
      ]),
      category: "web",
      description: isFilter
        ? `60fps filter gallery for ${id} interactions`
        : `UI/UX motion shot: ${titleFromShotUrl(url)}`,
      fetchedAt,
    };
  });
}

/**
 * Browse 60fps via sitemap (Framer homepage is client-rendered).
 */
export async function browseSixtyfps(options: {
  query?: string;
  hints?: string[];
  limit?: number;
}): Promise<InspoItem[]> {
  const urls = await loadSixtyfpsSitemap();
  const matched = filterSixtyfpsUrls(urls, {
    query: options.query,
    hints: options.hints,
    limit: (options.limit ?? 20) * 2,
  });
  return parseSixtyfpsBrowseFromUrls(
    matched,
    options.limit ?? 20,
    options.hints || [],
  );
}

export function parseSixtyfpsPage(html: string, pageUrl: string): InspoPage {
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);
  const id =
    pageUrl.match(/\/shots\/(?:filter\/)?([^/]+)\/?$/)?.[1] || base.id;
  const imgs = uniq([
    ...[...html.matchAll(/https:\/\/framerusercontent\.com\/[^"\s]+\.(?:png|jpg|jpeg|webp|gif)/g)].map(
      (m) => m[0]!,
    ),
    ...base.imageUrls,
  ]).slice(0, 12);

  return {
    ...base,
    id,
    sourceId: SOURCE_ID,
    title: base.title.replace(/\s*[|—–-]\s*60fps.*$/i, "").trim(),
    url: pageUrl,
    thumbnailUrl: imgs[0] || base.thumbnailUrl,
    imageUrls: imgs,
    tags: uniq([
      ...base.tags,
      "60fps",
      "motion",
      pageUrl.includes("/filter/") ? "filter" : "shot",
    ]),
    category: "web",
    fetchedAt: nowIso(),
  };
}

export function isSixtyfpsUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "60fps.design";
  } catch {
    return false;
  }
}

export { SOURCE_ID as SIXTYFPS_SOURCE_ID };
