/**
 * VegaMCP — File System Watchers
 * Monitor file changes and trigger swarm tasks automatically.
 * MCP Tools: watcher_create, watcher_list, watcher_delete
 */

import fs from 'node:fs';
import path from 'node:path';
import { logAudit } from '../../db/graph-store.js';

// ═══════════════════════════════════════════════
// WATCHER STATE
// ═══════════════════════════════════════════════

interface WatcherConfig {
  id: string;
  path: string;
  events: string[];
  action: {
    type: 'create_task' | 'broadcast_message';
    task_type?: string;
    priority?: number;
    message?: string;
  };
  cooldown: number;
  enabled: boolean;
  lastFired: number;
  watcher: fs.FSWatcher | null;
}

const activeWatchers: Map<string, WatcherConfig> = new Map();

function generateWatcherId(): string {
  return `watch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ═══════════════════════════════════════════════
// MCP TOOLS
// ═══════════════════════════════════════════════

export const watcherCreateSchema = {
  name: 'watcher_create',
  description: 'Create a file system watcher that triggers swarm tasks when files change. Monitor strategy files, config changes, signal files, or logs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'File or directory path to watch' },
      action_type: { type: 'string', description: 'Action on change', enum: ['create_task', 'broadcast_message'] },
      task_type: { type: 'string', description: 'Task type to create (if action_type = create_task)' },
      priority: { type: 'number', description: 'Task priority', default: 2 },
      message: { type: 'string', description: 'Message to broadcast (if action_type = broadcast_message)' },
      cooldown: { type: 'number', description: 'Minimum seconds between triggers', default: 60 },
    },
    required: ['path', 'action_type'],
  },
};

export async function handleWatcherCreate(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  try {
    const watchPath = path.resolve(args.path);

    if (!fs.existsSync(watchPath)) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'PATH_NOT_FOUND', message: `Path not found: ${watchPath}` } }) }] };
    }

    const id = generateWatcherId();
    const config: WatcherConfig = {
      id,
      path: watchPath,
      events: ['change'],
      action: {
        type: args.action_type,
        task_type: args.task_type,
        priority: args.priority || 2,
        message: args.message,
      },
      cooldown: args.cooldown || 60,
      enabled: true,
      lastFired: 0,
      watcher: null,
    };

    // Create the watcher
    try {
      const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        const now = Date.now();
        if (now - config.lastFired < config.cooldown * 1000) return;
        config.lastFired = now;

        console.error(`[Watcher ${id}] File changed: ${filename} (${eventType})`);

        // Action will be handled by the orchestrator on next poll
        // For now, log the event
        logAudit('watcher_event', `${filename} ${eventType} in ${watchPath}`, true);
      });

      config.watcher = watcher;
    } catch (err: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'WATCH_FAILED', message: err.message } }) }] };
    }

    activeWatchers.set(id, config);

    logAudit('watcher_create', `Created watcher ${id} on ${watchPath}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true,
      watcher_id: id,
      path: watchPath,
      action: config.action,
      cooldown: config.cooldown,
    }, null, 2) }] };
  } catch (err: any) {
    logAudit('watcher_create', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}

export const watcherListSchema = {
  name: 'watcher_list',
  description: 'List all active file system watchers.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleWatcherList(): Promise<{ content: Array<{ type: string; text: string }> }> {
  const watchers = Array.from(activeWatchers.values()).map(w => ({
    id: w.id,
    path: w.path,
    action: w.action,
    cooldown: w.cooldown,
    enabled: w.enabled,
    lastFired: w.lastFired ? new Date(w.lastFired).toISOString() : null,
  }));

  return { content: [{ type: 'text', text: JSON.stringify({ success: true, watchers, count: watchers.length }, null, 2) }] };
}

export const watcherDeleteSchema = {
  name: 'watcher_delete',
  description: 'Delete a file system watcher by ID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      watcher_id: { type: 'string', description: 'Watcher ID to delete' },
    },
    required: ['watcher_id'],
  },
};

export async function handleWatcherDelete(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const watcher = activeWatchers.get(args.watcher_id);
  if (!watcher) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Watcher ${args.watcher_id} not found` } }) }] };
  }

  if (watcher.watcher) {
    watcher.watcher.close();
  }
  activeWatchers.delete(args.watcher_id);

  logAudit('watcher_delete', `Deleted watcher ${args.watcher_id}`, true);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, watcher_id: args.watcher_id }) }] };
}

/**
 * Close all watchers on shutdown.
 */
export function closeAllWatchers(): void {
  for (const [id, config] of activeWatchers) {
    if (config.watcher) {
      config.watcher.close();
    }
  }
  activeWatchers.clear();
}
