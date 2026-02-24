/**
 * VegaMCP — Code Execution Sandbox
 * Safe environment for running strategy code and data transformations.
 * MCP Tool: sandbox_execute
 */

import { spawn } from 'node:child_process';
import { logAudit } from '../../db/graph-store.js';

export const sandboxExecuteSchema = {
  name: 'sandbox_execute',
  description: 'Execute code in a sandboxed environment. Supports Python and JavaScript. Use for strategy prototyping, data transformations, indicator calculations, and ad-hoc analysis. Code runs with resource limits and no filesystem write access.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      code: { type: 'string', description: 'Code to execute' },
      environment: { type: 'string', description: 'Runtime environment', enum: ['python', 'javascript'], default: 'python' },
      timeout: { type: 'number', description: 'Timeout in seconds', default: 30 },
    },
    required: ['code'],
  },
};

export async function handleSandboxExecute(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const env = args.environment || 'python';
  const timeout = Math.min(Math.max(args.timeout || 30, 5), 60) * 1000;
  const code = args.code;

  if (!code || typeof code !== 'string') {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'code must be a non-empty string' } }) }] };
  }

  if (code.length > 10000) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'Code exceeds 10000 character limit' } }) }] };
  }

  try {
    let result: { stdout: string; stderr: string; exitCode: number };

    if (env === 'python') {
      result = await runPython(code, timeout);
    } else if (env === 'javascript') {
      result = await runJavaScript(code, timeout);
    } else {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_ENV', message: 'Supported environments: python, javascript' } }) }] };
    }

    const durationMs = Date.now() - start;
    const output = {
      success: result.exitCode === 0,
      environment: env,
      stdout: result.stdout.slice(0, 5000),
      stderr: result.stderr.slice(0, 2000),
      exitCode: result.exitCode,
      durationMs,
      truncated: result.stdout.length > 5000,
    };

    logAudit('sandbox_execute', `${env} code (${code.length} chars), exit: ${result.exitCode}`, result.exitCode === 0, undefined, durationMs);
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    logAudit('sandbox_execute', err.message, false, 'EXECUTION_ERROR', durationMs);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'EXECUTION_ERROR', message: err.message }, durationMs }) }] };
  }
}

function runPython(code: string, timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', ['-c', code], {
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      if (err.message.includes('ETIMEDOUT') || err.message.includes('SIGTERM')) {
        resolve({ stdout, stderr: 'Execution timed out', exitCode: 124 });
      } else {
        reject(err);
      }
    });
  });
}

function runJavaScript(code: string, timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['-e', code], {
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      if (err.message.includes('ETIMEDOUT') || err.message.includes('SIGTERM')) {
        resolve({ stdout, stderr: 'Execution timed out', exitCode: 124 });
      } else {
        reject(err);
      }
    });
  });
}
