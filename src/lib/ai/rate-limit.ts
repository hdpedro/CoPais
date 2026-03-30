/* ------------------------------------------------------------------ */
/* ai-rate-limit.ts                                                   */
/* Per-user sliding-window rate limiter for AI assistant requests.     */
/* Uses in-memory storage (resets on deploy).                          */
/* ------------------------------------------------------------------ */

interface RateLimitBucket {
  timestamps: number[];
}

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 20; // 20 req/min per user (under Groq's 30 rpm)

class AIRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private windowMs: number;
  private maxRequests: number;

  constructor(
    windowMs = DEFAULT_WINDOW_MS,
    maxRequests = DEFAULT_MAX_REQUESTS
  ) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if a user can make a request. Returns an object with:
   * - allowed: whether the request is allowed
   * - remaining: how many requests are left in the window
   * - retryAfterMs: if not allowed, how long to wait
   */
  check(userId: string): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  } {
    const now = Date.now();
    const bucket = this.buckets.get(userId) || { timestamps: [] };

    // Remove timestamps outside the window
    bucket.timestamps = bucket.timestamps.filter(
      (ts) => now - ts < this.windowMs
    );

    if (bucket.timestamps.length >= this.maxRequests) {
      const oldestInWindow = bucket.timestamps[0];
      const retryAfterMs = this.windowMs - (now - oldestInWindow);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, retryAfterMs),
      };
    }

    // Record this request
    bucket.timestamps.push(now);
    this.buckets.set(userId, bucket);

    return {
      allowed: true,
      remaining: this.maxRequests - bucket.timestamps.length,
      retryAfterMs: 0,
    };
  }

  /** Clean up stale buckets (call periodically) */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [userId, bucket] of this.buckets) {
      bucket.timestamps = bucket.timestamps.filter(
        (ts) => now - ts < this.windowMs
      );
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(userId);
        pruned++;
      }
    }
    return pruned;
  }

  get userCount(): number {
    return this.buckets.size;
  }
}

// Singleton instance
export const aiRateLimiter = new AIRateLimiter();
