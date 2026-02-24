/**
 * VegaMCP — Sentry Get Breadcrumbs Tool
 */

import { sentryFetch, getSentryConfig, sanitizeSentryData } from './client.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const sentryGetBreadcrumbsSchema = {
  name: 'sentry_get_breadcrumbs',
  description: 'Get the breadcrumb trail (user actions leading up to the error) for a specific issue. Shows HTTP requests, UI clicks, console messages, and navigation events in chronological order. Essential for reproducing bugs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueId: { type: 'string', description: 'The issue ID to get breadcrumbs for' },
      limit: { type: 'number', description: 'Max breadcrumbs to return', default: 30 },
    },
    required: ['issueId'],
  },
};

export async function handleSentryGetBreadcrumbs(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
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
    const eventResponse = await sentryFetch(`/issues/${args.issueId}/events/latest/`);
    if (!eventResponse.ok) {
      const code = eventResponse.status === 404 ? 'SENTRY_ISSUE_NOT_FOUND' : 'SENTRY_API_ERROR';
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: eventResponse.error } }) }] };
    }

    const event = eventResponse.data;
    const breadcrumbEntry = event.entries?.find((e: any) => e.type === 'breadcrumbs');
    const limit = Math.min(args.limit || 30, 100);

    let breadcrumbs: any[] = [];
    if (breadcrumbEntry?.data?.values) {
      breadcrumbs = breadcrumbEntry.data.values
        .slice(-limit)
        .map((b: any) => sanitizeSentryData({
          type: b.type,
          category: b.category,
          message: b.message,
          data: b.data,
          timestamp: b.timestamp,
          level: b.level,
        }));
    }

    const result = {
      success: true,
      issueId: args.issueId,
      breadcrumbCount: breadcrumbs.length,
      breadcrumbs,
    };

    logAudit('sentry_get_breadcrumbs', `Issue ${args.issueId}: ${breadcrumbs.length} breadcrumbs`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('sentry_get_breadcrumbs', err.message, false, 'SENTRY_API_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'SENTRY_API_ERROR', message: err.message } }) }] };
  }
}
