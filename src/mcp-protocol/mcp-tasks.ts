/**
 * VegaMCP — MCP Tasks / Async Operations (SEP-1686)
 * "Call-now, fetch-later" pattern for long-running tool calls.
 * Tools return a taskId immediately; clients poll for status and results.
 */

import { getDb, saveDatabase } from '../db/graph-store.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MCPTask {
  id: string;
  toolName: string;
  status: TaskStatus;
  progress: number;       // 0-100
  progressMessage?: string;
  args: Record<string, any>;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  ttlMs: number;          // Result cache TTL
}

let tablesInit = false;

function initTables(): void {
  if (tablesInit) return;
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_tasks (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      progress_message TEXT,
      args TEXT DEFAULT '{}',
      result TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      ttl_ms INTEGER DEFAULT 300000
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_tasks_status ON mcp_tasks(status);`);
  saveDatabase();
  tablesInit = true;
}

function genTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// In-memory running tasks (for cancellation)
const runningTasks = new Map<string, { cancel: () => void }>();

/**
 * Create a new async task
 */
export function createTask(toolName: string, args: Record<string, any>, ttlMs: number = 300000): MCPTask {
  initTables();
  const db = getDb();
  const id = genTaskId();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO mcp_tasks (id, tool_name, status, args, created_at, updated_at, ttl_ms) VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    [id, toolName, JSON.stringify(args), now, now, ttlMs]
  );
  saveDatabase();

  return { id, toolName, status: 'pending', progress: 0, args, createdAt: now, updatedAt: now, ttlMs };
}

/**
 * Update task progress
 */
export function updateTaskProgress(taskId: string, progress: number, message?: string): void {
  initTables();
  const db = getDb();
  db.run(
    `UPDATE mcp_tasks SET progress = ?, progress_message = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
    [Math.min(100, Math.max(0, progress)), message || null, taskId]
  );
  saveDatabase();
}

/**
 * Complete a task with results
 */
export function completeTask(taskId: string, result: any): void {
  initTables();
  const db = getDb();
  db.run(
    `UPDATE mcp_tasks SET status = 'completed', progress = 100, result = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify(result), taskId]
  );
  saveDatabase();
  runningTasks.delete(taskId);
}

/**
 * Fail a task
 */
export function failTask(taskId: string, error: string): void {
  initTables();
  const db = getDb();
  db.run(
    `UPDATE mcp_tasks SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`,
    [error, taskId]
  );
  saveDatabase();
  runningTasks.delete(taskId);
}

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): boolean {
  initTables();
  const running = runningTasks.get(taskId);
  if (running) {
    running.cancel();
    runningTasks.delete(taskId);
  }
  const db = getDb();
  db.run(
    `UPDATE mcp_tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'running')`,
    [taskId]
  );
  saveDatabase();
  return true;
}

/**
 * Get task status
 */
export function getTask(taskId: string): MCPTask | null {
  initTables();
  const db = getDb();
  const rows = db.exec(`SELECT * FROM mcp_tasks WHERE id = ?`, [taskId]);
  if (!rows.length || !rows[0].values.length) return null;

  const r = rows[0].values[0];
  const cols = rows[0].columns;
  const obj: any = {};
  cols.forEach((c: string, i: number) => obj[c] = r[i]);

  return {
    id: obj.id,
    toolName: obj.tool_name,
    status: obj.status as TaskStatus,
    progress: obj.progress || 0,
    progressMessage: obj.progress_message,
    args: JSON.parse(obj.args || '{}'),
    result: obj.result ? JSON.parse(obj.result) : undefined,
    error: obj.error,
    createdAt: obj.created_at,
    updatedAt: obj.updated_at,
    completedAt: obj.completed_at,
    ttlMs: obj.ttl_ms || 300000,
  };
}

/**
 * List tasks with optional status filter
 */
export function listTasks(status?: TaskStatus, limit: number = 20): MCPTask[] {
  initTables();
  const db = getDb();
  const query = status
    ? `SELECT * FROM mcp_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM mcp_tasks ORDER BY created_at DESC LIMIT ?`;
  const params = status ? [status, limit] : [limit];
  const rows = db.exec(query, params);
  if (!rows.length) return [];

  return rows[0].values.map((r: any[]) => {
    const obj: any = {};
    rows[0].columns.forEach((c: string, i: number) => obj[c] = r[i]);
    return {
      id: obj.id, toolName: obj.tool_name, status: obj.status as TaskStatus,
      progress: obj.progress || 0, progressMessage: obj.progress_message,
      args: JSON.parse(obj.args || '{}'),
      result: obj.result ? JSON.parse(obj.result) : undefined,
      error: obj.error, createdAt: obj.created_at, updatedAt: obj.updated_at,
      completedAt: obj.completed_at, ttlMs: obj.ttl_ms || 300000,
    };
  });
}

/**
 * Run a tool asynchronously — returns taskId immediately, executes in background
 */
export function runAsync(
  toolName: string,
  args: Record<string, any>,
  executor: (task: MCPTask, updateProgress: (p: number, msg?: string) => void) => Promise<any>,
  ttlMs: number = 300000
): MCPTask {
  const task = createTask(toolName, args, ttlMs);

  let cancelled = false;
  runningTasks.set(task.id, { cancel: () => { cancelled = true; } });

  // Execute in background (non-blocking)
  (async () => {
    try {
      updateTaskProgress(task.id, 0, 'Starting...');
      const result = await executor(task, (p, msg) => {
        if (cancelled) throw new Error('Task cancelled');
        updateTaskProgress(task.id, p, msg);
      });
      if (!cancelled) completeTask(task.id, result);
    } catch (err: any) {
      if (cancelled) {
        cancelTask(task.id);
      } else {
        failTask(task.id, err.message);
      }
    }
  })();

  return task;
}

/**
 * Clean up expired tasks
 */
export function cleanupTasks(): number {
  initTables();
  const db = getDb();
  // Delete completed/failed tasks older than their TTL
  const result = db.exec(`
    SELECT COUNT(*) FROM mcp_tasks 
    WHERE (status IN ('completed', 'failed', 'cancelled'))
    AND datetime(updated_at, '+' || (ttl_ms / 1000) || ' seconds') < datetime('now')
  `);
  const count = result.length > 0 ? (result[0].values[0][0] as number) : 0;

  db.run(`
    DELETE FROM mcp_tasks 
    WHERE (status IN ('completed', 'failed', 'cancelled'))
    AND datetime(updated_at, '+' || (ttl_ms / 1000) || ' seconds') < datetime('now')
  `);
  saveDatabase();
  return count;
}

// ── Tool Schema & Handler ──

export const mcpTasksSchema = {
  name: 'mcp_tasks',
  description: 'Manage async MCP tasks. Submit long-running operations, check status, get results, cancel tasks, and clean up expired entries.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['status', 'list', 'cancel', 'cleanup', 'result'] },
      task_id: { type: 'string', description: 'Task ID (for status/cancel/result)' },
      status_filter: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], description: 'Filter by status (for list)' },
      limit: { type: 'number', description: 'Max results (default: 20)' },
    },
    required: ['action'],
  },
};

export function handleMCPTasks(args: any): string {
  try {
    switch (args.action) {
      case 'status': {
        if (!args.task_id) return JSON.stringify({ success: false, error: 'task_id required' });
        const task = getTask(args.task_id);
        if (!task) return JSON.stringify({ success: false, error: 'Task not found' });
        return JSON.stringify({ success: true, task: { ...task, args: undefined } });
      }
      case 'result': {
        if (!args.task_id) return JSON.stringify({ success: false, error: 'task_id required' });
        const task = getTask(args.task_id);
        if (!task) return JSON.stringify({ success: false, error: 'Task not found' });
        if (task.status !== 'completed') {
          return JSON.stringify({ success: true, status: task.status, progress: task.progress, message: 'Task not yet complete' });
        }
        return JSON.stringify({ success: true, result: task.result });
      }
      case 'list': {
        const tasks = listTasks(args.status_filter, args.limit || 20);
        return JSON.stringify({
          success: true,
          tasks: tasks.map(t => ({ id: t.id, toolName: t.toolName, status: t.status, progress: t.progress, createdAt: t.createdAt })),
          count: tasks.length,
        });
      }
      case 'cancel': {
        if (!args.task_id) return JSON.stringify({ success: false, error: 'task_id required' });
        cancelTask(args.task_id);
        return JSON.stringify({ success: true, message: `Task ${args.task_id} cancelled` });
      }
      case 'cleanup': {
        const cleaned = cleanupTasks();
        return JSON.stringify({ success: true, message: `Cleaned up ${cleaned} expired tasks` });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
