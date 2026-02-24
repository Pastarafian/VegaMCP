/**
 * VegaMCP — API Gateway
 * Centralized external API access with caching, rate limiting, and circuit breaker.
 * MCP Tool: api_request
 */

import { logAudit } from '../../db/graph-store.js';

// ═══════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const cache: Map<string, CacheEntry> = new Map();

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl * 1000) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any, ttlSeconds: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlSeconds });
  // Evict old entries (keep cache under 1000 entries)
  if (cache.size > 1000) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

// ═══════════════════════════════════════════════
// RATE LIMITER (per endpoint)
// ═══════════════════════════════════════════════

const rateLimits: Map<string, number[]> = new Map();

function checkEndpointRateLimit(endpoint: string, maxPerMinute: number = 30): boolean {
  const now = Date.now();
  const timestamps = (rateLimits.get(endpoint) || []).filter(t => t > now - 60000);
  if (timestamps.length >= maxPerMinute) return false;
  timestamps.push(now);
  rateLimits.set(endpoint, timestamps);
  return true;
}

// ═══════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits: Map<string, CircuitState> = new Map();

function checkCircuit(endpoint: string, failureThreshold: number = 5, resetTimeMs: number = 60000): boolean {
  const state = circuits.get(endpoint);
  if (!state) return true;
  if (state.isOpen && Date.now() - state.lastFailure > resetTimeMs) {
    state.isOpen = false;
    state.failures = 0;
    return true;
  }
  return !state.isOpen;
}

function recordFailure(endpoint: string, threshold: number = 5): void {
  const state = circuits.get(endpoint) || { failures: 0, lastFailure: 0, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= threshold) {
    state.isOpen = true;
  }
  circuits.set(endpoint, state);
}

function recordSuccess(endpoint: string): void {
  circuits.set(endpoint, { failures: 0, lastFailure: 0, isOpen: false });
}

// ═══════════════════════════════════════════════
// COST TRACKING
// ═══════════════════════════════════════════════

const costTracker: Map<string, { calls: number; estimatedCost: number }> = new Map();

function trackCost(endpoint: string, cost: number = 0): void {
  const entry = costTracker.get(endpoint) || { calls: 0, estimatedCost: 0 };
  entry.calls++;
  entry.estimatedCost += cost;
  costTracker.set(endpoint, entry);
}

// ═══════════════════════════════════════════════
// MCP TOOL
// ═══════════════════════════════════════════════

export const apiRequestSchema = {
  name: 'api_request',
  description: 'Make an external API request through the gateway. Features: response caching, per-endpoint rate limiting, circuit breaker for failing endpoints, and cost tracking. Supports GET, POST, PUT, DELETE.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'API endpoint URL' },
      method: { type: 'string', description: 'HTTP method', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
      headers: { type: 'object', description: 'Request headers', properties: {} },
      body: { type: 'object', description: 'Request body (for POST/PUT)', properties: {} },
      cache_ttl: { type: 'number', description: 'Cache TTL in seconds (0 = no cache)', default: 300 },
      timeout: { type: 'number', description: 'Request timeout in ms', default: 30000 },
    },
    required: ['url'],
  },
};

export async function handleApiRequest(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const url = args.url;
  const method = args.method || 'GET';
  const cacheTtl = args.cache_ttl ?? 300;

  // Derive endpoint key from URL hostname + path
  let endpointKey: string;
  try {
    const parsed = new URL(url);
    endpointKey = `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_URL', message: 'Invalid URL provided' } }) }] };
  }

  // Check circuit breaker
  if (!checkCircuit(endpointKey)) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'CIRCUIT_OPEN', message: `Endpoint ${endpointKey} is temporarily disabled due to repeated failures. Will retry automatically.` } }) }] };
  }

  // Check rate limit
  if (!checkEndpointRateLimit(endpointKey)) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: `Rate limit exceeded for ${endpointKey}. Max 30 requests/minute.` } }) }] };
  }

  // Check cache (GET only)
  if (method === 'GET' && cacheTtl > 0) {
    const cacheKey = `${method}:${url}`;
    const cached = getCached(cacheKey);
    if (cached) {
      trackCost(endpointKey, 0);
      logAudit('api_request', `CACHE HIT: ${method} ${endpointKey}`, true, undefined, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, cached: true, data: cached, durationMs: Date.now() - start }) }] };
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeout || 30000);

    const fetchOptions: RequestInit = {
      method,
      headers: args.headers || {},
      signal: controller.signal,
    };

    if (['POST', 'PUT'].includes(method) && args.body) {
      (fetchOptions.headers as any)['Content-Type'] = (fetchOptions.headers as any)['Content-Type'] || 'application/json';
      fetchOptions.body = JSON.stringify(args.body);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeout);

    const responseText = await response.text();
    let data: any;
    try { data = JSON.parse(responseText); } catch { data = responseText; }

    if (response.ok) {
      recordSuccess(endpointKey);

      // Cache successful GET responses
      if (method === 'GET' && cacheTtl > 0) {
        setCache(`${method}:${url}`, data, cacheTtl);
      }
    } else {
      recordFailure(endpointKey);
    }

    trackCost(endpointKey, 0.001); // Nominal cost tracking

    const result = {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: typeof data === 'string' ? data.slice(0, 5000) : data,
      cached: false,
      durationMs: Date.now() - start,
    };

    logAudit('api_request', `${method} ${endpointKey} → ${response.status}`, response.ok, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    recordFailure(endpointKey);
    trackCost(endpointKey, 0);
    const code = err.name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_FAILED';
    logAudit('api_request', err.message, false, code, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: err.message }, durationMs: Date.now() - start }) }] };
  }
}

/**
 * Get API gateway stats for monitoring.
 */
export function getGatewayStats() {
  return {
    cacheSize: cache.size,
    endpoints: Array.from(costTracker.entries()).map(([endpoint, stats]) => ({
      endpoint,
      totalCalls: stats.calls,
      estimatedCost: `$${stats.estimatedCost.toFixed(4)}`,
      circuitState: circuits.get(endpoint)?.isOpen ? 'OPEN' : 'CLOSED',
    })),
  };
}
