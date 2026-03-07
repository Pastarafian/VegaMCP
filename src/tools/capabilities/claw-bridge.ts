/**
 * VegaMCP — The Claw Command Center Bridge
 * 
 * Connects VegaMCP tools to The Claw's HTTP API running on the Linux VPS.
 * Enables any MCP client to:
 *   - Chat with The Claw's AI (with thinking + streaming)
 *   - Execute commands on the VPS
 *   - Manage workspaces
 *   - Run verifications (lint, test)
 *   - Create plans and execute steps
 *   - Search memory (SQLite FTS5)
 *   - Switch AI models
 *   - Browse the web
 *   - Generate tests
 *   - Get repo maps
 *   - View logs and metrics
 */

import http from 'http';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const CLAW_HOST = process.env.CLAW_HOST || 'localhost';
const CLAW_PORT = parseInt(process.env.CLAW_PORT || '4280');
const CLAW_HOST_FALLBACK = '185.249.74.99';

// ═══════════════════════════════════════════════════════════════
// HTTP Client for The Claw API
// ═══════════════════════════════════════════════════════════════

function clawApi(path: string, method: string = 'GET', body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const tryHost = (host: string) => {
      const req = http.request({
        hostname: host,
        port: CLAW_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: 10000,
      }, (res) => {
        let responseData = '';
        res.on('data', (chunk: Buffer) => responseData += chunk.toString());
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch {
            resolve(responseData);
          }
        });
      });
      req.on('error', (e: Error) => {
        if (host === CLAW_HOST && CLAW_HOST !== CLAW_HOST_FALLBACK) {
          // Try fallback
          tryHost(CLAW_HOST_FALLBACK);
        } else {
          reject(new Error(`Claw API error: ${e.message}`));
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (host === CLAW_HOST && CLAW_HOST !== CLAW_HOST_FALLBACK) {
          tryHost(CLAW_HOST_FALLBACK);
        } else {
          reject(new Error('Claw API timeout'));
        }
      });
      if (data) req.write(data);
      req.end();
    };
    tryHost(CLAW_HOST);
  });
}

// ═══════════════════════════════════════════════════════════════
// Tool Schema
// ═══════════════════════════════════════════════════════════════

export const clawBridgeSchema = {
  name: 'claw_command_center',
  description: `Bridge to The Claw Command Center running on the Linux VPS. Provides AI chat (with DeepSeek-style thinking), command execution, workspace management, code verification, plan/execute mode, memory search, model switching, web browsing, test generation, and repo mapping. Actions: chat, exec, status, metrics, logs, search, messages, models, workspace.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['chat', 'exec', 'status', 'metrics', 'logs', 'search', 'messages', 'models', 'workspace', 'mode', 'session', 'screenshot', 'health'],
        description: 'API action to perform',
      },
      // Chat
      message: { type: 'string', description: 'Message to send to The Claw AI (for chat action)' },
      // Exec
      command: { type: 'string', description: 'Shell command to execute on VPS (for exec action)' },
      // Search
      query: { type: 'string', description: 'Search query for memory/FTS5 (for search action)' },
      // Messages
      since_id: { type: 'number', description: 'Fetch messages after this ID (for messages action)' },
      // Workspace
      workspace_action: {
        type: 'string',
        enum: ['open', 'list', 'files'],
        description: 'Workspace sub-action',
      },
      workspace_name: { type: 'string', description: 'Workspace name to open' },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════════════════════
// Response helpers
// ═══════════════════════════════════════════════════════════════

function ok(data: any) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }], isError: true };
}

// ═══════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════

export async function handleClawBridge(args: any) {
  const { action } = args;

  try {
    switch (action) {
      case 'chat': {
        if (!args.message) return fail('MISSING_MESSAGE', 'Provide a message to chat with The Claw.');
        const result = await clawApi('/api/chat', 'POST', { text: args.message });
        return ok({
          response: result.text || result.response || result,
          model: result.model,
          thinking: result.thinking,
        });
      }

      case 'exec': {
        if (!args.command) return fail('MISSING_COMMAND', 'Provide a command to execute.');
        const result = await clawApi('/api/exec', 'POST', { command: args.command });
        return ok(result);
      }

      case 'status': {
        const stats = await clawApi('/api/stats');
        const metrics = await clawApi('/api/metrics');
        return ok({ stats, metrics });
      }

      case 'metrics': {
        const metrics = await clawApi('/api/metrics');
        return ok(metrics);
      }

      case 'logs': {
        const logs = await clawApi('/api/logs');
        return ok(logs);
      }

      case 'search': {
        if (!args.query) return fail('MISSING_QUERY', 'Provide a search query.');
        const results = await clawApi(`/api/search?q=${encodeURIComponent(args.query)}`);
        return ok(results);
      }

      case 'messages': {
        const sinceId = args.since_id || 0;
        const messages = await clawApi(`/api/messages?since=${sinceId}`);
        return ok(messages);
      }

      case 'models': {
        return ok({
          available: [
            { key: 'llama3', label: 'Llama 3 (local)', provider: 'ollama' },
            { key: 'qwen', label: 'Qwen 2.5 Coder (local)', provider: 'ollama' },
            { key: 'deepseek', label: 'DeepSeek Chat (cloud)', provider: 'deepseek' },
            { key: 'deepseek-r1', label: 'DeepSeek R1 Reasoner (cloud)', provider: 'deepseek' },
          ],
          note: 'Use chat action with "use model [name]" to switch models.',
        });
      }

      case 'workspace': {
        const sub = args.workspace_action || 'list';
        if (sub === 'open' && args.workspace_name) {
          return ok(await clawApi('/api/chat', 'POST', { text: `open ${args.workspace_name}` }));
        } else if (sub === 'files') {
          return ok(await clawApi('/api/chat', 'POST', { text: 'list files' }));
        } else {
          return ok(await clawApi('/api/chat', 'POST', { text: 'show workspaces' }));
        }
      }

      case 'mode': {
        if (args.message) {
          // Set mode
          const result = await clawApi('/api/mode', 'POST', { mode: args.message });
          return ok(result);
        }
        // Get modes
        const modes = await clawApi('/api/mode');
        return ok(modes);
      }

      case 'session': {
        const session = await clawApi('/api/session');
        return ok(session);
      }

      case 'screenshot': {
        return ok(await clawApi('/api/chat', 'POST', { text: 'screenshot' }));
      }

      case 'health': {
        return ok(await clawApi('/api/chat', 'POST', { text: 'health check' }));
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${action}. Available: chat, exec, status, metrics, logs, search, messages, models, workspace`);
    }
  } catch (e: any) {
    return fail('API_ERROR', `Failed to reach VegaClaw Command Center (tried ${CLAW_HOST}:${CLAW_PORT} and ${CLAW_HOST_FALLBACK}:${CLAW_PORT}). Run 'node scripts/vps-tunnel.js' to start the SSH tunnel, or check VPS status.`);
  }
}
