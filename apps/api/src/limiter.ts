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

  private idOf(key: string): string {
    return createHash("sha256").update(key).digest("base64url").slice(0, 22)
  }

  private recent(id: string, now: number): number[] {
    return (this.hits.get(id) ?? []).filter((t) => now - t < this.windowMs)
  }

  /** Records an attempt. Returns false when this key is over the limit. */
  allow(key: string, now = Date.now()): boolean {
    if (this.blocked(key, now)) return false
    this.record(key, now)
    return true
  }

  /** True when this key has already used up its attempts (does not record anything). */
  blocked(key: string, now = Date.now()): boolean {
    return this.recent(this.idOf(key), now).length >= this.max
  }

  /** Records one attempt without checking. Use with `blocked` to count only failures. */
  record(key: string, now = Date.now()): void {
    const id = this.idOf(key)
    this.hits.set(id, [...this.recent(id, now), now])
    if (this.hits.size > 10_000) this.sweep(now)
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k)
  }
}
