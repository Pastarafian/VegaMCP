/**
 * VegaMCP — Browser Console Logs Tool
 */

import { drainConsoleLogs } from './session.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { sanitizeExternalOutput } from '../../security/input-validator.js';
import { logAudit } from '../../db/graph-store.js';

export const browserConsoleLogsSchema = {
  name: 'browser_console_logs',
  description: 'Retrieve all console messages (log, warn, error, info) captured since the last call to this tool or since navigation. Also includes uncaught exceptions and unhandled promise rejections. The buffer is cleared after reading.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      level: { type: 'string', enum: ['all', 'log', 'warn', 'error', 'info'], default: 'all' },
    },
  },
};

export async function handleBrowserConsoleLogs(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('browser');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const { logs, uncaughtExceptions } = drainConsoleLogs(args.level);

    // Sanitize console output to prevent prompt injection
    const sanitizedLogs = logs.map(log => ({
      ...log,
      text: sanitizeExternalOutput(log.text, 2000),
    }));

    const sanitizedExceptions = uncaughtExceptions.map(ex => ({
      ...ex,
      message: sanitizeExternalOutput(ex.message, 2000),
    }));

    const result = {
      success: true,
      logCount: sanitizedLogs.length,
      logs: sanitizedLogs,
      uncaughtExceptions: sanitizedExceptions,
    };

    logAudit('browser_console_logs', `Retrieved ${logs.length} logs`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('browser_console_logs', err.message, false, 'BROWSER_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'BROWSER_ERROR', message: err.message } }) }] };
  }
}
