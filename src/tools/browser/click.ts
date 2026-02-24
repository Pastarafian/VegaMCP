/**
 * VegaMCP — Browser Click Tool
 */

import { getPage } from './session.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const browserClickSchema = {
  name: 'browser_click',
  description: 'Click an element on the current page. You can target by CSS selector, text content, or accessibility role. If the element is not found, returns an error with available alternatives.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector to find the element' },
      text: { type: 'string', description: 'Alternative: find element by exact text content' },
      role: { type: 'string', description: 'Alternative: find element by ARIA role' },
      timeout: { type: 'number', description: 'Max wait time for element (ms)', default: 5000 },
    },
  },
};

export async function handleBrowserClick(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const page = await getPage();
    const timeout = Math.min(args.timeout || 5000, 30000);

    let locator;
    let description = '';

    if (args.selector) {
      locator = page.locator(args.selector);
      description = `selector: ${args.selector}`;
    } else if (args.text) {
      locator = page.getByText(args.text, { exact: true });
      description = `text: "${args.text}"`;
    } else if (args.role) {
      locator = page.getByRole(args.role as any);
      description = `role: ${args.role}`;
    } else {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'Provide at least one of: selector, text, or role' } }) }] };
    }

    await locator.first().click({ timeout });

    const element = await locator.first().evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim()?.slice(0, 100) || '',
      id: el.id || undefined,
    })).catch(() => null);

    const result = {
      success: true,
      clicked: description,
      element: element || { tag: 'unknown' },
    };

    logAudit('browser_click', `Clicked ${description}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    // Try to provide helpful alternatives
    let hint: string | undefined;
    try {
      const page = await getPage();
      const buttons = await page.locator('button, a, [role="button"]').allTextContents();
      const visible = buttons.filter(t => t.trim()).slice(0, 10);
      if (visible.length > 0) {
        hint = `Available clickable elements: ${JSON.stringify(visible)}`;
      }
    } catch { }

    const code = err.message?.includes('Timeout') ? 'ELEMENT_NOT_FOUND' : 'BROWSER_ERROR';
    logAudit('browser_click', err.message, false, code, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: err.message, hint } }) }] };
  }
}
