import type { CallToolResult, ImageContent, TextContent } from "@modelcontextprotocol/sdk/types.js";
import type { InspoItem } from "../types/inspo.js";
import {
  embedImagesForItems,
  scrubItems,
  type EmbedImagesConfig,
  type EmbeddedImage,
  type EmbedImagesResult,
} from "./embed-images.js";

/**
 * Hard client requirement — also mirrored in server instructions and tool
 * descriptions so agents showcase images instead of dumping JSON URLs.
 */
export const SHOWCASE_INSTRUCTION = [
  "CLIENT REQUIREMENT (mandatory): This tool result includes MCP image content blocks.",
  "You MUST display each returned image INLINE in the chat for the user — never reply with text-only links when images are present.",
  "For every image: show (1) the image itself, (2) a short caption with the title, (3) the page link (url).",
  "Do not invent screenshots. Only show images that appear as type:\"image\" blocks below.",
].join(" ");

export type TextPart = TextContent;
export type ImagePart = ImageContent;

export function jsonText(data: unknown): TextPart {
  return {
    type: "text",
    text: JSON.stringify(data, null, 2),
  };
}

export function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      jsonText({
        error: message,
        hint: "If a site blocks bots, cite the public URL returned by list_sources / browse_source instead.",
      }),
    ],
  };
}

function captionText(image: EmbeddedImage, index: number): TextPart {
  return {
    type: "text",
    text: `Show inline #${index + 1}: ${image.title}\nLink: ${image.pageUrl}\nThumb: ${image.sourceUrl}`,
  };
}

function imageBlock(image: EmbeddedImage): ImagePart {
  return {
    type: "image",
    data: image.data,
    mimeType: image.mimeType,
    annotations: {
      audience: ["user", "assistant"],
      priority: 1,
    },
  };
}

function embedMeta(embed: EmbedImagesResult) {
  return {
    embeddedCount: embed.images.length,
    embedded: embed.images.map((img) => ({
      title: img.title,
      pageUrl: img.pageUrl,
      sourceUrl: img.sourceUrl,
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
      bytesEmbedded: img.bytesEmbedded,
    })),
    skipped: embed.skipped,
    notes: embed.notes,
    clientRequirement:
      "MUST show each MCP image block inline in chat (image + caption + link). Never text-only URLs.",
  };
}

/**
 * Build a multi-part tool result: showcase instruction + JSON metadata +
 * interleaved caption/image blocks for each successfully embedded thumb.
 */
export function buildVisualToolResult(
  data: unknown,
  embed: EmbedImagesResult,
): CallToolResult {
  const content: Array<TextPart | ImagePart> = [
    { type: "text", text: SHOWCASE_INSTRUCTION },
    jsonText({
      ...(typeof data === "object" && data !== null ? data : { data }),
      _imageEmbed: embedMeta(embed),
    }),
  ];

  embed.images.forEach((image, index) => {
    content.push(captionText(image, index));
    content.push(imageBlock(image));
  });

  return { content };
}

/**
 * JSON-only result (no images) — still includes a reminder when used for
 * list_sources / errors without visuals.
 */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [jsonText(data)],
  };
}

export interface VisualItemsOptions {
  /** Items to attempt embedding (usually the same picks returned in JSON). */
  items: InspoItem[];
  /** Optional embed config overrides (tests / env). */
  embedConfig?: Partial<EmbedImagesConfig>;
  /** Scrub known-dead Mobbin thumbs from returned metadata (default true). */
  scrubDeadThumbs?: boolean;
}

/**
 * Scrub dead thumbs from `items`, embed top working images, then build a
 * visual multi-part tool result around `buildPayload(scrubbedItems)`.
 */
export async function visualResultForItems(
  items: InspoItem[],
  buildPayload: (scrubbed: InspoItem[]) => unknown,
  options: Omit<VisualItemsOptions, "items"> = {},
): Promise<CallToolResult> {
  const scrub = options.scrubDeadThumbs !== false;
  const scrubbed = scrub ? scrubItems(items) : items;
  const embed = await embedImagesForItems(scrubbed, options.embedConfig);
  return buildVisualToolResult(buildPayload(scrubbed), embed);
}
