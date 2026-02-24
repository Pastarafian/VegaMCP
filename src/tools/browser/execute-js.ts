/**
 * VegaMCP — Browser Execute JS Tool
 */

import { getPage } from './session.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { validateString } from '../../security/input-validator.js';
import { logAudit } from '../../db/graph-store.js';

export const browserExecuteJsSchema = {
  name: 'browser_execute_js',
  description: 'Execute JavaScript code in the browser page context. Returns the serialized result. Use for reading DOM state, checking variable values, triggering events, or any custom interaction not covered by other tools.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute. Must be a single expression or IIFE that returns a value.' },
    },
    required: ['code'],
  },
};

export async function handleBrowserExecuteJs(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const codeCheck = validateString(args.code, 'jsCode', 'code');
    if (!codeCheck.valid) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: codeCheck.error } }) }] };
    }

    const page = await getPage();
    const result = await page.evaluate(codeCheck.value!);

    const serialized = JSON.stringify(result, null, 2);

    logAudit('browser_execute_js', `Executed JS (${codeCheck.value!.length} chars)`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: result ?? null, resultType: typeof result }, null, 2) }] };
  } catch (err: any) {
    logAudit('browser_execute_js', err.message, false, 'EXECUTION_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'EXECUTION_ERROR', message: err.message } }) }] };
  }
}
