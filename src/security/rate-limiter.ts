/**
 * VegaMCP — Rate Limiter
 * Sliding window rate limiter per tool category.
 */

interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  memory: { maxPerMinute: 60, maxPerHour: 500 },
  browser: { maxPerMinute: 30, maxPerHour: 200 },
  sentry: { maxPerMinute: 30, maxPerHour: 150 },
  reasoning: { maxPerMinute: 10, maxPerHour: 50 },
  swarm: { maxPerMinute: 60, maxPerHour: 600 },
  capabilities: { maxPerMinute: 30, maxPerHour: 300 },
  webhooks: { maxPerMinute: 20, maxPerHour: 200 },
  // v3.0 categories
  github: { maxPerMinute: 15, maxPerHour: 100 },
  web_search: { maxPerMinute: 20, maxPerHour: 150 },
  knowledge: { maxPerMinute: 60, maxPerHour: 500 },
  code_analysis: { maxPerMinute: 30, maxPerHour: 300 },
  prompt_library: { maxPerMinute: 30, maxPerHour: 300 },
};

const windows: Map<string, number[]> = new Map();

/**
 * Check if a tool call is within rate limits.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(category: string): {
  allowed: boolean;
  retryAfterMs?: number;
  message?: string;
} {
  const config = RATE_LIMITS[category];
  if (!config) return { allowed: true }; // Unknown category = no limit

  const now = Date.now();
  const timestamps = windows.get(category) || [];

  // Clean entries older than 1 hour
  const oneHourAgo = now - 3600000;
  const recent = timestamps.filter(t => t > oneHourAgo);

  // Check minute window
  const oneMinuteAgo = now - 60000;
  const lastMinute = recent.filter(t => t > oneMinuteAgo);
  if (lastMinute.length >= config.maxPerMinute) {
    const oldestInMinute = Math.min(...lastMinute);
    const retryAfterMs = (oldestInMinute + 60000) - now;
    return {
      allowed: false,
      retryAfterMs,
      message: `Rate limit exceeded for ${category} tools: ${config.maxPerMinute} calls/minute. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    };
  }

  // Check hour window
  if (recent.length >= config.maxPerHour) {
    const oldestInHour = Math.min(...recent);
    const retryAfterMs = (oldestInHour + 3600000) - now;
    return {
      allowed: false,
      retryAfterMs,
      message: `Rate limit exceeded for ${category} tools: ${config.maxPerHour} calls/hour. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`,
    };
  }

  // Record this call
  recent.push(now);
  windows.set(category, recent);
  return { allowed: true };
}

/**
 * Get current rate limit status for a category.
 */
export function getRateLimitStatus(category: string): {
  minuteUsed: number;
  minuteLimit: number;
  hourUsed: number;
  hourLimit: number;
} {
  const config = RATE_LIMITS[category] || { maxPerMinute: 0, maxPerHour: 0 };
  const now = Date.now();
  const timestamps = windows.get(category) || [];

  const oneMinuteAgo = now - 60000;
  const oneHourAgo = now - 3600000;

  return {
    minuteUsed: timestamps.filter(t => t > oneMinuteAgo).length,
    minuteLimit: config.maxPerMinute,
    hourUsed: timestamps.filter(t => t > oneHourAgo).length,
    hourLimit: config.maxPerHour,
  };
}
