#!/usr/bin/env node
/**
 * Lookbook remote MCP — Streamable HTTP (+ legacy SSE) entrypoint.
 *
 * Primary connect path for Cursor:
 *   { "mcpServers": { "lookbook": { "url": "https://YOUR_HOST/mcp" } } }
 */
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response, NextFunction } from "express";
import { createLookbookServer } from "./server.js";
import { InMemoryEventStore } from "./lib/event-store.js";
import { RateLimiter } from "./lib/rate-limit.js";

const PORT = Number(process.env.PORT || process.env.LOOKBOOK_PORT || 3847);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_RPM = Number(process.env.LOOKBOOK_RATE_LIMIT_RPM || 60);

type Transport = StreamableHTTPServerTransport | SSEServerTransport;
const transports: Record<string, Transport> = {};

const rateLimiter = new RateLimiter(MAX_RPM, 60_000);

function clientKey(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  return req.socket.remoteAddress || "unknown";
}

function cors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Last-Event-ID, MCP-Protocol-Version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  // Health checks are free
  if (req.path === "/health" || req.path === "/") {
    next();
    return;
  }
  const key = clientKey(req);
  if (!rateLimiter.allow(key)) {
    const retry = rateLimiter.retryAfterSeconds(key);
    res.setHeader("Retry-After", String(retry));
    res.status(429).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Rate limit exceeded (${MAX_RPM}/min). Retry in ${retry}s.`,
      },
      id: null,
    });
    return;
  }
  next();
}

export function createHttpApp() {
  // HTTP MCP is meant to be remote/public. Avoid localhost Host-header
  // locking (which breaks Cloudflare/Railway/Render tunnels). Optionally
  // pin allowed hosts via LOOKBOOK_ALLOWED_HOSTS=host1,host2
  const allowedHosts = process.env.LOOKBOOK_ALLOWED_HOSTS
    ? process.env.LOOKBOOK_ALLOWED_HOSTS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const app = createMcpExpressApp(
    allowedHosts
      ? { host: "0.0.0.0", allowedHosts }
      : { host: "0.0.0.0" },
  );
  app.use(cors);
  app.use(rateLimit);

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      name: "lookbook",
      version: "1.0.0",
      transport: ["streamable-http", "sse"],
      endpoints: {
        mcp: "/mcp",
        sse: "/sse",
        messages: "/messages",
        health: "/health",
      },
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "Lookbook",
      description:
        "Remote MCP for browsing design-inspiration galleries. Connect Cursor with url https://YOUR_HOST/mcp",
      connect: {
        cursor: {
          mcpServers: {
            lookbook: { url: "https://YOUR_HOST/mcp" },
          },
        },
      },
      health: "/health",
      mcp: "/mcp",
    });
  });

  //---------------------------------------------------------------------------
  // Streamable HTTP (primary) — /mcp
  //---------------------------------------------------------------------------
  app.all("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        const existing = transports[sessionId];
        if (!(existing instanceof StreamableHTTPServerTransport)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "Bad Request: Session exists but uses a different transport protocol",
            },
            id: null,
          });
          return;
        }
        transport = existing;
      } else if (
        !sessionId &&
        req.method === "POST" &&
        isInitializeRequest(req.body)
      ) {
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) delete transports[sid];
        };
        const server = createLookbookServer();
        await server.connect(transport);
      } else if (
        // Stateless fallback: allow tool calls without prior session when
        // LOOKBOOK_STATELESS=1 (useful behind some gateways / serverless).
        process.env.LOOKBOOK_STATELESS === "1" &&
        req.method === "POST"
      ) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const server = createLookbookServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  //---------------------------------------------------------------------------
  // Legacy SSE (optional) — /sse + /messages
  //---------------------------------------------------------------------------
  app.get("/sse", async (req, res) => {
    try {
      const transport = new SSEServerTransport("/messages", res);
      transports[transport.sessionId] = transport;
      res.on("close", () => {
        delete transports[transport.sessionId];
      });
      const server = createLookbookServer();
      await server.connect(transport);
    } catch (error) {
      console.error("Error handling /sse:", error);
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId) {
      res.status(400).send("Missing sessionId");
      return;
    }
    const existing = transports[sessionId];
    if (!(existing instanceof SSEServerTransport)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad Request: Session exists but uses a different transport protocol",
        },
        id: null,
      });
      return;
    }
    await existing.handlePostMessage(req, res, req.body);
  });

  return app;
}

export async function startHttpServer(
  port = PORT,
  host = HOST,
): Promise<ReturnType<typeof createHttpApp>> {
  const app = createHttpApp();
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
    server.on("error", reject);
  });
  console.error(
    `Lookbook MCP listening on http://${host}:${port}  (mcp=/mcp health=/health)`,
  );
  return app;
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("/http.ts") ||
    process.argv[1].endsWith("/http.js") ||
    process.argv[1].endsWith("\\http.ts") ||
    process.argv[1].endsWith("\\http.js"));

if (isMain) {
  startHttpServer().catch((err) => {
    console.error("Lookbook HTTP MCP failed to start:", err);
    process.exit(1);
  });
}
