/**
 * VegaMCP — Sentry Get Issue Detail Tool
 */

import { sentryFetch, getSentryConfig, sanitizeSentryData } from './client.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const sentryGetIssueDetailSchema = {
  name: 'sentry_get_issue_detail',
  description: 'Get detailed information about a specific Sentry issue, including the full stack trace from the latest event, environment variables, tags, and release version. Use this after finding an issue with sentry_search_issues.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueId: { type: 'string', description: 'The Sentry issue ID' },
      includeStacktrace: { type: 'boolean', default: true },
      includeEnvironment: { type: 'boolean', default: true },
    },
    required: ['issueId'],
  },
};

export async function handleSentryGetIssueDetail(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
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
    // Fetch the issue
    const issueResponse = await sentryFetch(`/issues/${args.issueId}/`);
    if (!issueResponse.ok) {
      const code = issueResponse.status === 404 ? 'SENTRY_ISSUE_NOT_FOUND' : 'SENTRY_API_ERROR';
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: issueResponse.error } }) }] };
    }

    const issue = issueResponse.data;

    // Fetch the latest event
    const eventResponse = await sentryFetch(`/issues/${args.issueId}/events/latest/`);

    const result: any = {
      success: true,
      issue: sanitizeSentryData({
        id: issue.id,
        title: issue.title,
        status: issue.status,
        level: issue.level,
        platform: issue.platform,
        count: parseInt(issue.count || '0', 10),
        userCount: issue.userCount,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
      }),
    };

    if (eventResponse.ok && eventResponse.data) {
      const event = eventResponse.data;
      result.latestEvent = sanitizeSentryData({
        eventId: event.eventID,
        timestamp: event.dateCreated,
        release: event.release?.version || null,
        environment: event.environment || null,
      });

      // Stack trace
      if (args.includeStacktrace !== false) {
        const exception = event.entries?.find((e: any) => e.type === 'exception');
        if (exception?.data?.values) {
          result.latestEvent.stacktrace = {
            frames: exception.data.values.flatMap((v: any) =>
              (v.stacktrace?.frames || [])
                .filter((f: any) => f.inApp)
                .map((f: any) => sanitizeSentryData({
                  filename: f.filename,
                  function: f.function,
                  lineNo: f.lineNo,
                  colNo: f.colNo,
                  context: f.context,
                  inApp: f.inApp,
                }))
            ),
          };
        }
      }

      // Environment/tags
      if (args.includeEnvironment !== false) {
        result.latestEvent.tags = sanitizeSentryData(
          Object.fromEntries((event.tags || []).map((t: any) => [t.key, t.value]))
        );
        result.latestEvent.contexts = sanitizeSentryData(event.contexts || {});
      }
    }

    logAudit('sentry_get_issue_detail', `Issue ${args.issueId}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('sentry_get_issue_detail', err.message, false, 'SENTRY_API_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'SENTRY_API_ERROR', message: err.message } }) }] };
  }
}
