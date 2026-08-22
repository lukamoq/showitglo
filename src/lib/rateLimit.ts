/**
 * Production-ready Sliding Window Rate Limiter
 * Provides DDoS and spam protection for high-velocity public arena endpoints.
 */

interface RateLimitRecord {
  timestamps: number[];
}

class SlidingWindowRateLimiter {
  private cache: Map<string, RateLimitRecord> = new Map();
  private lastCleanup: number = Date.now();

  constructor() {
    // Periodically clean up stale rate limit entries
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60000);
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.cache.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < 120000);
      if (record.timestamps.length === 0) {
        this.cache.delete(key);
      }
    }
    this.lastCleanup = now;
  }

  public check(
    identifier: string,
    limit: number = 60,
    windowMs: number = 60000
  ): {
    success: boolean;
    limit: number;
    remaining: number;
    resetInMs: number;
  } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.cache.get(identifier);
    if (!record) {
      record = { timestamps: [] };
      this.cache.set(identifier, record);
    }

    // Keep only timestamps within the current window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= limit) {
      const oldestInWindow = record.timestamps[0];
      const resetInMs = Math.max(0, oldestInWindow + windowMs - now);
      return {
        success: false,
        limit,
        remaining: 0,
        resetInMs,
      };
    }

    record.timestamps.push(now);
    const resetInMs = windowMs;

    return {
      success: true,
      limit,
      remaining: limit - record.timestamps.length,
      resetInMs,
    };
  }
}

const globalForLimiter = globalThis as unknown as { rateLimiter?: SlidingWindowRateLimiter };
export const rateLimiter = globalForLimiter.rateLimiter || new SlidingWindowRateLimiter();
globalForLimiter.rateLimiter = rateLimiter;

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}
