import { readCache, writeCache } from "./cache.js";

export const USER_AGENT =
  "LookbookMCP/1.0 (+https://github.com/lookbook-mcp; design inspiration research for AI agents)";

const MIN_INTERVAL_MS = 400;
let lastFetchAt = 0;

async function rateLimit(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastFetchAt);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastFetchAt = Date.now();
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchHtmlResult {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  fromCache: boolean;
  fetchedAt: string;
}

export async function fetchHtml(
  url: string,
  options: { bypassCache?: boolean; ttlMs?: number } = {},
): Promise<FetchHtmlResult> {
  if (!options.bypassCache) {
    const cached = await readCache(url, options.ttlMs);
    if (cached && cached.status >= 200 && cached.status < 400) {
      return {
        url,
        finalUrl: cached.url,
        status: cached.status,
        html: cached.body,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }
  }

  await rateLimit();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FetchError(`Network error fetching ${url}: ${msg}`, url);
  }

  const html = await response.text();
  const fetchedAt = new Date().toISOString();
  const finalUrl = response.url || url;

  if (response.status === 403 || response.status === 401) {
    throw new FetchError(
      `Blocked or unauthorized (${response.status}) for ${url}. Cite the public URL directly; no login/cookies are used by this MCP.`,
      url,
      response.status,
    );
  }

  if (response.status === 429) {
    throw new FetchError(
      `Rate limited (429) for ${url}. Retry later; this MCP spaces requests intentionally.`,
      url,
      response.status,
    );
  }

  if (response.status >= 400) {
    throw new FetchError(
      `HTTP ${response.status} fetching ${url}`,
      url,
      response.status,
    );
  }

  await writeCache({
    url: finalUrl,
    status: response.status,
    contentType: response.headers.get("content-type") || "text/html",
    body: html,
    fetchedAt,
  });

  return {
    url,
    finalUrl,
    status: response.status,
    html,
    fromCache: false,
    fetchedAt,
  };
}

export function absoluteUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
