/**
 * VegaMCP — Browser Type Tool
 */

import { getPage } from './session.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const browserTypeSchema = {
  name: 'browser_type',
  description: 'Type text into an input field on the current page. First finds the element, clicks it to focus, then types. Optionally clear the field first and press Enter after.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector for the input field' },
      text: { type: 'string', description: 'Text to type into the field' },
      clearFirst: { type: 'boolean', description: 'Clear existing content before typing', default: true },
      pressEnter: { type: 'boolean', description: 'Press Enter after typing', default: false },
    },
    required: ['selector', 'text'],
  },
};

export async function handleBrowserType(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const page = await getPage();
    const locator = page.locator(args.selector);

    // Clear field if requested
    if (args.clearFirst !== false) {
      await locator.first().click({ clickCount: 3 }); // Triple-click to select all
      await page.keyboard.press('Backspace');
    }

    // Type the text
    await locator.first().fill(args.text);

    // Press Enter if requested
    if (args.pressEnter) {
      await page.keyboard.press('Enter');
    }

    const result = {
      success: true,
      typed: args.text.length > 50 ? args.text.slice(0, 50) + '...' : args.text,
      selector: args.selector,
      pressedEnter: args.pressEnter || false,
    };

    logAudit('browser_type', `Typed into ${args.selector}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    const code = err.message?.includes('Timeout') ? 'ELEMENT_NOT_FOUND' : 'BROWSER_ERROR';
    logAudit('browser_type', err.message, false, code, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: err.message } }) }] };
  }
}
