/**
 * VegaMCP — Browser Screenshot Tool
 */

import { getPage } from './session.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

export const browserScreenshotSchema = {
  name: 'browser_screenshot',
  description: 'Capture a screenshot of the current browser page. Returns the image as a base64-encoded PNG. Use this to visually verify UI layout, check for rendering errors, or document the current state.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      fullPage: { type: 'boolean', description: 'Capture entire scrollable page (true) or viewport only (false)', default: false },
      selector: { type: 'string', description: 'Optional: capture only a specific element by CSS selector' },
    },
  },
};

export async function handleBrowserScreenshot(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const page = await getPage();
    let buffer: Buffer;

    if (args.selector) {
      const element = page.locator(args.selector).first();
      buffer = await element.screenshot({ type: 'png' });
    } else {
      buffer = await page.screenshot({
        type: 'png',
        fullPage: args.fullPage || false,
      });
    }

    const base64 = buffer.toString('base64');

    logAudit('browser_screenshot', `Screenshot captured (${buffer.length} bytes)`, true, undefined, Date.now() - start);
    return {
      content: [
        {
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        },
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            sizeBytes: buffer.length,
            fullPage: args.fullPage || false,
            selector: args.selector || null,
          }),
        },
      ],
    };
  } catch (err: any) {
    logAudit('browser_screenshot', err.message, false, 'BROWSER_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'BROWSER_ERROR', message: err.message } }) }] };
  }
}
