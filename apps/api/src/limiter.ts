import { createHash } from "node:crypto"

/**
 * Sliding-window limiter keyed by an opaque string. The key is hashed on the
 * way in, so a phone number is never kept in memory in the clear.
 *
 * In memory: it is per process and resets on restart. Fine for one server; a
 * second server would need a shared store.
 */
export class SlidingWindow {
  private hits = new Map<string, number[]>()

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Records an attempt. Returns false when this key is over the limit. */
  allow(key: string, now = Date.now()): boolean {
    const id = createHash("sha256").update(key).digest("base64url").slice(0, 22)
    const recent = (this.hits.get(id) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(id, recent)
      return false
    }
    recent.push(now)
    this.hits.set(id, recent)
    if (this.hits.size > 10_000) this.sweep(now)
    return true
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k)
  }
}
