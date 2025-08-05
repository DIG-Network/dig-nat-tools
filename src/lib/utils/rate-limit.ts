/**
 * Simple rate limiting utility
 */

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Maximum number of requests allowed in the window
}

interface RateLimitState {
  timestamps: number[];
}

/**
 * Creates a rate limiter function
 * @param options Rate limit options
 * @returns Function that returns true if request is allowed, false if rate limited
 */
export function rateLimit(options: RateLimitOptions) {
  const state: RateLimitState = {
    timestamps: []
  };

  return async function checkRateLimit(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Remove timestamps outside the window
    state.timestamps = state.timestamps.filter(ts => ts > windowStart);

    // Check if we're at the limit
    if (state.timestamps.length >= options.maxRequests) {
      return false;
    }

    // Add current timestamp
    state.timestamps.push(now);
    return true;
  };
} 