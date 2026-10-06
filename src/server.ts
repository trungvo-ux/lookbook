import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listSources, sourceSummary } from "./sources/registry.js";
import {
  browseSource,
  getInspoPage,
  searchInspo,
} from "./fetchers/index.js";
import { buildReviewBrief } from "./tools/review-brief.js";
import {
  errorResult,
  jsonResult,
  visualResultForItems,
  SHOWCASE_INSTRUCTION,
} from "./lib/tool-result.js";
import { scrubDeadThumbUrls } from "./lib/embed-images.js";

const SERVER_INSTRUCTIONS = [
  "Lookbook returns curated design-inspiration picks with REAL screenshots.",
  SHOWCASE_INSTRUCTION,
  "When search_inspo, browse_source, get_inspo_page, or review_brief returns type:\"image\" content blocks, render those images in the chat UI for the human — caption + link under each.",
  "Structured JSON (title, url, sourceId, tags) is for citation only; it is not a substitute for showing the images.",
  "Never invent or fabricate screenshots. If an image block is missing (failed fetch), say so and cite the page URL instead.",
].join(" ");

const VISUAL_TOOL_SUFFIX =
  " IMPORTANT: Successful results include MCP ImageContent blocks (base64). Clients MUST display each image inline in chat with a short caption and the page link — never text-only URL lists.";

/** Create a Lookbook MCP server with all tools registered. */
export function createLookbookServer(): McpServer {
  const server = new McpServer(
    {
      name: "lookbook",
      version: "1.0.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.registerTool(
    "list_sources",
    {
      title: "List Lookbook sources",
      description:
        "Return the full Lookbook catalog of design-inspiration sources (id, name, home URL, category, description, dedicated fetcher flag).",
      inputSchema: {},
    },
    async () => {
      try {
        const sources = listSources().map(sourceSummary);
        return jsonResult({
          count: sources.length,
          sources,
          dedicatedFetchers: sources
            .filter((s) => s.hasDedicatedFetcher)
            .map((s) => s.id),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "browse_source",
    {
      title: "Browse a design inspiration source",
      description:
        "Browse a source gallery / recent items. Dedicated parsers for priority sources; generic OG/HTML extraction for others. Returns structured previews PLUS embedded screenshot image blocks for top picks." +
        VISUAL_TOOL_SUFFIX,
      inputSchema: {
        sourceId: z
          .string()
          .describe(
            "Source id from list_sources (e.g. godly, minimal-gallery, cosmos, mobbin)",
          ),
        query: z.string().optional().describe("Optional search/filter query"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max items to return (default 20)"),
      },
    },
    async ({ sourceId, query, limit }) => {
      try {
        const result = await browseSource(sourceId, { query, limit });
        return await visualResultForItems(result.items, (items) => ({
          ...result,
          items,
        }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_inspo_page",
    {
      title: "Fetch one inspiration page",
      description:
        "Fetch a single inspo URL (or sourceId + id) into a structured InspoPage for agent review. Returns real image URLs found in HTML only, plus an embedded screenshot image block when a working thumb is available." +
        VISUAL_TOOL_SUFFIX,
      inputSchema: {
        url: z.string().url().optional().describe("Full page URL to fetch"),
        sourceId: z
          .string()
          .optional()
          .describe("Source id when resolving via id"),
        id: z
          .string()
          .optional()
          .describe("Item id/slug within the source (used with sourceId)"),
      },
    },
    async ({ url, sourceId, id }) => {
      try {
        const page = scrubDeadThumbUrls(await getInspoPage({ url, sourceId, id }));
        return await visualResultForItems([page], (items) => items[0] ?? page);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "search_inspo",
    {
      title: "Search Lookbook",
      description:
        "Ranked search across Lookbook priority sources (Mobbin, Godly, Minimal Gallery, Cosmos, Awwwards, Curated, 60fps by default for UI queries). Returns ranked previews PLUS embedded screenshot image blocks for top picks." +
        VISUAL_TOOL_SUFFIX,
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        sourceIds: z
          .array(z.string())
          .optional()
          .describe("Optional subset of source ids to search"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default 6)"),
      },
    },
    async ({ query, sourceIds, limit }) => {
      try {
        const result = await searchInspo({ query, sourceIds, limit });
        return await visualResultForItems(result.items, (items) => ({
          ...result,
          items,
        }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "review_brief",
    {
      title: "Build an agent review brief",
      description:
        "Given one or more inspo page URLs, return a compact brief: visual style tags, layout notes, typography/color cues, interaction notes, and why it might inspire a product UI — derived from fetched metadata only (no invented screenshots). When pages have working thumbnails, also embeds image blocks for visual review." +
        VISUAL_TOOL_SUFFIX,
      inputSchema: {
        urls: z
          .array(z.string().url())
          .min(1)
          .max(10)
          .describe("One or more inspo page URLs to review"),
      },
    },
    async ({ urls }) => {
      try {
        const brief = await buildReviewBrief(urls);
        const pages = brief.pages.map(scrubDeadThumbUrls);
        return await visualResultForItems(pages, (scrubbedPages) => ({
          ...brief,
          pages: scrubbedPages,
        }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}
