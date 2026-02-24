/**
 * VegaMCP — Browser Navigate Tool
 */

import { getPage } from './session.js';
import { isUrlAllowed } from '../../security/path-guard.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const browserNavigateSchema = {
  name: 'browser_navigate',
  description: 'Navigate the headless browser to a URL. Waits for the page to reach the specified load state. Use this to open your local dev server, external docs, or any web page for testing. The browser launches automatically on first use.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
      waitUntil: { type: 'string', enum: ['domcontentloaded', 'load', 'networkidle'], default: 'domcontentloaded' },
      timeout: { type: 'number', description: 'Navigation timeout in ms', default: 30000 },
    },
    required: ['url'],
  },
};

export async function handleBrowserNavigate(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const allowExternal = process.env.BROWSER_ALLOW_EXTERNAL === 'true';
    const urlCheck = isUrlAllowed(args.url, allowExternal);
    if (!urlCheck.allowed) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'URL_BLOCKED', message: urlCheck.reason } }) }] };
    }

    const page = await getPage();
    const timeout = Math.min(Math.max(args.timeout || 30000, 5000), 60000);
    const waitUntil = args.waitUntil || 'domcontentloaded';

    const response = await page.goto(args.url, {
      waitUntil: waitUntil as 'domcontentloaded' | 'load' | 'networkidle',
      timeout,
    });

    const result = {
      success: true,
      url: page.url(),
      title: await page.title(),
      status: response?.status() || null,
      loadTimeMs: Date.now() - start,
    };

    logAudit('browser_navigate', `Navigated to ${args.url}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    const code = err.message?.includes('Timeout') ? 'NAVIGATION_TIMEOUT' : 'BROWSER_ERROR';
    logAudit('browser_navigate', err.message, false, code, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: err.message } }) }] };
  }
}
