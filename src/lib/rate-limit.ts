/**
 * Simple in-memory sliding-window rate limiter (per IP / key).
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request is allowed. */
  allow(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const prev = (this.hits.get(key) || []).filter((t) => t > windowStart);
    if (prev.length >= this.maxHits) {
      this.hits.set(key, prev);
      return false;
    }
    prev.push(now);
    this.hits.set(key, prev);
    // Opportunistic cleanup
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        const kept = times.filter((t) => t > windowStart);
        if (!kept.length) this.hits.delete(k);
        else this.hits.set(k, kept);
      }
    }
    return true;
  }

  retryAfterSeconds(key: string): number {
    const times = this.hits.get(key) || [];
    if (!times.length) return 1;
    const oldest = Math.min(...times);
    return Math.max(1, Math.ceil((oldest + this.windowMs - Date.now()) / 1000));
  }
}
