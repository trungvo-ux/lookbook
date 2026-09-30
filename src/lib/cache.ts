import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_CACHE_DIR =
  process.env.LOOKBOOK_CACHE_DIR ||
  process.env.DESIGN_INSPO_CACHE_DIR ||
  path.join(process.cwd(), ".cache", "lookbook");

export interface CacheEntry {
  url: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
}

function keyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export async function readCache(
  url: string,
  ttlMs = DEFAULT_TTL_MS,
): Promise<CacheEntry | null> {
  try {
    const file = path.join(DEFAULT_CACHE_DIR, `${keyFor(url)}.json`);
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > ttlMs) return null;
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

export async function writeCache(entry: CacheEntry): Promise<void> {
  await mkdir(DEFAULT_CACHE_DIR, { recursive: true });
  const file = path.join(DEFAULT_CACHE_DIR, `${keyFor(entry.url)}.json`);
  await writeFile(file, JSON.stringify(entry), "utf8");
}
