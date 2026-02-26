/**
 * VegaMCP — MCP Gateway / Proxy Layer
 * Centralized security, audit logging, rate limiting, and policy enforcement.
 * Wraps all tool calls with a middleware pipeline.
 */

import { getDb, saveDatabase } from '../db/graph-store.js';

export interface AuditEntry {
  id: string;
  timestamp: string;
  toolName: string;
  userId: string;
  args: Record<string, any>;
  durationMs: number;
  success: boolean;
  error?: string;
  blocked?: boolean;
  blockReason?: string;
}

export interface GatewayPolicy {
  toolName: string;
  allowedUsers: string[];     // Empty = all allowed
  blockedUsers: string[];
  maxCallsPerMinute: number;
  requireAuth: boolean;
  sensitiveArgFields: string[];  // Fields to redact in audit logs
}

let tablesInit = false;

function initTables(): void {
  if (tablesInit) return;
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS gateway_audit (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      tool_name TEXT NOT NULL,
      user_id TEXT DEFAULT 'anonymous',
      args_hash TEXT,
      duration_ms INTEGER DEFAULT 0,
      success INTEGER DEFAULT 1,
      error TEXT,
      blocked INTEGER DEFAULT 0,
      block_reason TEXT
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gateway_audit_time ON gateway_audit(timestamp);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_gateway_audit_tool ON gateway_audit(tool_name);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS gateway_policies (
      tool_name TEXT PRIMARY KEY,
      policy TEXT NOT NULL DEFAULT '{}'
    );
  `);
  saveDatabase();
  tablesInit = true;
}

// Rate limiting state
const callCounts = new Map<string, { count: number; resetAt: number }>();

function genId(): string {
  return `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Record an audit entry
 */
export function recordAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  initTables();
  const db = getDb();
  const id = genId();
  // Hash args to avoid storing sensitive data
  const argsHash = hashArgs(entry.args);
  db.run(
    `INSERT INTO gateway_audit (id, tool_name, user_id, args_hash, duration_ms, success, error, blocked, block_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, entry.toolName, entry.userId, argsHash, entry.durationMs, entry.success ? 1 : 0, entry.error || null, entry.blocked ? 1 : 0, entry.blockReason || null]
  );
  // Only save periodically to avoid I/O bottleneck
  if (Math.random() < 0.1) saveDatabase();
}

function hashArgs(args: Record<string, any>): string {
  const keys = Object.keys(args).sort().join(',');
  return `${keys}:${JSON.stringify(args).length}`;
}

/**
 * Check rate limit for a tool
 */
export function checkRateLimit(toolName: string, userId: string, maxPerMinute: number = 60): { allowed: boolean; remaining: number } {
  const key = `${toolName}:${userId}`;
  const now = Date.now();
  let entry = callCounts.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60000 };
    callCounts.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, maxPerMinute - entry.count);
  return { allowed: entry.count <= maxPerMinute, remaining };
}

/**
 * Detect potential prompt injection in tool arguments
 */
export function detectPromptInjection(args: Record<string, any>): { detected: boolean; field?: string; pattern?: string } {
  const suspiciousPatterns = [
    /ignore\s+(previous|all|above)\s+instructions/i,
    /you\s+are\s+now\s+a/i,
    /system\s*:\s*you\s+are/i,
    /\<\/?system\>/i,
    /ADMIN_OVERRIDE/i,
    /jailbreak/i,
    /pretend\s+you('re|\s+are)\s+(a|an)/i,
    /disregard\s+(all|any)\s+(prior|previous)/i,
  ];

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          return { detected: true, field: key, pattern: pattern.source };
        }
      }
    }
  }
  return { detected: false };
}

/**
 * Redact sensitive fields from args
 */
export function redactSensitive(args: Record<string, any>, sensitiveFields: string[]): Record<string, any> {
  const redacted = { ...args };
  for (const field of sensitiveFields) {
    if (redacted[field]) {
      redacted[field] = '***REDACTED***';
    }
  }
  return redacted;
}

/**
 * Get audit log entries
 */
export function getAuditLog(options: {
  toolName?: string;
  userId?: string;
  limit?: number;
  onlyBlocked?: boolean;
  since?: string;
}): AuditEntry[] {
  initTables();
  const db = getDb();
  let query = 'SELECT * FROM gateway_audit WHERE 1=1';
  const params: any[] = [];

  if (options.toolName) { query += ' AND tool_name = ?'; params.push(options.toolName); }
  if (options.userId) { query += ' AND user_id = ?'; params.push(options.userId); }
  if (options.onlyBlocked) { query += ' AND blocked = 1'; }
  if (options.since) { query += ' AND timestamp >= ?'; params.push(options.since); }
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(options.limit || 50);

  const rows = db.exec(query, params);
  if (!rows.length) return [];

  return rows[0].values.map((r: any[]) => {
    const obj: any = {};
    rows[0].columns.forEach((c: string, i: number) => obj[c] = r[i]);
    return {
      id: obj.id, timestamp: obj.timestamp, toolName: obj.tool_name,
      userId: obj.user_id, args: {}, durationMs: obj.duration_ms,
      success: !!obj.success, error: obj.error,
      blocked: !!obj.blocked, blockReason: obj.block_reason,
    };
  });
}

/**
 * Get gateway metrics summary
 */
export function getGatewayMetrics(): Record<string, any> {
  initTables();
  const db = getDb();

  const total = db.exec(`SELECT COUNT(*) FROM gateway_audit`);
  const blocked = db.exec(`SELECT COUNT(*) FROM gateway_audit WHERE blocked = 1`);
  const failed = db.exec(`SELECT COUNT(*) FROM gateway_audit WHERE success = 0`);
  const topTools = db.exec(`SELECT tool_name, COUNT(*) as cnt FROM gateway_audit GROUP BY tool_name ORDER BY cnt DESC LIMIT 10`);
  const avgDuration = db.exec(`SELECT AVG(duration_ms) FROM gateway_audit WHERE success = 1`);

  return {
    totalCalls: total.length > 0 ? total[0].values[0][0] : 0,
    blockedCalls: blocked.length > 0 ? blocked[0].values[0][0] : 0,
    failedCalls: failed.length > 0 ? failed[0].values[0][0] : 0,
    avgDurationMs: avgDuration.length > 0 ? Math.round(avgDuration[0].values[0][0] as number) : 0,
    topTools: topTools.length > 0 ? topTools[0].values.map((r: any[]) => ({ tool: r[0], calls: r[1] })) : [],
  };
}

// Tool Schema & Handler
export const gatewaySchema = {
  name: 'gateway',
  description: 'MCP Gateway — centralized security, audit logging, rate limiting, and policy enforcement. Query audit logs, view metrics, detect prompt injections, and manage policies.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['audit_log', 'metrics', 'check_injection', 'rate_status'] },
      tool_name: { type: 'string', description: 'Filter by tool (for audit_log)' },
      user_id: { type: 'string', description: 'Filter by user (for audit_log)' },
      limit: { type: 'number', description: 'Max results (default: 50)' },
      only_blocked: { type: 'boolean', description: 'Only show blocked calls' },
      text: { type: 'string', description: 'Text to check for prompt injection' },
    },
    required: ['action'],
  },
};

export function handleGateway(args: any): string {
  try {
    switch (args.action) {
      case 'audit_log':
        return JSON.stringify({ success: true, entries: getAuditLog({
          toolName: args.tool_name, userId: args.user_id,
          limit: args.limit, onlyBlocked: args.only_blocked,
        })});
      case 'metrics':
        return JSON.stringify({ success: true, metrics: getGatewayMetrics() });
      case 'check_injection':
        if (!args.text) return JSON.stringify({ success: false, error: 'text required' });
        const result = detectPromptInjection({ text: args.text });
        return JSON.stringify({ success: true, ...result });
      case 'rate_status': {
        const status: Record<string, any> = {};
        for (const [key, val] of callCounts.entries()) {
          status[key] = { count: val.count, resetsIn: Math.max(0, val.resetAt - Date.now()) };
        }
        return JSON.stringify({ success: true, rateLimits: status });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
