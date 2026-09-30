import type { InspoItem, InspoPage } from "../types/inspo.js";
import { nowIso } from "../lib/http.js";
import { extractGenericPage, uniq } from "./generic.js";

const SOURCE_ID = "mobbin";
const ORIGIN = "https://mobbin.com";

export const MOBBIN_SCREEN_PATTERNS = [
  "dashboard",
  "home",
  "charts",
  "settings-preferences",
  "welcome-get-started",
  "empty-state",
  "pricing",
  "subscription-paywall",
  "checkout",
  "browse-discover",
  "calendar",
  "search",
  "social-feed",
  "product-detail",
  "account-setup",
  "loading",
  "internal-tool",
  "billing",
  "multi-column-layout",
] as const;

interface ParsedScreen {
  id: string;
  screenUrl: string;
  name: string;
  description: string;
  appName?: string;
  platform: "mobile" | "web";
}

function unescapeRsc(html: string): string {
  // Mobbin embeds JSON in RSC payloads with \" escaping
  return html;
}

/**
 * Parse Mobbin explore / screen-pattern HTML for screen cards with
 * seoContentMetadata (name, description) + screenUrl thumbnails.
 */
export function parseMobbinBrowse(
  html: string,
  pageUrl: string,
  limit = 24,
  platform: "mobile" | "web" = "mobile",
): InspoItem[] {
  const fetchedAt = nowIso();
  const screens = extractScreens(html, platform);
  const items: InspoItem[] = [];
  const seen = new Set<string>();

  for (const s of screens) {
    if (items.length >= limit) break;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const title = s.appName ? `${s.appName} — ${s.name}` : s.name;
    const pattern =
      pageUrl.match(/\/screens\/([a-z0-9-]+)/)?.[1] || platform;
    items.push({
      id: s.id,
      sourceId: SOURCE_ID,
      title,
      url: `${ORIGIN}/explore/screens/${s.id}`,
      thumbnailUrl: s.screenUrl,
      imageUrls: [s.screenUrl],
      tags: uniq(["mobbin", platform, pattern, s.appName].filter(Boolean) as string[]),
      category: platform === "mobile" ? "mobile" : "web",
      description: s.description,
      author: s.appName,
      fetchedAt,
    });
  }

  return items;
}

function extractScreens(
  html: string,
  defaultPlatform: "mobile" | "web",
): ParsedScreen[] {
  const raw = unescapeRsc(html);
  const out: ParsedScreen[] = [];
  const seen = new Set<string>();

  // Primary: id + screenUrl + seoContentMetadata + nearby appName
  const re =
    /\\"id\\":\\"([a-f0-9-]+)\\",\\"screenUrl\\":\\"(https:[^\\]+)\\"[^\\]{0,400}?\\"seoContentMetadata\\":\{\\"name\\":\\"([^\\"]+)\\",\\"description\\":\\"([^\\"]*)\\"([\s\S]{0,900}?)(?=\\"id\\":\\"|$)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    const appName = m[5]?.match(/\\"appName\\":\\"([^\\"]+)\\"/)?.[1];
    const platform: "mobile" | "web" =
      /\\"platformType\\":\\"web\\"/.test(m[0]) || /\/explore\/web\//.test(html)
        ? "web"
        : defaultPlatform;
    seen.add(id);
    out.push({
      id,
      screenUrl: m[2]!,
      name: m[3]!,
      description: m[4]!,
      appName,
      platform,
    });
  }

  // Fallback: metadata without tight appName window
  if (out.length < 5) {
    const loose =
      /\\"id\\":\\"([a-f0-9-]+)\\",\\"screenUrl\\":\\"(https:[^\\]+)\\"/g;
    const metas = [
      ...raw.matchAll(
        /seoContentMetadata\\":\{\\"name\\":\\"([^\\"]+)\\",\\"description\\":\\"([^\\"]*)\\"/g,
      ),
    ];
    let i = 0;
    while ((m = loose.exec(raw)) && out.length < 40) {
      const id = m[1]!;
      if (seen.has(id)) continue;
      const meta = metas[i++];
      seen.add(id);
      out.push({
        id,
        screenUrl: m[2]!,
        name: meta?.[1] || `Mobbin screen ${id.slice(0, 8)}`,
        description: meta?.[2] || "",
        platform: defaultPlatform,
      });
    }
  }

  return out;
}

export function parseMobbinPage(html: string, pageUrl: string): InspoPage {
  const base = extractGenericPage(html, pageUrl, SOURCE_ID);
  const screens = extractScreens(html, /\/web\//.test(pageUrl) ? "web" : "mobile");
  const match =
    screens.find((s) => pageUrl.includes(s.id)) || screens[0];

  if (match) {
    return {
      ...base,
      id: match.id,
      sourceId: SOURCE_ID,
      title: match.appName ? `${match.appName} — ${match.name}` : match.name,
      url: `${ORIGIN}/explore/screens/${match.id}`,
      thumbnailUrl: match.screenUrl,
      imageUrls: uniq([match.screenUrl, ...base.imageUrls]),
      tags: uniq([
        ...base.tags,
        "mobbin",
        match.platform,
        match.appName,
      ].filter(Boolean) as string[]),
      description: match.description || base.description,
      author: match.appName || base.author,
      fetchedAt: nowIso(),
    };
  }

  // Harvest any app_screens URLs
  const imgs = uniq([
    ...[...html.matchAll(/https:\/\/[^"\\]+\/app_screens\/[a-f0-9-]+\.(?:png|jpg|webp)/g)].map(
      (x) => x[0]!,
    ),
    ...base.imageUrls,
  ]);

  return {
    ...base,
    sourceId: SOURCE_ID,
    thumbnailUrl: imgs[0] || base.thumbnailUrl,
    imageUrls: imgs.slice(0, 12),
    tags: uniq([...base.tags, "mobbin"]),
    fetchedAt: nowIso(),
  };
}

export function mobbinSearchUrls(patterns: string[], platform: "mobile" | "web" = "mobile"): string[] {
  const known = new Set<string>(MOBBIN_SCREEN_PATTERNS);
  const urls: string[] = [];
  for (const p of patterns.slice(0, 3)) {
    if (!known.has(p)) continue;
    urls.push(`${ORIGIN}/explore/${platform}/screens/${p}`);
  }
  if (!urls.length) {
    urls.push(`${ORIGIN}/explore/${platform}`);
  }
  // Also try the other platform for dashboard-like product UI
  if (platform === "mobile" && patterns.includes("dashboard")) {
    urls.push(`${ORIGIN}/explore/web/screens/dashboard`);
  }
  return uniq(urls);
}

export function isMobbinUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "mobbin.com";
  } catch {
    return false;
  }
}

export { SOURCE_ID as MOBBIN_SOURCE_ID };
