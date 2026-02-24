/**
 * VegaMCP — Sentry Resolve Issue Tool
 */

import { sentryFetch, getSentryConfig } from './client.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const sentryResolveIssueSchema = {
  name: 'sentry_resolve_issue',
  description: 'Mark a Sentry issue as resolved. This is a DESTRUCTIVE action — it affects production issue tracking. Only call this after confirming a fix has been applied and verified.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueId: { type: 'string', description: 'The issue ID to resolve' },
      resolution: { type: 'string', enum: ['resolved', 'resolvedInNextRelease', 'ignored'], default: 'resolved' },
      comment: { type: 'string', description: 'Optional comment explaining the resolution' },
    },
    required: ['issueId'],
  },
};

export async function handleSentryResolveIssue(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
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
    const resolution = args.resolution || 'resolved';
    const body: any = {};

    if (resolution === 'resolved') {
      body.status = 'resolved';
    } else if (resolution === 'resolvedInNextRelease') {
      body.status = 'resolved';
      body.statusDetails = { inNextRelease: true };
    } else if (resolution === 'ignored') {
      body.status = 'ignored';
    }

    const response = await sentryFetch(`/issues/${args.issueId}/`, {
      method: 'PUT',
      body,
    });

    if (!response.ok) {
      const code = response.status === 404 ? 'SENTRY_ISSUE_NOT_FOUND' : 'SENTRY_API_ERROR';
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: response.error } }) }] };
    }

    // Add comment if provided
    if (args.comment) {
      await sentryFetch(`/issues/${args.issueId}/comments/`, {
        method: 'POST',
        body: { text: args.comment },
      });
    }

    const result = {
      success: true,
      issueId: args.issueId,
      newStatus: resolution,
      comment: args.comment || null,
      warning: '⚠️ This issue has been marked as resolved in production Sentry. This affects your team\'s issue tracking.',
      undoAction: 'To unresolve: call sentry_resolve_issue with resolution="unresolved" (manually via Sentry dashboard)',
    };

    logAudit('sentry_resolve_issue', `Resolved issue ${args.issueId} as ${resolution}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('sentry_resolve_issue', err.message, false, 'SENTRY_API_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'SENTRY_API_ERROR', message: err.message } }) }] };
  }
}
