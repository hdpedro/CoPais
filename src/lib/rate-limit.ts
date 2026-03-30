/* ------------------------------------------------------------------ */
/* Generic in-memory rate limiter (sliding window, per-key)            */
/* Resets on deploy — sufficient for serverless edge protection.       */
/* ------------------------------------------------------------------ */

interface Bucket {
  timestamps: number[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private windowMs: number;
  private maxRequests: number;

  constructor({ windowMs, maxRequests }: RateLimitConfig) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key) || { timestamps: [] };

    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < this.windowMs);

    if (bucket.timestamps.length >= this.maxRequests) {
      const retryAfterMs = this.windowMs - (now - bucket.timestamps[0]);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);

    return {
      allowed: true,
      remaining: this.maxRequests - bucket.timestamps.length,
      retryAfterMs: 0,
    };
  }
}

// --- Instances for each endpoint ---

/** Auth test-login: 5 req/min per IP */
export const authRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 5 });

/** Push subscribe: 10 req/min per user */
export const pushSubscribeRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });

/** Push chat notifications: 30 req/min per user */
export const pushChatRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 30 });

/** AI parse-invite (image upload): 10 req/min per user */
export const parseInviteRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });
