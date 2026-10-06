import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { InspoItem } from "../src/types/inspo.js";
import {
  embedImagesForItems,
  fetchAndEmbedImage,
  isLikelyDeadMobbinThumb,
  isPreferredCdn,
  pickImageUrl,
  readEmbedConfig,
  scrubDeadThumbUrls,
} from "../src/lib/embed-images.js";
import {
  SHOWCASE_INSTRUCTION,
  buildVisualToolResult,
  visualResultForItems,
} from "../src/lib/tool-result.js";

async function tinyPng(width = 120, height = 80): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

function item(partial: Partial<InspoItem> & Pick<InspoItem, "id" | "title" | "url">): InspoItem {
  return {
    sourceId: "godly",
    imageUrls: [],
    tags: [],
    fetchedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("embed-images helpers", () => {
  it("readEmbedConfig defaults and clamps LOOKBOOK_EMBED_IMAGES_MAX", () => {
    expect(readEmbedConfig({}).maxImages).toBe(4);
    expect(readEmbedConfig({ LOOKBOOK_EMBED_IMAGES_MAX: "6" }).maxImages).toBe(6);
    expect(readEmbedConfig({ LOOKBOOK_EMBED_IMAGES_MAX: "0" }).maxImages).toBe(0);
    expect(readEmbedConfig({ LOOKBOOK_EMBED_IMAGES_MAX: "99" }).maxImages).toBe(12);
  });

  it("detects preferred CDNs and dead Mobbin thumbs", () => {
    expect(isPreferredCdn("https://cdn.godly.design/sites/x/thumbnail.png")).toBe(true);
    expect(isPreferredCdn("https://minimal.gallery/wp-content/uploads/x.jpg")).toBe(true);
    expect(
      isLikelyDeadMobbinThumb(
        "https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/abc.png",
      ),
    ).toBe(true);
    expect(isLikelyDeadMobbinThumb("https://cdn.godly.design/sites/x/thumbnail.png")).toBe(
      false,
    );
  });

  it("pickImageUrl prefers thumbnail then CDN", () => {
    const chosen = pickImageUrl({
      thumbnailUrl:
        "https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/a.png",
      imageUrls: ["https://cdn.godly.design/sites/x/thumbnail.png"],
    });
    expect(chosen).toBe("https://cdn.godly.design/sites/x/thumbnail.png");
  });

  it("scrubDeadThumbUrls removes broken Mobbin supabase URLs", () => {
    const scrubbed = scrubDeadThumbUrls(
      item({
        id: "1",
        title: "Mobbin screen",
        url: "https://mobbin.com/explore/screens/1",
        sourceId: "mobbin",
        thumbnailUrl:
          "https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/a.png",
        imageUrls: [
          "https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/a.png",
          "https://cdn.godly.design/sites/x/thumbnail.png",
        ],
      }),
    );
    expect(scrubbed.thumbnailUrl).toBe("https://cdn.godly.design/sites/x/thumbnail.png");
    expect(scrubbed.imageUrls).toEqual([
      "https://cdn.godly.design/sites/x/thumbnail.png",
    ]);
  });
});

describe("fetchAndEmbedImage", () => {
  it("returns base64 image/jpeg for a successful fetch", async () => {
    const png = await tinyPng(400, 300);
    const fetchImpl = vi.fn(async () => {
      return new Response(png, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const result = await fetchAndEmbedImage("https://cdn.godly.design/sites/x/thumbnail.png", {
      title: "Example",
      pageUrl: "https://godly.design/website/x",
      config: { fetchImpl, maxWidth: 200, jpegQuality: 70, maxBytes: 450_000, maxImages: 4 },
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.data.length).toBeGreaterThan(40);
    expect(result.width).toBeLessThanOrEqual(200);
    expect(Buffer.from(result.data, "base64").length).toBe(result.bytesEmbedded);
  });

  it("skips known-dead Mobbin thumbs without fetching", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await fetchAndEmbedImage(
      "https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/a.png",
      { config: { fetchImpl, maxImages: 4, maxWidth: 900, jpegQuality: 72, maxBytes: 450_000 } },
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/known-broken/i) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns error on HTTP 404 without inventing pixels", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await fetchAndEmbedImage("https://example.com/missing.png", {
      config: { fetchImpl, maxImages: 4, maxWidth: 900, jpegQuality: 72, maxBytes: 450_000 },
    });
    expect(result).toMatchObject({ error: expect.stringMatching(/HTTP 404/) });
  });
});

describe("embedImagesForItems + visual tool results", () => {
  it("embeds top working thumbs and skips failures", async () => {
    const png = await tinyPng(160, 100);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fail")) {
        return new Response("gone", { status: 404 });
      }
      return new Response(png, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const items = [
      item({
        id: "dead",
        title: "Dead Mobbin",
        url: "https://mobbin.com/explore/screens/dead",
        sourceId: "mobbin",
        thumbnailUrl:
          "https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/dead.png",
      }),
      item({
        id: "fail",
        title: "Failing CDN",
        url: "https://example.com/fail",
        thumbnailUrl: "https://example.com/fail.png",
      }),
      item({
        id: "ok1",
        title: "Godly One",
        url: "https://godly.design/website/one",
        thumbnailUrl: "https://cdn.godly.design/sites/one/thumbnail.png",
      }),
      item({
        id: "ok2",
        title: "Godly Two",
        url: "https://godly.design/website/two",
        thumbnailUrl: "https://cdn.godly.design/sites/two/thumbnail.png",
      }),
    ];

    const embed = await embedImagesForItems(items, {
      maxImages: 4,
      fetchImpl,
      maxWidth: 200,
      jpegQuality: 65,
      maxBytes: 450_000,
    });

    expect(embed.images.length).toBe(2);
    expect(embed.images.map((i) => i.title)).toEqual(["Godly One", "Godly Two"]);
    expect(embed.skipped.length).toBeGreaterThanOrEqual(2);
    expect(embed.notes.some((n) => /Mobbin|Embedded/i.test(n))).toBe(true);

    const tool = buildVisualToolResult({ items: embed.images.map((i) => i.title) }, embed);
    expect(tool.content.length).toBeGreaterThanOrEqual(2 + embed.images.length * 2);

    const types = tool.content.map((c) => c.type);
    expect(types.filter((t) => t === "image").length).toBe(2);
    expect(types.filter((t) => t === "text").length).toBeGreaterThanOrEqual(3);

    const firstText = tool.content.find((c) => c.type === "text");
    expect(firstText && firstText.type === "text" && firstText.text).toContain(
      "MUST display each returned image INLINE",
    );
    expect(SHOWCASE_INSTRUCTION).toMatch(/INLINE/);

    for (const part of tool.content) {
      if (part.type === "image") {
        expect(part.mimeType).toMatch(/^image\//);
        expect(part.data.length).toBeGreaterThan(40);
        expect(part.annotations?.priority).toBe(1);
      }
    }
  });

  it("visualResultForItems returns content array with image parts when thumbnails work", async () => {
    const png = await tinyPng(100, 60);
    const fetchImpl = vi.fn(async () => {
      return new Response(png, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const items = [
      item({
        id: "a",
        title: "Alpha",
        url: "https://godly.design/website/alpha",
        thumbnailUrl: "https://cdn.godly.design/sites/alpha/thumbnail.png",
      }),
      item({
        id: "b",
        title: "Beta",
        url: "https://godly.design/website/beta",
        thumbnailUrl: "https://cdn.godly.design/sites/beta/thumbnail.png",
      }),
    ];

    const result = await visualResultForItems(
      items,
      (scrubbed) => ({ count: scrubbed.length, items: scrubbed }),
      {
        embedConfig: {
          maxImages: 4,
          fetchImpl,
          maxWidth: 180,
          jpegQuality: 70,
          maxBytes: 450_000,
        },
      },
    );

    const imageParts = result.content.filter((c) => c.type === "image");
    expect(imageParts.length).toBe(2);

    const jsonPart = result.content.find(
      (c) => c.type === "text" && c.text.includes('"count"'),
    );
    expect(jsonPart && jsonPart.type === "text").toBe(true);
    if (jsonPart && jsonPart.type === "text") {
      const parsed = JSON.parse(jsonPart.text) as {
        count: number;
        _imageEmbed: { embeddedCount: number; clientRequirement: string };
      };
      expect(parsed.count).toBe(2);
      expect(parsed._imageEmbed.embeddedCount).toBe(2);
      expect(parsed._imageEmbed.clientRequirement).toMatch(/MUST show/i);
    }
  });

  it("respects LOOKBOOK_EMBED_IMAGES_MAX=0 (metadata only)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const embed = await embedImagesForItems(
      [
        item({
          id: "a",
          title: "Alpha",
          url: "https://godly.design/website/alpha",
          thumbnailUrl: "https://cdn.godly.design/sites/alpha/thumbnail.png",
        }),
      ],
      { maxImages: 0, fetchImpl },
    );
    expect(embed.images).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(embed.notes[0]).toMatch(/disabled/i);
  });
});
