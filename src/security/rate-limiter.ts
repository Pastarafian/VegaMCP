/**
 * VegaMCP — Rate Limiter (v2.0)
 * 
 * Token Bucket algorithm — O(1) per check, supports burst traffic.
 * Each category gets a bucket that refills at a steady rate.
 * 
 * Upgrade from v1.0 sliding window which stored every timestamp.
 */

// ═══════════════════════════════════════════════
// TOKEN BUCKET IMPLEMENTATION
// ═══════════════════════════════════════════════

interface BucketConfig {
  maxTokens: number;       // Max burst capacity
  refillPerSecond: number;  // Tokens added per second
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(config: BucketConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillPerSecond;
    this.tokens = config.maxTokens; // Start full
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token. Returns true if allowed, false if rate limited.
   */
  tryConsume(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /**
   * Get time until next token is available (ms).
   */
  getRetryAfterMs(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    const deficit = 1 - this.tokens;
    return Math.ceil((deficit / this.refillRate) * 1000);
  }

  /**
   * Get current bucket status.
   */
  getStatus(): { available: number; max: number; refillRate: number } {
    this.refill();
    return {
      available: Math.floor(this.tokens),
      max: this.maxTokens,
      refillRate: this.refillRate,
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// ═══════════════════════════════════════════════
// RATE LIMIT CONFIGURATION
// ═══════════════════════════════════════════════

// Config: maxTokens = burst capacity, refillPerSecond = sustained rate
const RATE_LIMITS: Record<string, BucketConfig> = {
  memory:         { maxTokens: 30, refillPerSecond: 1.0 },   // 60/min sustained
  browser:        { maxTokens: 15, refillPerSecond: 0.5 },   // 30/min sustained
  sentry:         { maxTokens: 15, refillPerSecond: 0.5 },   // 30/min sustained
  reasoning:      { maxTokens: 5,  refillPerSecond: 0.17 },  // 10/min sustained
  swarm:          { maxTokens: 30, refillPerSecond: 1.0 },   // 60/min sustained
  capabilities:   { maxTokens: 15, refillPerSecond: 0.5 },   // 30/min sustained
  webhooks:       { maxTokens: 10, refillPerSecond: 0.33 },  // 20/min sustained
  github:         { maxTokens: 10, refillPerSecond: 0.25 },  // 15/min sustained
  web_search:     { maxTokens: 10, refillPerSecond: 0.33 },  // 20/min sustained
  knowledge:      { maxTokens: 30, refillPerSecond: 1.0 },   // 60/min sustained
  code_analysis:  { maxTokens: 15, refillPerSecond: 0.5 },   // 30/min sustained
  prompt_library: { maxTokens: 15, refillPerSecond: 0.5 },   // 30/min sustained
};

// Lazy-init buckets
const buckets: Map<string, TokenBucket> = new Map();

function getBucket(category: string): TokenBucket | null {
  const config = RATE_LIMITS[category];
  if (!config) return null;

  let bucket = buckets.get(category);
  if (!bucket) {
    bucket = new TokenBucket(config);
    buckets.set(category, bucket);
  }
  return bucket;
}

// ═══════════════════════════════════════════════
// PUBLIC API (same interface as v1 for compatibility)
// ═══════════════════════════════════════════════

/**
 * Check if a tool call is within rate limits.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(category: string): {
  allowed: boolean;
  retryAfterMs?: number;
  message?: string;
} {
  const bucket = getBucket(category);
  if (!bucket) return { allowed: true }; // Unknown category = no limit

  if (bucket.tryConsume()) {
    return { allowed: true };
  }

  const retryAfterMs = bucket.getRetryAfterMs();
  return {
    allowed: false,
    retryAfterMs,
    message: `Rate limit exceeded for ${category} tools. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
  };
}

/**
 * Get current rate limit status for a category.
 * API compatible with v1 but uses token bucket stats.
 */
export function getRateLimitStatus(category: string): {
  minuteUsed: number;
  minuteLimit: number;
  hourUsed: number;
  hourLimit: number;
  // v2 additions
  tokensAvailable?: number;
  maxTokens?: number;
  refillRate?: number;
} {
  const bucket = getBucket(category);
  const config = RATE_LIMITS[category];
  if (!bucket || !config) {
    return { minuteUsed: 0, minuteLimit: 0, hourUsed: 0, hourLimit: 0 };
  }

  const status = bucket.getStatus();
  const perMinute = Math.round(config.refillPerSecond * 60);
  const perHour = perMinute * 60;

  return {
    minuteUsed: config.maxTokens - status.available,
    minuteLimit: perMinute,
    hourUsed: 0, // Token bucket doesn't track cumulative usage
    hourLimit: perHour,
    tokensAvailable: status.available,
    maxTokens: status.max,
    refillRate: status.refillRate,
  };
}
