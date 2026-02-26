/**
 * VegaMCP — Zero-Trust Agent Identity
 * Each swarm agent gets its own unique identity, scoped permissions,
 * behavioral monitoring, and lifecycle management.
 */

import { getDb, saveDatabase } from '../db/graph-store.js';

export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  permissions: AgentPermission[];
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  lastActiveAt: string;
  behaviorProfile: BehaviorProfile;
  tokenHash?: string;
}

export interface AgentPermission {
  resource: string;       // Tool name, resource URI, or wildcard
  actions: string[];      // 'read', 'write', 'execute', etc.
  conditions?: Record<string, any>;
}

export interface BehaviorProfile {
  totalActions: number;
  actionHistory: string[];     // Last N actions
  anomalyScore: number;        // 0-100, higher = more anomalous
  avgActionsPerMinute: number;
  lastAnomalyCheck: string;
  flags: string[];             // Behavioral flags
}

export interface AuditEvent {
  agentId: string;
  action: string;
  resource: string;
  allowed: boolean;
  timestamp: string;
  reason?: string;
}

let tablesInit = false;

function initTables(): void {
  if (tablesInit) return;
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_identities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      behavior_profile TEXT DEFAULT '{}',
      token_hash TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      allowed INTEGER DEFAULT 1,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      reason TEXT
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON agent_audit_log(agent_id);`);
  saveDatabase();
  tablesInit = true;
}

function genId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function genToken(): string {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(Math.random().toString(36).slice(2));
  return `vega-${parts.join('')}`;
}

/**
 * Provision a new agent identity
 */
export function provisionAgent(name: string, role: string, permissions: AgentPermission[]): { identity: AgentIdentity; token: string } {
  initTables();
  const db = getDb();
  const id = genId();
  const token = genToken();
  const tokenHash = simpleHash(token);
  const now = new Date().toISOString();

  const identity: AgentIdentity = {
    id, name, role, permissions,
    status: 'active',
    createdAt: now, lastActiveAt: now,
    behaviorProfile: {
      totalActions: 0, actionHistory: [], anomalyScore: 0,
      avgActionsPerMinute: 0, lastAnomalyCheck: now, flags: [],
    },
    tokenHash,
  };

  db.run(
    `INSERT INTO agent_identities (id, name, role, permissions, status, created_at, last_active_at, behavior_profile, token_hash)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [id, name, role, JSON.stringify(permissions), now, now, JSON.stringify(identity.behaviorProfile), tokenHash]
  );
  saveDatabase();

  return { identity, token };
}

/**
 * Authenticate an agent by token
 */
export function authenticateAgent(token: string): AgentIdentity | null {
  initTables();
  const hash = simpleHash(token);
  const db = getDb();
  const rows = db.exec(`SELECT * FROM agent_identities WHERE token_hash = ? AND status = 'active'`, [hash]);
  if (!rows.length || !rows[0].values.length) return null;

  const r = rows[0].values[0];
  const cols = rows[0].columns;
  const obj: any = {};
  cols.forEach((c: string, i: number) => obj[c] = r[i]);

  // Update last active
  db.run(`UPDATE agent_identities SET last_active_at = datetime('now') WHERE id = ?`, [obj.id]);

  return {
    id: obj.id, name: obj.name, role: obj.role,
    permissions: JSON.parse(obj.permissions || '[]'),
    status: obj.status,
    createdAt: obj.created_at, lastActiveAt: new Date().toISOString(),
    behaviorProfile: JSON.parse(obj.behavior_profile || '{}'),
    tokenHash: obj.token_hash,
  };
}

/**
 * Check if an agent has permission for an action
 */
export function checkPermission(agentId: string, action: string, resource: string): { allowed: boolean; reason?: string } {
  initTables();
  const db = getDb();
  const rows = db.exec(`SELECT permissions, status FROM agent_identities WHERE id = ?`, [agentId]);
  if (!rows.length || !rows[0].values.length) return { allowed: false, reason: 'Agent not found' };

  const status = rows[0].values[0][1] as string;
  if (status !== 'active') return { allowed: false, reason: `Agent status: ${status}` };

  const permissions: AgentPermission[] = JSON.parse(rows[0].values[0][0] as string || '[]');

  for (const perm of permissions) {
    const resourceMatch = perm.resource === '*' || perm.resource === resource || resource.startsWith(perm.resource);
    const actionMatch = perm.actions.includes('*') || perm.actions.includes(action);
    if (resourceMatch && actionMatch) {
      recordAuditEvent(agentId, action, resource, true);
      return { allowed: true };
    }
  }

  recordAuditEvent(agentId, action, resource, false, 'Insufficient permissions');
  return { allowed: false, reason: 'Insufficient permissions' };
}

/**
 * Record an audit event
 */
function recordAuditEvent(agentId: string, action: string, resource: string, allowed: boolean, reason?: string): void {
  initTables();
  const db = getDb();
  db.run(
    `INSERT INTO agent_audit_log (agent_id, action, resource, allowed, reason) VALUES (?, ?, ?, ?, ?)`,
    [agentId, action, resource, allowed ? 1 : 0, reason || null]
  );
}

/**
 * Analyze agent behavior for anomalies
 */
export function analyzeBehavior(agentId: string): { anomalyScore: number; flags: string[] } {
  initTables();
  const db = getDb();
  const flags: string[] = [];

  // Check recent denial rate
  const denials = db.exec(
    `SELECT COUNT(*) FROM agent_audit_log WHERE agent_id = ? AND allowed = 0 AND timestamp > datetime('now', '-1 hour')`,
    [agentId]
  );
  const denialCount = denials.length > 0 ? (denials[0].values[0][0] as number) : 0;
  if (denialCount > 10) flags.push('high_denial_rate');

  // Check action frequency
  const totalRecent = db.exec(
    `SELECT COUNT(*) FROM agent_audit_log WHERE agent_id = ? AND timestamp > datetime('now', '-5 minutes')`,
    [agentId]
  );
  const recentCount = totalRecent.length > 0 ? (totalRecent[0].values[0][0] as number) : 0;
  if (recentCount > 100) flags.push('excessive_activity');

  // Check for privilege escalation patterns
  const sensitiveOps = db.exec(
    `SELECT COUNT(*) FROM agent_audit_log WHERE agent_id = ? AND resource IN ('shell', 'filesystem') AND timestamp > datetime('now', '-10 minutes')`,
    [agentId]
  );
  const sensitiveCount = sensitiveOps.length > 0 ? (sensitiveOps[0].values[0][0] as number) : 0;
  if (sensitiveCount > 20) flags.push('sensitive_resource_access');

  // Calculate anomaly score (0-100)
  let anomalyScore = 0;
  anomalyScore += Math.min(denialCount * 5, 30);
  anomalyScore += Math.min(recentCount / 5, 30);
  anomalyScore += Math.min(sensitiveCount * 3, 40);
  anomalyScore = Math.min(100, anomalyScore);

  // Update profile
  db.run(
    `UPDATE agent_identities SET behavior_profile = json_set(
      COALESCE(behavior_profile, '{}'), '$.anomalyScore', ?, '$.flags', ?, '$.lastAnomalyCheck', datetime('now')
    ) WHERE id = ?`,
    [anomalyScore, JSON.stringify(flags), agentId]
  );
  saveDatabase();

  return { anomalyScore, flags };
}

/**
 * Suspend an agent
 */
export function suspendAgent(agentId: string, reason: string = 'Manual suspension'): void {
  initTables();
  const db = getDb();
  db.run(`UPDATE agent_identities SET status = 'suspended' WHERE id = ?`, [agentId]);
  recordAuditEvent(agentId, 'suspend', 'agent_identity', true, reason);
  saveDatabase();
}

/**
 * Revoke an agent identity permanently
 */
export function revokeAgent(agentId: string): void {
  initTables();
  const db = getDb();
  db.run(`UPDATE agent_identities SET status = 'revoked', token_hash = NULL WHERE id = ?`, [agentId]);
  recordAuditEvent(agentId, 'revoke', 'agent_identity', true);
  saveDatabase();
}

/**
 * Rotate agent token
 */
export function rotateToken(agentId: string): { newToken: string } {
  initTables();
  const db = getDb();
  const newToken = genToken();
  const newHash = simpleHash(newToken);
  db.run(`UPDATE agent_identities SET token_hash = ? WHERE id = ?`, [newHash, agentId]);
  recordAuditEvent(agentId, 'rotate_token', 'agent_identity', true);
  saveDatabase();
  return { newToken };
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

// ── Tool Schema & Handler ──

export const zeroTrustSchema = {
  name: 'zero_trust',
  description: 'Zero-Trust Agent Identity management. Provision agents with unique identities, scoped permissions, and behavioral monitoring. Authenticate, authorize, analyze behavior, suspend, revoke, and rotate tokens.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['provision', 'authenticate', 'check_permission', 'analyze', 'suspend', 'revoke', 'rotate_token', 'list', 'audit_log'] },
      name: { type: 'string', description: 'Agent name (for provision)' },
      role: { type: 'string', description: 'Agent role (for provision)' },
      permissions: { type: 'array', items: { type: 'object', properties: { resource: { type: 'string' }, actions: { type: 'array', items: { type: 'string' } } } } },
      agent_id: { type: 'string' },
      token: { type: 'string', description: 'Agent token (for authenticate)' },
      agent_action: { type: 'string', description: 'Action to check (for check_permission)' },
      resource: { type: 'string', description: 'Resource to check (for check_permission)' },
      reason: { type: 'string', description: 'Suspension reason' },
      limit: { type: 'number' },
    },
    required: ['action'],
  },
};

export function handleZeroTrust(args: any): string {
  try {
    switch (args.action) {
      case 'provision': {
        if (!args.name || !args.role) return JSON.stringify({ success: false, error: 'name and role required' });
        const { identity, token } = provisionAgent(args.name, args.role, args.permissions || []);
        return JSON.stringify({ success: true, agentId: identity.id, token, message: 'Store this token securely — it cannot be retrieved later' });
      }
      case 'authenticate': {
        if (!args.token) return JSON.stringify({ success: false, error: 'token required' });
        const identity = authenticateAgent(args.token);
        if (!identity) return JSON.stringify({ success: false, error: 'Invalid or inactive token' });
        return JSON.stringify({ success: true, agent: { id: identity.id, name: identity.name, role: identity.role, status: identity.status } });
      }
      case 'check_permission': {
        if (!args.agent_id) return JSON.stringify({ success: false, error: 'agent_id required' });
        const result = checkPermission(args.agent_id, args.agent_action || 'execute', args.resource || '*');
        return JSON.stringify({ success: true, ...result });
      }
      case 'analyze': {
        if (!args.agent_id) return JSON.stringify({ success: false, error: 'agent_id required' });
        const analysis = analyzeBehavior(args.agent_id);
        return JSON.stringify({ success: true, ...analysis });
      }
      case 'suspend': {
        if (!args.agent_id) return JSON.stringify({ success: false, error: 'agent_id required' });
        suspendAgent(args.agent_id, args.reason);
        return JSON.stringify({ success: true, message: `Agent ${args.agent_id} suspended` });
      }
      case 'revoke': {
        if (!args.agent_id) return JSON.stringify({ success: false, error: 'agent_id required' });
        revokeAgent(args.agent_id);
        return JSON.stringify({ success: true, message: `Agent ${args.agent_id} revoked permanently` });
      }
      case 'rotate_token': {
        if (!args.agent_id) return JSON.stringify({ success: false, error: 'agent_id required' });
        const { newToken } = rotateToken(args.agent_id);
        return JSON.stringify({ success: true, newToken, message: 'Token rotated — store new token securely' });
      }
      case 'list': {
        initTables();
        const db = getDb();
        const rows = db.exec(`SELECT id, name, role, status, created_at, last_active_at FROM agent_identities ORDER BY last_active_at DESC LIMIT ?`, [args.limit || 20]);
        const agents = rows.length > 0 ? rows[0].values.map((r: any[]) => ({
          id: r[0], name: r[1], role: r[2], status: r[3], createdAt: r[4], lastActive: r[5],
        })) : [];
        return JSON.stringify({ success: true, agents, count: agents.length });
      }
      case 'audit_log': {
        initTables();
        const db = getDb();
        const query = args.agent_id
          ? `SELECT * FROM agent_audit_log WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?`
          : `SELECT * FROM agent_audit_log ORDER BY timestamp DESC LIMIT ?`;
        const params = args.agent_id ? [args.agent_id, args.limit || 20] : [args.limit || 20];
        const rows = db.exec(query, params);
        const logs = rows.length > 0 ? rows[0].values.map((r: any[]) => ({
          id: r[0], agentId: r[1], action: r[2], resource: r[3], allowed: !!r[4], timestamp: r[5], reason: r[6],
        })) : [];
        return JSON.stringify({ success: true, logs, count: logs.length });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
