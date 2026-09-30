import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHttpApp } from "../src/http.js";

describe("Lookbook HTTP MCP", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = createHttpApp();
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /health returns ok", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; name: string; endpoints: { mcp: string } };
    expect(body.ok).toBe(true);
    expect(body.name).toBe("lookbook");
    expect(body.endpoints.mcp).toBe("/mcp");
  });

  it("GET / returns connect instructions", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      connect: { cursor: { mcpServers: { lookbook: { url: string } } } };
    };
    expect(body.name).toBe("Lookbook");
    expect(body.connect.cursor.mcpServers.lookbook.url).toContain("/mcp");
  });

  it("POST /mcp initialize returns lookbook serverInfo + session", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0.0.1" },
        },
      }),
    });
    expect(res.status).toBe(200);
    const session = res.headers.get("mcp-session-id");
    expect(session).toBeTruthy();

    const text = await res.text();
    // May be JSON or SSE-framed JSON
    const jsonMatch = text.match(/\{[\s\S]*"serverInfo"[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();
    const payload = JSON.parse(jsonMatch![0]!);
    expect(payload.result.serverInfo.name).toBe("lookbook");

    // tools/list on same session
    const toolsRes = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": session!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(toolsRes.status).toBe(200);
    const toolsText = await toolsRes.text();
    expect(toolsText).toContain("list_sources");
    expect(toolsText).toContain("search_inspo");
    expect(toolsText).toContain("browse_source");
    expect(toolsText).toContain("get_inspo_page");
    expect(toolsText).toContain("review_brief");
  });

  it("rejects tool call without session", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_sources", arguments: {} },
      }),
    });
    expect(res.status).toBe(400);
  });
});
