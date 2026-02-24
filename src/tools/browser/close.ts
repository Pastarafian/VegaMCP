/**
 * VegaMCP — Browser Close Tool
 */

import { closeBrowser, isBrowserActive } from './session.js';
import { logAudit } from '../../db/graph-store.js';

export const browserCloseSchema = {
  name: 'browser_close',
  description: 'Close the headless browser session and release all resources. The browser will be re-launched automatically on the next browser tool call. Use this to reset state or free memory.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleBrowserClose(): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  try {
    const wasActive = isBrowserActive();
    await closeBrowser();

    const result = {
      success: true,
      message: wasActive
        ? 'Browser session closed and resources released.'
        : 'No active browser session to close.',
    };

    logAudit('browser_close', wasActive ? 'Closed active session' : 'No session to close', true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('browser_close', err.message, false, 'BROWSER_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'BROWSER_ERROR', message: err.message } }) }] };
  }
}
