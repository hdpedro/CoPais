/* ------------------------------------------------------------------ */
/* ai-cache.ts                                                        */
/* In-memory response cache for AI assistant with TTL eviction.       */
/* Caches by normalised command text to avoid duplicate Groq calls.   */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  response: Record<string, unknown>;
  timestamp: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;

class AIResponseCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
  }

  /** Normalise command text for cache key */
  private normalise(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  /** Build cache key from command + date context (commands referencing "amanhã" change meaning daily) */
  private buildKey(text: string, groupId: string): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${groupId}:${today}:${this.normalise(text)}`;
  }

  get(text: string, groupId: string): Record<string, unknown> | null {
    const key = this.buildKey(text, groupId);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  set(text: string, groupId: string, response: Record<string, unknown>): void {
    // Evict oldest entries when cache is full
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    const key = this.buildKey(text, groupId);
    this.cache.set(key, { response, timestamp: Date.now() });
  }

  /** Remove expired entries */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const aiCache = new AIResponseCache();
