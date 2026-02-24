/**
 * VegaMCP — Sentry API Client
 * Shared HTTP client for all Sentry tools.
 */

import { sanitizeExternalOutput } from '../../security/input-validator.js';

const SENTRY_BASE = 'https://sentry.io/api/0';

export function getSentryConfig(): { token: string; org: string; project: string } | null {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!token || !org || !project) return null;
  return { token, org, project };
}

export async function sentryFetch(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const config = getSentryConfig();
  if (!config) {
    return { ok: false, status: 0, error: 'Sentry not configured. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in .env' };
  }

  const url = `${SENTRY_BASE}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401) {
      return { ok: false, status: 401, error: 'Sentry auth failed. Check SENTRY_AUTH_TOKEN in .env' };
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return { ok: false, status: 429, error: `Sentry rate limited. Retry after ${retryAfter || '60'} seconds` };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: `Sentry API error ${response.status}: ${text.slice(0, 500)}` };
    }

    const data = await response.json();
    return { ok: true, status: response.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, error: `Sentry request failed: ${err.message}` };
  }
}

/**
 * Sanitize Sentry response data to prevent prompt injection.
 */
export function sanitizeSentryData(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeExternalOutput(obj, 5000);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeSentryData(item));
  }
  if (obj && typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip keys that might contain secrets
      if (['password', 'secret', 'token', 'apiKey', 'api_key'].includes(key)) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeSentryData(value);
      }
    }
    return cleaned;
  }
  return obj;
}
