import sharp from "sharp";
import type { InspoItem } from "../types/inspo.js";
import { USER_AGENT } from "./http.js";

/** Default max number of images to embed as MCP ImageContent blocks. */
export const DEFAULT_EMBED_IMAGES_MAX = 4;

/** Default max width (px) after resize. */
export const DEFAULT_EMBED_MAX_WIDTH = 900;

/** Default JPEG quality for compressed embeds. */
export const DEFAULT_EMBED_JPEG_QUALITY = 72;

/** Skip embedding if compressed payload would still exceed this (bytes of raw image). */
export const DEFAULT_EMBED_MAX_BYTES = 450_000;

export interface EmbedImagesConfig {
  maxImages: number;
  maxWidth: number;
  jpegQuality: number;
  maxBytes: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export interface EmbeddedImage {
  /** Source image URL that was fetched. */
  sourceUrl: string;
  title: string;
  pageUrl: string;
  mimeType: string;
  /** Base64-encoded image bytes (no data: prefix). */
  data: string;
  width: number;
  height: number;
  bytesOriginal: number;
  bytesEmbedded: number;
}

export interface EmbedImagesResult {
  images: EmbeddedImage[];
  /** Image URLs that failed to fetch or process (e.g. Mobbin 404s). */
  skipped: Array<{ url: string; title: string; reason: string }>;
  notes: string[];
}

export function readEmbedConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbedImagesConfig {
  return {
    maxImages: clampInt(
      env.LOOKBOOK_EMBED_IMAGES_MAX,
      DEFAULT_EMBED_IMAGES_MAX,
      0,
      12,
    ),
    maxWidth: clampInt(
      env.LOOKBOOK_EMBED_MAX_WIDTH,
      DEFAULT_EMBED_MAX_WIDTH,
      200,
      1600,
    ),
    jpegQuality: clampInt(
      env.LOOKBOOK_EMBED_JPEG_QUALITY,
      DEFAULT_EMBED_JPEG_QUALITY,
      40,
      95,
    ),
    maxBytes: clampInt(
      env.LOOKBOOK_EMBED_MAX_BYTES,
      DEFAULT_EMBED_MAX_BYTES,
      50_000,
      2_000_000,
    ),
  };
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Pick the best candidate image URL for an inspo item (thumbnail first). */
export function pickImageUrl(item: Pick<InspoItem, "thumbnailUrl" | "imageUrls">): string | undefined {
  const candidates = [
    item.thumbnailUrl,
    ...(item.imageUrls || []),
  ].filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));

  // Prefer known-public CDNs over frequently-broken Mobbin supabase URLs
  const preferred = candidates.find((u) => isPreferredCdn(u));
  if (preferred) return preferred;
  return candidates[0];
}

export function isPreferredCdn(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("cdn.godly.design") ||
      host.includes("minimal.gallery") ||
      host.includes("cdn.cosmos.so") ||
      host.includes("framerusercontent.com") ||
      host.includes("awwwards.com") ||
      host.includes("sanity.io") ||
      host.includes("cloudinary.com") ||
      host.includes("imgix.net")
    );
  } catch {
    return false;
  }
}

/** Known-broken Mobbin supabase public bucket (returns 404 Bucket not found). */
export function isLikelyDeadMobbinThumb(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith("supabase.co") &&
      u.pathname.includes("/app_screens/")
    );
  } catch {
    return false;
  }
}

/**
 * Fetch + resize/compress a single image into MCP ImageContent-ready base64.
 * Returns null on any failure (never invents pixels).
 */
export async function fetchAndEmbedImage(
  url: string,
  options: {
    title?: string;
    pageUrl?: string;
    config?: Partial<EmbedImagesConfig>;
  } = {},
): Promise<EmbeddedImage | { error: string }> {
  const config: EmbedImagesConfig = {
    ...readEmbedConfig(),
    ...options.config,
  };
  const fetchImpl = config.fetchImpl || fetch;

  if (isLikelyDeadMobbinThumb(url)) {
    return {
      error:
        "Mobbin supabase app_screens URL is known-broken (bucket missing); skipped",
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Network error: ${msg}` };
  }

  if (!response.ok) {
    return { error: `HTTP ${response.status} fetching image` };
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
    return { error: `Not an image (content-type: ${contentType})` };
  }

  let input: Buffer;
  try {
    input = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Failed to read body: ${msg}` };
  }

  if (!input.length) {
    return { error: "Empty image body" };
  }

  try {
    const pipeline = sharp(input, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    const resized = pipeline.resize({
      width: config.maxWidth,
      withoutEnlargement: true,
      fit: "inside",
    });

    // Prefer JPEG for photos/screenshots (smaller); keep PNG/WebP when tiny already
    const preferJpeg =
      input.length > 80_000 ||
      meta.format === "jpeg" ||
      meta.format === "webp" ||
      meta.hasAlpha !== true;

    let out: Buffer;
    let mimeType: string;
    let width: number;
    let height: number;

    if (preferJpeg) {
      out = await resized
        .jpeg({ quality: config.jpegQuality, mozjpeg: true })
        .toBuffer();
      mimeType = "image/jpeg";
      const info = await sharp(out).metadata();
      width = info.width || meta.width || 0;
      height = info.height || meta.height || 0;
    } else {
      out = await resized.png({ compressionLevel: 8 }).toBuffer();
      mimeType = "image/png";
      const info = await sharp(out).metadata();
      width = info.width || meta.width || 0;
      height = info.height || meta.height || 0;
    }

    if (out.length > config.maxBytes) {
      // One more aggressive pass
      out = await sharp(out)
        .resize({
          width: Math.min(config.maxWidth, 720),
          withoutEnlargement: true,
          fit: "inside",
        })
        .jpeg({ quality: Math.min(config.jpegQuality, 60), mozjpeg: true })
        .toBuffer();
      mimeType = "image/jpeg";
      const info = await sharp(out).metadata();
      width = info.width || width;
      height = info.height || height;
    }

    if (out.length > config.maxBytes) {
      return {
        error: `Compressed image still too large (${out.length} > ${config.maxBytes} bytes)`,
      };
    }

    return {
      sourceUrl: url,
      title: options.title || "Inspiration",
      pageUrl: options.pageUrl || url,
      mimeType,
      data: out.toString("base64"),
      width,
      height,
      bytesOriginal: input.length,
      bytesEmbedded: out.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Image process failed: ${msg}` };
  }
}

/**
 * Embed images for the top curated picks (up to maxImages working thumbs).
 * Skips failed fetches; never invents pixels. Prefers public CDN URLs.
 */
export async function embedImagesForItems(
  items: InspoItem[],
  configOverrides: Partial<EmbedImagesConfig> = {},
): Promise<EmbedImagesResult> {
  const config: EmbedImagesConfig = {
    ...readEmbedConfig(),
    ...configOverrides,
  };

  const images: EmbeddedImage[] = [];
  const skipped: EmbedImagesResult["skipped"] = [];
  const notes: string[] = [];

  if (config.maxImages <= 0) {
    notes.push(
      "Image embedding disabled (LOOKBOOK_EMBED_IMAGES_MAX=0). Metadata URLs only.",
    );
    return { images, skipped, notes };
  }

  // Prefer items with working CDN thumbs first, then the rest in order
  const ranked = [...items].sort((a, b) => {
    const au = pickImageUrl(a);
    const bu = pickImageUrl(b);
    const ap = au && isPreferredCdn(au) ? 1 : 0;
    const bp = bu && isPreferredCdn(bu) ? 1 : 0;
    return bp - ap;
  });

  for (const item of ranked) {
    if (images.length >= config.maxImages) break;
    const url = pickImageUrl(item);
    if (!url) {
      skipped.push({
        url: item.url,
        title: item.title,
        reason: "No thumbnailUrl / imageUrls",
      });
      continue;
    }

    const result = await fetchAndEmbedImage(url, {
      title: item.title,
      pageUrl: item.url,
      config,
    });

    if ("error" in result) {
      skipped.push({ url, title: item.title, reason: result.error });
      continue;
    }
    images.push(result);
  }

  if (skipped.length) {
    const deadMobbin = skipped.filter((s) =>
      /mobbin|supabase|app_screens/i.test(s.url + s.reason),
    ).length;
    if (deadMobbin) {
      notes.push(
        `${deadMobbin} Mobbin/supabase thumbnail(s) skipped (dead or unreachable). Prefer Godly / Minimal Gallery / Cosmos CDN thumbs when showcasing.`,
      );
    }
    notes.push(
      `Embedded ${images.length}/${config.maxImages} image(s); skipped ${skipped.length} failed/missing thumb(s).`,
    );
  } else if (images.length) {
    notes.push(`Embedded ${images.length} image(s) as MCP ImageContent blocks.`);
  } else {
    notes.push("No embeddable thumbnails available for these picks.");
  }

  return { images, skipped, notes };
}

/**
 * Strip known-dead Mobbin supabase thumb URLs from item metadata so agents
 * do not cite 404 image links. Keeps page URLs and other fields intact.
 */
export function scrubDeadThumbUrls<T extends InspoItem>(item: T): T {
  const thumb = item.thumbnailUrl;
  const images = item.imageUrls || [];
  const scrubbedImages = images.filter((u) => !isLikelyDeadMobbinThumb(u));
  const scrubbedThumb =
    thumb && isLikelyDeadMobbinThumb(thumb) ? scrubbedImages[0] : thumb;

  if (scrubbedThumb === thumb && scrubbedImages.length === images.length) {
    return item;
  }

  return {
    ...item,
    thumbnailUrl: scrubbedThumb,
    imageUrls: scrubbedImages,
  };
}

export function scrubItems<T extends InspoItem>(items: T[]): T[] {
  return items.map(scrubDeadThumbUrls);
}
