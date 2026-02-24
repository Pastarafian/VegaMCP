/**
 * VegaMCP — Sentry Search Issues Tool
 */

import { sentryFetch, getSentryConfig, sanitizeSentryData } from './client.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const sentrySearchIssuesSchema = {
  name: 'sentry_search_issues',
  description: 'Search for issues (error groups) in your Sentry project. Supports filtering by status, time range, and search query. Returns a summary list — use sentry_get_issue_detail for full details.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query (e.g., "TypeError", "login crash")', default: '' },
      status: { type: 'string', enum: ['unresolved', 'resolved', 'ignored', 'all'], default: 'unresolved' },
      sortBy: { type: 'string', enum: ['date', 'priority', 'freq', 'user'], default: 'date' },
      timeRange: { type: 'string', enum: ['1h', '24h', '7d', '14d', '30d'], default: '24h' },
      limit: { type: 'number', description: 'Max results', default: 10 },
    },
  },
};

export async function handleSentrySearchIssues(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  const rateCheck = checkRateLimit('sentry');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  const config = getSentryConfig();
  if (!config) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'SENTRY_NOT_CONFIGURED', message: 'Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in .env' } }) }] };
  }

  try {
    const query = args.query || '';
    const status = args.status || 'unresolved';
    const sortBy = args.sortBy || 'date';
    const limit = Math.min(args.limit || 10, 25);

    // Build query params
    let searchQuery = query;
    if (status !== 'all') {
      searchQuery = `is:${status} ${searchQuery}`.trim();
    }

    const timeMap: Record<string, string> = {
      '1h': '1h', '24h': '24h', '7d': '7d', '14d': '14d', '30d': '30d',
    };

    const params = new URLSearchParams({
      query: searchQuery,
      sort: sortBy,
      limit: limit.toString(),
      statsPeriod: timeMap[args.timeRange || '24h'] || '24h',
    });

    const response = await sentryFetch(
      `/projects/${config.org}/${config.project}/issues/?${params}`
    );

    if (!response.ok) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'SENTRY_API_ERROR', message: response.error } }) }] };
    }

    const issues = (response.data || []).map((issue: any) => sanitizeSentryData({
      id: issue.id,
      title: issue.title,
      culprit: issue.culprit,
      status: issue.status,
      level: issue.level,
      count: parseInt(issue.count || '0', 10),
      userCount: issue.userCount,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      shortId: issue.shortId,
      permalink: issue.permalink,
    }));

    const result = {
      success: true,
      query: searchQuery,
      issueCount: issues.length,
      issues,
    };

    logAudit('sentry_search_issues', `Query: "${query}" → ${issues.length} issues`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('sentry_search_issues', err.message, false, 'SENTRY_API_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'SENTRY_API_ERROR', message: err.message } }) }] };
  }
}
