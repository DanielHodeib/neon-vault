/** Sliding-window limiter keyed by anything (user id, IP ...). In memory: right for one server process. */
export function createLimiter(max: number, windowMs: number, cap = 10_000) {
  const hits = new Map<string, number[]>();

  /** Drops keys with no recent hit; if that is not enough, the oldest keys go (never everyone at once). */
  function sweep(now: number) {
    for (const [key, times] of hits) if (now - times[times.length - 1] >= windowMs) hits.delete(key);
    for (const key of hits.keys()) {
      if (hits.size <= cap) break;
      hits.delete(key);
    }
  }

  return {
    /** Counts one try; false = over the limit (the try is not counted then). */
    hit(key: string, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > cap) sweep(now);
      return true;
    },
    get size() {
      return hits.size;
    },
  };
}
