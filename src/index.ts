#!/usr/bin/env node
/**
 * Lookbook stdio MCP entry (optional / power users).
 * Prefer the remote HTTP server: `npm start` → src/http.ts
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLookbookServer } from "./server.js";

async function main() {
  const server = createLookbookServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Lookbook MCP (stdio) failed to start:", err);
  process.exit(1);
});
