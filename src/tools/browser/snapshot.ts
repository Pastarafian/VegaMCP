/**
 * VegaMCP — Browser Accessibility Snapshot Tool
 */

import { getPage } from './session.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const browserSnapshotSchema = {
  name: 'browser_snapshot',
  description: 'Get a structured accessibility snapshot of the current page. Returns the DOM as an accessibility tree that LLMs can reason about — far more useful than screenshots for understanding page structure, finding interactive elements, and detecting layout issues. This is the PREFERRED tool for understanding page content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      root: { type: 'string', description: 'Optional CSS selector to scope the snapshot to a subtree' },
    },
  },
};

export async function handleBrowserSnapshot(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const page = await getPage();

    // Get accessibility snapshot using aria snapshot
    let snapshotText: string;
    if (args.root) {
      const rootLocator = page.locator(args.root);
      const count = await rootLocator.count();
      if (count === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'ELEMENT_NOT_FOUND', message: `No element matching root selector: ${args.root}` } }) }] };
      }
      snapshotText = await rootLocator.first().ariaSnapshot();
    } else {
      snapshotText = await page.locator('body').ariaSnapshot();
    }

    const result = {
      success: true,
      url: page.url(),
      title: await page.title(),
      snapshot: snapshotText || 'Empty page',
    };

    logAudit('browser_snapshot', `Snapshot of ${page.url()}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('browser_snapshot', err.message, false, 'BROWSER_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'BROWSER_ERROR', message: err.message } }) }] };
  }
}
