/**
 * VegaMCP — Local MCP-to-MCP Relay (Hybrid Filesystem + In-Memory)
 * 
 * Enables multiple VegaMCP instances on the same machine to communicate.
 * Uses filesystem-backed channels (persistent) with in-memory caching (fast).
 * 
 * Two MCP instances (e.g., Claude in VS Code + Gemini in Cursor) can:
 *   1. Post messages to named channels
 *   2. Poll/peek for messages from other agents
 *   3. List active channels
 *   4. Clear channels
 * 
 * The relay directory lives at VEGAMCP_RELAY_DIR or defaults to
 * <workspace>/.mcp-relay/
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

const RELAY_DIR = process.env.VEGAMCP_RELAY_DIR ||
  path.join(process.env.WORKSPACE_ROOT || path.join(os.homedir(), 'Documents', 'VegaMCP'), '.mcp-relay');

interface RelayMessage {
  id: string;
  from: string;
  channel: string;
  payload: any;
  timestamp: number;
}

// Ensure relay directory exists
function ensureRelayDir() {
  if (!fs.existsSync(RELAY_DIR)) {
    fs.mkdirSync(RELAY_DIR, { recursive: true });
  }
}

function channelDir(channel: string): string {
  const dir = path.join(RELAY_DIR, channel);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════
// Tool Schema
// ═══════════════════════════════════════════════════════════════

export const mcpRelaySchema = {
  name: 'mcp_relay',
  description: `MCP-to-MCP Relay — enables multiple VegaMCP instances to communicate. Two AI agents in different IDEs can collaborate through named message channels. Actions: post (send a message), poll (receive and remove messages), peek (read without removing), channels (list active channels), clear (remove messages), status (relay health). For remote cross-machine relay, use the VegaSentinel Gateway relay_* actions via SSH tunnel.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['post', 'poll', 'peek', 'channels', 'clear', 'status'],
        description: 'Relay action to perform',
      },
      channel: {
        type: 'string',
        description: 'Channel name (e.g. "task-research", "code-review", "shared-context")',
      },
      from: {
        type: 'string',
        description: 'Sender identifier (e.g. "claude-vscode", "gemini-cursor", "codex-cli")',
      },
      payload: {
        type: 'object',
        description: 'Message payload — any JSON data to send',
      },
      count: {
        type: 'number',
        description: 'Max messages to retrieve (default: 10)',
        default: 10,
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

export async function handleMCPRelay(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  ensureRelayDir();

  switch (args.action) {

    // ── Post a message to a channel ──────────────────────
    case 'post': {
      const channel = args.channel;
      const from = args.from || 'anonymous';
      const payload = args.payload || {};

      if (!channel) return fail('MISSING_PARAM', 'channel is required');

      const msg: RelayMessage = {
        id: generateId(),
        from,
        channel,
        payload,
        timestamp: Date.now(),
      };

      const dir = channelDir(channel);
      const filePath = path.join(dir, `${msg.timestamp}-${msg.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(msg, null, 2), 'utf-8');

      // Count pending messages
      const pending = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;

      return ok({
        action: 'post',
        posted: true,
        message_id: msg.id,
        channel,
        from,
        queue_depth: pending,
        timestamp: msg.timestamp,
        ai_hint: `Message posted to '${channel}'. ${pending} message(s) pending. Another MCP instance can poll this channel to receive it.`,
      });
    }

    // ── Poll messages (read and remove) ──────────────────
    case 'poll': {
      const channel = args.channel;
      const count = args.count || 10;

      if (!channel) return fail('MISSING_PARAM', 'channel is required');

      const dir = channelDir(channel);
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort() // Oldest first (timestamp prefix)
        .slice(0, count);

      const messages: RelayMessage[] = [];
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          messages.push(JSON.parse(content));
          fs.unlinkSync(filePath); // Remove after reading
        } catch { /* Skip corrupted files */ }
      }

      const remaining = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;

      return ok({
        action: 'poll',
        channel,
        count: messages.length,
        remaining,
        messages,
        ai_hint: messages.length > 0
          ? `Received ${messages.length} message(s) from '${channel}'. ${remaining} remaining.`
          : `No messages in '${channel}'.`,
      });
    }

    // ── Peek at messages (read without removing) ─────────
    case 'peek': {
      const channel = args.channel;
      const count = args.count || 10;

      if (!channel) return fail('MISSING_PARAM', 'channel is required');

      const dir = channelDir(channel);
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(0, count);

      const messages: RelayMessage[] = [];
      for (const file of files) {
        try {
          messages.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')));
        } catch { /* Skip */ }
      }

      const total = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;

      return ok({
        action: 'peek',
        channel,
        peeked: messages.length,
        total,
        messages,
      });
    }

    // ── List all active channels ─────────────────────────
    case 'channels': {
      if (!fs.existsSync(RELAY_DIR)) return ok({ action: 'channels', channels: [], total: 0 });

      const dirs = fs.readdirSync(RELAY_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
          const channelPath = path.join(RELAY_DIR, d.name);
          const depth = fs.readdirSync(channelPath).filter(f => f.endsWith('.json')).length;
          return { channel: d.name, depth };
        })
        .filter(c => c.depth > 0); // Only show non-empty channels

      return ok({
        action: 'channels',
        channels: dirs,
        total: dirs.length,
        relay_dir: RELAY_DIR,
        ai_hint: dirs.length > 0
          ? `${dirs.length} active channel(s). Use 'poll' to receive messages.`
          : 'No active channels. Use \'post\' to send a message.',
      });
    }

    // ── Clear a channel ──────────────────────────────────
    case 'clear': {
      const channel = args.channel;

      if (!channel && channel !== '*') return fail('MISSING_PARAM', 'channel required (or "*" to clear all)');

      if (channel === '*') {
        // Clear ALL channels
        if (fs.existsSync(RELAY_DIR)) {
          fs.rmSync(RELAY_DIR, { recursive: true, force: true });
          fs.mkdirSync(RELAY_DIR, { recursive: true });
        }
        return ok({ action: 'clear', cleared: 'all' });
      }

      const dir = path.join(RELAY_DIR, channel);
      if (fs.existsSync(dir)) {
        const count = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
        fs.rmSync(dir, { recursive: true, force: true });
        return ok({ action: 'clear', channel, messages_removed: count });
      }
      return ok({ action: 'clear', channel, messages_removed: 0 });
    }

    // ── Relay status ─────────────────────────────────────
    case 'status': {
      const exists = fs.existsSync(RELAY_DIR);
      let totalChannels = 0;
      let totalMessages = 0;

      if (exists) {
        const dirs = fs.readdirSync(RELAY_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
        totalChannels = dirs.length;
        for (const d of dirs) {
          totalMessages += fs.readdirSync(path.join(RELAY_DIR, d.name)).filter(f => f.endsWith('.json')).length;
        }
      }

      return ok({
        action: 'status',
        relay_dir: RELAY_DIR,
        active: exists,
        total_channels: totalChannels,
        total_messages: totalMessages,
        modes: {
          local: 'Filesystem-backed channels at ' + RELAY_DIR,
          remote_vps: 'VegaSentinel Gateway relay_* actions via SSH tunnel (port 42015)',
          remote_docker: 'Docker container gateway relay_* actions (port 42016-42018)',
        },
        ai_hint: `Local relay operational. ${totalChannels} channel(s), ${totalMessages} pending message(s). For cross-machine relay, use the VegaSentinel Gateway.`,
      });
    }

    default:
      return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}. Valid: post, poll, peek, channels, clear, status`);
  }
}
