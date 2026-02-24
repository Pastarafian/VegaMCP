/**
 * VegaMCP — Sentry Resources
 * Exposes recent production errors as a live MCP resource.
 */

import { sentryFetch, getSentryConfig, sanitizeSentryData } from '../tools/sentry/client.js';

export const sentryResources = [
  {
    uri: 'sentry://issues/recent',
    name: 'Recent Production Issues',
    description: 'Live feed of the 10 most recent unresolved production errors from Sentry.',
    mimeType: 'application/json',
  },
];

export async function readSentryResource(uri: string): Promise<string> {
  if (uri === 'sentry://issues/recent') {
    const config = getSentryConfig();
    if (!config) {
      return JSON.stringify({ error: 'Sentry not configured. Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in .env' });
    }

    try {
      const response = await sentryFetch(
        `/projects/${config.org}/${config.project}/issues/?query=is:unresolved&sort=date&limit=10`
      );

      if (!response.ok) {
        return JSON.stringify({ error: response.error });
      }

      const issues = (response.data || []).map((issue: any) => sanitizeSentryData({
        id: issue.id,
        title: issue.title,
        culprit: issue.culprit,
        level: issue.level,
        count: parseInt(issue.count || '0', 10),
        userCount: issue.userCount,
        lastSeen: issue.lastSeen,
        shortId: issue.shortId,
      }));

      return JSON.stringify({ issueCount: issues.length, issues }, null, 2);
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  }

  return JSON.stringify({ error: `Unknown resource URI: ${uri}` });
}
