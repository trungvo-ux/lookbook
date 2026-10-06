# Lookbook

**Lookbook** is a remote MCP server for browsing design-inspiration galleries and reviewing pages as structured JSON — with real screenshot **image content blocks** so clients can showcase designs in chat (never inventing pixels).

## Connect Lookbook (remote — recommended)

You do **not** need to clone this repo or run Node locally. Add Lookbook in Cursor with a single HTTPS URL:

```json
{
  "mcpServers": {
    "lookbook": {
      "url": "https://YOUR_HOST/mcp"
    }
  }
}
```

Or use **Cursor → Settings → MCP → Add MCP Server** and paste `https://YOUR_HOST/mcp`.

### Deploy your own public host (one-click)

| Host | Action |
|------|--------|
| **Render** | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy) — connect this repo (uses `render.yaml` + `Dockerfile`) |
| **Railway** | [Deploy on Railway](https://railway.app/new) — select this repo (`railway.json` + `Dockerfile`) |
| **Fly.io** | `fly launch` then `fly deploy` (uses `fly.toml`) |

After deploy, replace `YOUR_HOST` with your service hostname (path must be `/mcp`).

Health check: `GET https://YOUR_HOST/health`

> **Note:** A long-lived public URL requires deploying this repo (Render / Railway / Fly). Cloudflare quick tunnels (`scripts/tunnel.sh`) are fine for demos but expire when the process stops.

### Optional: local HTTP for development

```bash
npm install
npm run dev          # Streamable HTTP on http://127.0.0.1:3847/mcp
```

Tunnel for a temporary public URL:

```bash
cloudflared tunnel --url http://127.0.0.1:3847
# then use https://….trycloudflare.com/mcp in Cursor
```

### Optional: stdio (power users only)

```bash
npm run start:stdio
```

```json
{
  "mcpServers": {
    "lookbook": {
      "command": "npx",
      "args": ["tsx", "/ABS/PATH/TO/lookbook/src/index.ts"]
    }
  }
}
```

---

**Dedicated extractors:** Godly, Minimal Gallery, Cosmos, **60fps**, **Awwwards**, **Curated Design**, **Mobbin**. Full ~48-source catalog; everyone else uses OG / Twitter / JSON-LD.

## Tools

| Tool | Purpose |
|------|---------|
| `list_sources` | Full catalog |
| `browse_source` | Gallery / recent previews + embedded screenshots |
| `get_inspo_page` | One URL → structured page + embedded screenshot |
| `search_inspo` | Ranked search (default ~6 hits) + embedded screenshots |
| `review_brief` | Compact design review brief (+ images when thumbs work) |

### Visual showcase (MCP image blocks)

`search_inspo`, `browse_source`, `get_inspo_page`, and `review_brief` return **multi-part MCP content**:

1. A short text instruction that clients **MUST** show images inline in chat (image + caption + link).
2. Structured JSON metadata (`title`, `url`, `sourceId`, `tags`, …) for citation.
3. Up to **N** MCP `ImageContent` blocks (`type: "image"`, base64 + `mimeType`) for the top curated picks with working thumbnails.

Server `instructions` (returned on `initialize`) and tool descriptions repeat the same showcase rule so agents do not dump text-only URLs.

Images are fetched, resized (max width ~900px), and JPEG-compressed before base64. Failed fetches (including known-dead Mobbin supabase `app_screens` URLs) are skipped and noted — Lookbook never invents pixels. Prefer Godly / Minimal Gallery / Cosmos CDN thumbs when available.

## Example: “Hey Lookbook, find me a dashboard design”

1. Agent calls `search_inspo` with that query.
2. Lookbook fans out to priority sources, ranks results, and embeds top screenshots as image blocks.
3. The client should render those images inline; optionally call `get_inspo_page` / `review_brief` on the best URLs.

## Scripts

```bash
npm run build       # compile to dist/
npm start           # production HTTP MCP (PORT=8080 typical in containers)
npm run dev         # HTTP MCP via tsx (port 3847)
npm run start:stdio # optional local stdio
npm test
```

## Endpoints

| Path | Purpose |
|------|---------|
| `POST/GET/DELETE /mcp` | Streamable HTTP MCP (primary) |
| `GET /sse` + `POST /messages` | Legacy SSE (optional) |
| `GET /health` | Liveness |
| `GET /` | Connect hint JSON |

Shared public instances use in-memory caching of fetched HTML (~15 min) and a per-IP rate limit (`LOOKBOOK_RATE_LIMIT_RPM`, default 60).

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3847` (dev) / `8080` (Docker) | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `LOOKBOOK_CACHE_DIR` | `.cache/lookbook` | HTML cache directory |
| `LOOKBOOK_RATE_LIMIT_RPM` | `60` | Max MCP requests per IP per minute |
| `LOOKBOOK_STATELESS` | unset | Set `1` for session-less `/mcp` (some gateways) |
| `LOOKBOOK_ALLOWED_HOSTS` | unset | Optional comma-separated Host allowlist (omit for public tunnels) |
| `LOOKBOOK_EMBED_IMAGES_MAX` | `4` | Max screenshots to embed as MCP image blocks (`0` disables) |
| `LOOKBOOK_EMBED_MAX_WIDTH` | `900` | Max width (px) when resizing embeds |
| `LOOKBOOK_EMBED_JPEG_QUALITY` | `72` | JPEG quality for compressed embeds |
| `LOOKBOOK_EMBED_MAX_BYTES` | `450000` | Skip embed if compressed image still exceeds this size |

## License

MIT
