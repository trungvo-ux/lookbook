import * as cheerio from "cheerio";
import type { InspoItem, InspoPage } from "../types/inspo.js";
import { nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "cosmos";
const ORIGIN = "https://www.cosmos.so";

interface CosmosTile {
  id: number | string;
  shareUrl?: string;
  generatedCaption?: { text?: string };
  source?: {
    url?: string;
    author?: { username?: string; fullName?: string };
  };
  multipleMedia?: Array<{ url?: string }>;
  url?: string;
  coverImageUrl?: string;
}

/**
 * Extract MediaElementTile-like objects and collection covers from Cosmos HTML
 * (RSC payloads embed JSON with shareUrl + cdn.cosmos.so images).
 */
export function parseCosmosBrowse(
  html: string,
  pageUrl = `${ORIGIN}/explore`,
  limit = 24,
): InspoItem[] {
  const items: InspoItem[] = [];
  const seen = new Set<string>();
  const fetchedAt = nowIso();

  const push = (partial: {
    id: string;
    title: string;
    url: string;
    thumbnailUrl?: string;
    description?: string;
    author?: string;
    tags?: string[];
  }) => {
    if (seen.has(partial.id) || items.length >= limit) return;
    seen.add(partial.id);
    items.push({
      id: partial.id,
      sourceId: SOURCE_ID,
      title: partial.title,
      url: partial.url,
      thumbnailUrl: partial.thumbnailUrl,
      imageUrls: partial.thumbnailUrl ? [partial.thumbnailUrl] : [],
      tags: partial.tags || ["cosmos"],
      category: "moodboard",
      description: partial.description,
      author: partial.author,
      fetchedAt,
    });
  };

  // MediaElementTile blocks
  const tileRe =
    /"__typename":"MediaElementTile","id":(\d+)[\s\S]*?"shareUrl":"(https:\/\/www\.cosmos\.so\/e\/\d+)"([\s\S]*?)(?="__typename":"MediaElementTile"|"__typename":"Collection"|$)/g;
  let m: RegExpExecArray | null;
  while ((m = tileRe.exec(html)) && items.length < limit) {
    const id = m[1]!;
    const shareUrl = m[2]!;
    const body = m[3] || "";
    const caption =
      body.match(/"generatedCaption":\{"text":"([^"]*)"/)?.[1] || "";
    const author =
      body.match(/"author":\{"username":"([^"]+)"/)?.[1] ||
      body.match(/"username":"([^"]+)"/)?.[1];
    const img =
      body.match(/"url":"(https:\/\/cdn\.cosmos\.so\/[a-f0-9-]+)"/)?.[1] ||
      body.match(/(https:\/\/cdn\.cosmos\.so\/[a-f0-9-]+)/)?.[1];
    const sourceUrl = body.match(/"source":\{"url":"([^"]+)"/)?.[1];
    push({
      id,
      title: caption || (author ? `Element by @${author}` : `Cosmos element ${id}`),
      url: shareUrl,
      thumbnailUrl: img,
      description: sourceUrl ? `Source: ${sourceUrl}` : undefined,
      author: author ? `@${author}` : undefined,
      tags: ["cosmos", "element"],
    });
  }

  // Collection cards with coverImageUrl
  if (items.length < limit) {
    const colRe =
      /\{"id":(\d+),"name":"([^"]+)","slug":"([^"]+)"[\s\S]*?"coverImageUrl":"(https:\/\/cdn\.cosmos\.so\/[^"]+)"/g;
    while ((m = colRe.exec(html)) && items.length < limit) {
      const [, id, name, slug, cover] = m;
      push({
        id: `collection-${id}`,
        title: name!,
        url: `${ORIGIN}/explore?q=${encodeURIComponent(name!)}`,
        thumbnailUrl: cover,
        tags: ["cosmos", "collection", slug!],
        description: `Collection slug: ${slug}`,
      });
    }
  }

  // Fallback: pair /e/{id} with nearby cdn urls
  if (items.length < Math.min(8, limit)) {
    const pairs = [
      ...html.matchAll(
        /\{"id":(\d+)[\s\S]{0,400}?cdn\.cosmos\.so\/([a-f0-9-]{36})/g,
      ),
    ];
    for (const p of pairs) {
      if (items.length >= limit) break;
      const id = p[1]!;
      const uuid = p[2]!;
      push({
        id,
        title: `Cosmos element ${id}`,
        url: `${ORIGIN}/e/${id}`,
        thumbnailUrl: `https://cdn.cosmos.so/${uuid}`,
        tags: ["cosmos", "element"],
      });
    }
  }

  // Last resort: unique /e/ links
  if (items.length === 0) {
    const ids = uniq(
      [...html.matchAll(/\/e\/(\d+)/g)].map((x) => x[1]!),
    );
    for (const id of ids.slice(0, limit)) {
      push({
        id,
        title: `Cosmos element ${id}`,
        url: `${ORIGIN}/e/${id}`,
        tags: ["cosmos"],
      });
    }
  }

  void pageUrl;
  return items.slice(0, limit);
}

export function parseCosmosPage(html: string, pageUrl: string): InspoPage {
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);
  const $ = cheerio.load(html);

  const idMatch = pageUrl.match(/\/e\/(\d+)/);
  const id = idMatch?.[1] || base.id;

  const cdn = uniq([
    ...[...html.matchAll(/https:\/\/cdn\.cosmos\.so\/[a-f0-9-]+/g)].map(
      (m) => m[0]!,
    ),
    ...base.imageUrls,
  ]);

  // Author from description like "The author is endlessarchclub."
  const authorFromDesc =
    base.description?.match(/author is ([a-zA-Z0-9._-]+)/i)?.[1] ||
    base.rawExcerpt?.match(/author is ([a-zA-Z0-9._-]+)/i)?.[1];

  const title =
    base.title === "Open" || base.title === "Found on Cosmos"
      ? authorFromDesc
        ? `Cosmos element by @${authorFromDesc}`
        : `Cosmos element ${id}`
      : base.title;

  return {
    ...base,
    id,
    sourceId: SOURCE_ID,
    title,
    url: idMatch ? `${ORIGIN}/e/${id}` : pageUrl,
    thumbnailUrl: cdn[0] || base.thumbnailUrl,
    imageUrls: cdn.slice(0, 12),
    tags: uniq([...base.tags, "cosmos", "moodboard"]),
    category: "moodboard",
    author: authorFromDesc ? `@${authorFromDesc}` : base.author,
    fetchedAt: nowIso(),
  };
}

export function isCosmosUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "cosmos.so";
  } catch {
    return false;
  }
}

export type { CosmosTile };
export { SOURCE_ID as COSMOS_SOURCE_ID };
