/**
 * VegaMCP — Swarm Store
 * SQLite tables and operations for the Agent Swarm coordination layer.
 * Extends the existing Memory Graph database with swarm-specific tables.
 */

import { getDb, saveDatabase } from './graph-store.js';

// ═══════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════

export interface AgentDefinition {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  coordinator: string;
  model_pref: string;
  personality: string | null;
  engine_access: string | null;
  config: string | null;
  enabled: boolean;
  created_at: string;
}

export interface AgentState {
  agent_id: string;
  status: 'idle' | 'processing' | 'error' | 'paused' | 'terminated';
  current_task_id: string | null;
  last_heartbeat: string | null;
  uptime_seconds: number;
  tasks_completed: number;
  tasks_failed: number;
  resource_usage: string | null;
  last_error: string | null;
}

export interface SwarmTask {
  task_id: string;
  task_type: string;
  priority: number;
  status: 'queued' | 'assigned' | 'processing' | 'completed' | 'failed' | 'cancelled';
  assigned_agent: string | null;
  coordinator: string | null;
  parent_task_id: string | null;
  dependencies: string | null;
  input_data: string | null;
  output_data: string | null;
  error_message: string | null;
  timeout_seconds: number;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AgentMessage {
  message_id: string;
  sender_agent: string;
  recipient: string;
  message_type: 'request' | 'response' | 'alert' | 'observation' | 'coordination';
  content: string;
  priority: number;
  is_read: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface SwarmTrigger {
  trigger_id: string;
  trigger_type: 'market' | 'schedule' | 'webhook' | 'threshold' | 'manual';
  condition: string;
  action: string;
  enabled: boolean;
  last_fired: string | null;
  fire_count: number;
  cooldown_secs: number;
  created_at: string;
}

export interface AgentMetric {
  id: number;
  agent_id: string;
  metric_name: string;
  metric_value: number;
  metadata: string | null;
  recorded_at: string;
}

// ═══════════════════════════════════════════════
// TABLE INITIALIZATION
// ═══════════════════════════════════════════════

export function initSwarmTables(): void {
  const db = getDb();

  // Agent Registry
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_definitions (
      agent_id        TEXT PRIMARY KEY,
      agent_name      TEXT NOT NULL,
      agent_role      TEXT NOT NULL,
      coordinator     TEXT NOT NULL,
      model_pref      TEXT NOT NULL,
      personality     TEXT,
      engine_access   TEXT,
      config          TEXT,
      enabled         INTEGER DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Agent State
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_states (
      agent_id        TEXT PRIMARY KEY,
      status          TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat  TEXT,
      uptime_seconds  INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      tasks_failed    INTEGER DEFAULT 0,
      resource_usage  TEXT,
      last_error      TEXT,
      FOREIGN KEY (agent_id) REFERENCES agent_definitions(agent_id)
    );
  `);

  // Task Queue
  db.run(`
    CREATE TABLE IF NOT EXISTS swarm_tasks (
      task_id         TEXT PRIMARY KEY,
      task_type       TEXT NOT NULL,
      priority        INTEGER DEFAULT 2,
      status          TEXT DEFAULT 'queued',
      assigned_agent  TEXT,
      coordinator     TEXT,
      parent_task_id  TEXT,
      dependencies    TEXT,
      input_data      TEXT,
      output_data     TEXT,
      error_message   TEXT,
      timeout_seconds INTEGER DEFAULT 300,
      retry_count     INTEGER DEFAULT 0,
      max_retries     INTEGER DEFAULT 3,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      started_at      TEXT,
      completed_at    TEXT,
      FOREIGN KEY (assigned_agent) REFERENCES agent_definitions(agent_id),
      FOREIGN KEY (parent_task_id) REFERENCES swarm_tasks(task_id)
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON swarm_tasks(status);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON swarm_tasks(priority, created_at);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_agent ON swarm_tasks(assigned_agent);`);

  // Inter-Agent Messages
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_messages (
      message_id      TEXT PRIMARY KEY,
      sender_agent    TEXT NOT NULL,
      recipient       TEXT NOT NULL,
      message_type    TEXT NOT NULL,
      content         TEXT NOT NULL,
      priority        INTEGER DEFAULT 2,
      is_read         INTEGER DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at      TEXT,
      FOREIGN KEY (sender_agent) REFERENCES agent_definitions(agent_id)
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON agent_messages(recipient, is_read);`);

  // Swarm Triggers
  db.run(`
    CREATE TABLE IF NOT EXISTS swarm_triggers (
      trigger_id      TEXT PRIMARY KEY,
      trigger_type    TEXT NOT NULL,
      condition       TEXT NOT NULL,
      action          TEXT NOT NULL,
      enabled         INTEGER DEFAULT 1,
      last_fired      TEXT,
      fire_count      INTEGER DEFAULT 0,
      cooldown_secs   INTEGER DEFAULT 60,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Performance Metrics
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_metrics (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id        TEXT NOT NULL,
      metric_name     TEXT NOT NULL,
      metric_value    REAL NOT NULL,
      metadata        TEXT,
      recorded_at     TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agent_definitions(agent_id)
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_metrics_agent ON agent_metrics(agent_id, recorded_at);`);

  saveDatabase();
}

// ═══════════════════════════════════════════════
// AGENT DEFINITIONS — CRUD
// ═══════════════════════════════════════════════

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerAgent(def: Omit<AgentDefinition, 'created_at'>): AgentDefinition {
  const db = getDb();

  db.run(`
    INSERT OR REPLACE INTO agent_definitions (agent_id, agent_name, agent_role, coordinator, model_pref, personality, engine_access, config, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [def.agent_id, def.agent_name, def.agent_role, def.coordinator, def.model_pref, def.personality, def.engine_access, def.config, def.enabled ? 1 : 0]);

  // Ensure agent_states row exists
  db.run(`
    INSERT OR IGNORE INTO agent_states (agent_id, status) VALUES (?, 'idle')
  `, [def.agent_id]);

  saveDatabase();

  return getAgentDefinition(def.agent_id)!;
}

export function getAgentDefinition(agentId: string): AgentDefinition | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM agent_definitions WHERE agent_id = ?`, [agentId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const r = result[0].values[0];
  return {
    agent_id: r[0] as string,
    agent_name: r[1] as string,
    agent_role: r[2] as string,
    coordinator: r[3] as string,
    model_pref: r[4] as string,
    personality: r[5] as string | null,
    engine_access: r[6] as string | null,
    config: r[7] as string | null,
    enabled: !!(r[8] as number),
    created_at: r[9] as string,
  };
}

export function getAllAgentDefinitions(): AgentDefinition[] {
  const db = getDb();
  const result = db.exec(`SELECT * FROM agent_definitions ORDER BY coordinator, agent_name`);
  if (result.length === 0) return [];
  return result[0].values.map((r: any[]) => ({
    agent_id: r[0], agent_name: r[1], agent_role: r[2], coordinator: r[3],
    model_pref: r[4], personality: r[5], engine_access: r[6], config: r[7],
    enabled: !!r[8], created_at: r[9],
  }));
}

export function setAgentEnabled(agentId: string, enabled: boolean): boolean {
  const db = getDb();
  db.run(`UPDATE agent_definitions SET enabled = ? WHERE agent_id = ?`, [enabled ? 1 : 0, agentId]);
  saveDatabase();
  return true;
}

// ═══════════════════════════════════════════════
// AGENT STATE — CRUD
// ═══════════════════════════════════════════════

export function getAgentState(agentId: string): AgentState | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM agent_states WHERE agent_id = ?`, [agentId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const r = result[0].values[0];
  return {
    agent_id: r[0] as string,
    status: r[1] as AgentState['status'],
    current_task_id: r[2] as string | null,
    last_heartbeat: r[3] as string | null,
    uptime_seconds: r[4] as number,
    tasks_completed: r[5] as number,
    tasks_failed: r[6] as number,
    resource_usage: r[7] as string | null,
    last_error: r[8] as string | null,
  };
}

export function updateAgentState(agentId: string, updates: Partial<AgentState>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.current_task_id !== undefined) { fields.push('current_task_id = ?'); values.push(updates.current_task_id); }
  if (updates.last_heartbeat !== undefined) { fields.push('last_heartbeat = ?'); values.push(updates.last_heartbeat); }
  if (updates.uptime_seconds !== undefined) { fields.push('uptime_seconds = ?'); values.push(updates.uptime_seconds); }
  if (updates.tasks_completed !== undefined) { fields.push('tasks_completed = ?'); values.push(updates.tasks_completed); }
  if (updates.tasks_failed !== undefined) { fields.push('tasks_failed = ?'); values.push(updates.tasks_failed); }
  if (updates.resource_usage !== undefined) { fields.push('resource_usage = ?'); values.push(updates.resource_usage); }
  if (updates.last_error !== undefined) { fields.push('last_error = ?'); values.push(updates.last_error); }

  if (fields.length === 0) return;
  values.push(agentId);

  db.run(`UPDATE agent_states SET ${fields.join(', ')} WHERE agent_id = ?`, values);
  saveDatabase();
}

export function recordHeartbeat(agentId: string): void {
  updateAgentState(agentId, { last_heartbeat: new Date().toISOString() });
}

export function getAllAgentStates(): Array<AgentDefinition & AgentState> {
  const db = getDb();
  const result = db.exec(`
    SELECT d.*, s.status, s.current_task_id, s.last_heartbeat, s.uptime_seconds,
           s.tasks_completed, s.tasks_failed, s.resource_usage, s.last_error
    FROM agent_definitions d
    LEFT JOIN agent_states s ON d.agent_id = s.agent_id
    ORDER BY d.coordinator, d.agent_name
  `);
  if (result.length === 0) return [];
  return result[0].values.map((r: any[]) => ({
    agent_id: r[0] as string, agent_name: r[1] as string, agent_role: r[2] as string,
    coordinator: r[3] as string, model_pref: r[4] as string,
    personality: r[5] as string | null, engine_access: r[6] as string | null,
    config: r[7] as string | null, enabled: !!r[8], created_at: r[9] as string,
    status: (r[10] as AgentState['status']) || 'idle',
    current_task_id: r[11] as string | null,
    last_heartbeat: r[12] as string | null,
    uptime_seconds: (r[13] as number) || 0,
    tasks_completed: (r[14] as number) || 0,
    tasks_failed: (r[15] as number) || 0,
    resource_usage: r[16] as string | null,
    last_error: r[17] as string | null,
  }));
}

// ═══════════════════════════════════════════════
// SWARM TASKS — CRUD
// ═══════════════════════════════════════════════

export function createTask(task: Partial<SwarmTask> & { task_type: string }): SwarmTask {
  const db = getDb();
  const taskId = task.task_id || `task-${generateId()}`;

  db.run(`
    INSERT INTO swarm_tasks (task_id, task_type, priority, status, assigned_agent, coordinator,
      parent_task_id, dependencies, input_data, timeout_seconds, max_retries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    taskId, task.task_type, task.priority ?? 2, task.status || 'queued',
    task.assigned_agent || null, task.coordinator || null,
    task.parent_task_id || null, task.dependencies || null,
    task.input_data || null, task.timeout_seconds ?? 300, task.max_retries ?? 3,
  ]);

  saveDatabase();
  return getTask(taskId)!;
}

export function getTask(taskId: string): SwarmTask | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM swarm_tasks WHERE task_id = ?`, [taskId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToTask(result[0].values[0]);
}

function rowToTask(r: any[]): SwarmTask {
  return {
    task_id: r[0] as string, task_type: r[1] as string, priority: r[2] as number,
    status: r[3] as SwarmTask['status'], assigned_agent: r[4] as string | null,
    coordinator: r[5] as string | null, parent_task_id: r[6] as string | null,
    dependencies: r[7] as string | null, input_data: r[8] as string | null,
    output_data: r[9] as string | null, error_message: r[10] as string | null,
    timeout_seconds: r[11] as number, retry_count: r[12] as number,
    max_retries: r[13] as number, created_at: r[14] as string,
    started_at: r[15] as string | null, completed_at: r[16] as string | null,
  };
}

export function updateTask(taskId: string, updates: Partial<SwarmTask>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.assigned_agent !== undefined) { fields.push('assigned_agent = ?'); values.push(updates.assigned_agent); }
  if (updates.output_data !== undefined) { fields.push('output_data = ?'); values.push(updates.output_data); }
  if (updates.error_message !== undefined) { fields.push('error_message = ?'); values.push(updates.error_message); }
  if (updates.started_at !== undefined) { fields.push('started_at = ?'); values.push(updates.started_at); }
  if (updates.completed_at !== undefined) { fields.push('completed_at = ?'); values.push(updates.completed_at); }
  if (updates.retry_count !== undefined) { fields.push('retry_count = ?'); values.push(updates.retry_count); }

  if (fields.length === 0) return;
  values.push(taskId);

  db.run(`UPDATE swarm_tasks SET ${fields.join(', ')} WHERE task_id = ?`, values);
  saveDatabase();
}

export function getTasksByStatus(status: string): SwarmTask[] {
  const db = getDb();
  const result = db.exec(`SELECT * FROM swarm_tasks WHERE status = ? ORDER BY priority ASC, created_at ASC`, [status]);
  if (result.length === 0) return [];
  return result[0].values.map(rowToTask);
}

export function getActiveTasks(): SwarmTask[] {
  const db = getDb();
  const result = db.exec(`
    SELECT * FROM swarm_tasks
    WHERE status IN ('queued', 'assigned', 'processing')
    ORDER BY priority ASC, created_at ASC
  `);
  if (result.length === 0) return [];
  return result[0].values.map(rowToTask);
}

export function getTasksByAgent(agentId: string): SwarmTask[] {
  const db = getDb();
  const result = db.exec(`SELECT * FROM swarm_tasks WHERE assigned_agent = ? ORDER BY created_at DESC LIMIT 50`, [agentId]);
  if (result.length === 0) return [];
  return result[0].values.map(rowToTask);
}

export function getSubTasks(parentTaskId: string): SwarmTask[] {
  const db = getDb();
  const result = db.exec(`SELECT * FROM swarm_tasks WHERE parent_task_id = ? ORDER BY created_at ASC`, [parentTaskId]);
  if (result.length === 0) return [];
  return result[0].values.map(rowToTask);
}

export function getNextQueuedTask(coordinator?: string): SwarmTask | null {
  const db = getDb();
  let sql = `SELECT * FROM swarm_tasks WHERE status = 'queued'`;
  const params: any[] = [];
  if (coordinator) {
    sql += ` AND coordinator = ?`;
    params.push(coordinator);
  }
  sql += ` ORDER BY priority ASC, created_at ASC LIMIT 1`;
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToTask(result[0].values[0]);
}

// ═══════════════════════════════════════════════
// AGENT MESSAGES — CRUD
// ═══════════════════════════════════════════════

export function sendMessage(msg: Omit<AgentMessage, 'message_id' | 'created_at' | 'is_read'>): AgentMessage {
  const db = getDb();
  const messageId = `msg-${generateId()}`;

  db.run(`
    INSERT INTO agent_messages (message_id, sender_agent, recipient, message_type, content, priority, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [messageId, msg.sender_agent, msg.recipient, msg.message_type, msg.content, msg.priority || 2, msg.expires_at || null]);

  saveDatabase();
  return getMessage(messageId)!;
}

export function getMessage(messageId: string): AgentMessage | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM agent_messages WHERE message_id = ?`, [messageId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const r = result[0].values[0];
  return {
    message_id: r[0] as string, sender_agent: r[1] as string, recipient: r[2] as string,
    message_type: r[3] as AgentMessage['message_type'], content: r[4] as string,
    priority: r[5] as number, is_read: !!(r[6] as number),
    created_at: r[7] as string, expires_at: r[8] as string | null,
  };
}

export function getUnreadMessages(recipient: string): AgentMessage[] {
  const db = getDb();
  const result = db.exec(`
    SELECT * FROM agent_messages
    WHERE (recipient = ? OR recipient = 'broadcast')
      AND is_read = 0
    ORDER BY priority ASC, created_at ASC
  `, [recipient]);
  if (result.length === 0) return [];
  return result[0].values.map((r: any[]) => ({
    message_id: r[0] as string, sender_agent: r[1] as string, recipient: r[2] as string,
    message_type: r[3] as AgentMessage['message_type'], content: r[4] as string,
    priority: r[5] as number, is_read: false,
    created_at: r[7] as string, expires_at: r[8] as string | null,
  }));
}

export function markMessageRead(messageId: string): void {
  const db = getDb();
  db.run(`UPDATE agent_messages SET is_read = 1 WHERE message_id = ?`, [messageId]);
  saveDatabase();
}

// ═══════════════════════════════════════════════
// SWARM TRIGGERS — CRUD
// ═══════════════════════════════════════════════

export function registerTrigger(trigger: Omit<SwarmTrigger, 'trigger_id' | 'created_at' | 'last_fired' | 'fire_count'>): SwarmTrigger {
  const db = getDb();
  const triggerId = `trig-${generateId()}`;

  db.run(`
    INSERT INTO swarm_triggers (trigger_id, trigger_type, condition, action, enabled, cooldown_secs)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [triggerId, trigger.trigger_type, trigger.condition, trigger.action, trigger.enabled ? 1 : 0, trigger.cooldown_secs || 60]);

  saveDatabase();
  return getTrigger(triggerId)!;
}

export function getTrigger(triggerId: string): SwarmTrigger | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM swarm_triggers WHERE trigger_id = ?`, [triggerId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const r = result[0].values[0];
  return {
    trigger_id: r[0] as string, trigger_type: r[1] as SwarmTrigger['trigger_type'],
    condition: r[2] as string, action: r[3] as string, enabled: !!(r[4] as number),
    last_fired: r[5] as string | null, fire_count: r[6] as number,
    cooldown_secs: r[7] as number, created_at: r[8] as string,
  };
}

export function getAllTriggers(): SwarmTrigger[] {
  const db = getDb();
  const result = db.exec(`SELECT * FROM swarm_triggers ORDER BY created_at DESC`);
  if (result.length === 0) return [];
  return result[0].values.map((r: any[]) => ({
    trigger_id: r[0] as string, trigger_type: r[1] as SwarmTrigger['trigger_type'],
    condition: r[2] as string, action: r[3] as string, enabled: !!(r[4] as number),
    last_fired: r[5] as string | null, fire_count: r[6] as number,
    cooldown_secs: r[7] as number, created_at: r[8] as string,
  }));
}

export function fireTrigger(triggerId: string): void {
  const db = getDb();
  db.run(`UPDATE swarm_triggers SET last_fired = datetime('now'), fire_count = fire_count + 1 WHERE trigger_id = ?`, [triggerId]);
  saveDatabase();
}

export function deleteTrigger(triggerId: string): boolean {
  const db = getDb();
  const trigger = getTrigger(triggerId);
  if (!trigger) return false;
  db.run(`DELETE FROM swarm_triggers WHERE trigger_id = ?`, [triggerId]);
  saveDatabase();
  return true;
}

// ═══════════════════════════════════════════════
// AGENT METRICS — CRUD
// ═══════════════════════════════════════════════

export function recordMetric(agentId: string, metricName: string, metricValue: number, metadata?: string): void {
  const db = getDb();
  db.run(`
    INSERT INTO agent_metrics (agent_id, metric_name, metric_value, metadata)
    VALUES (?, ?, ?, ?)
  `, [agentId, metricName, metricValue, metadata || null]);
  saveDatabase();
}

export function getMetrics(agentId?: string, metricName?: string, limit: number = 100): AgentMetric[] {
  const db = getDb();
  let sql = `SELECT * FROM agent_metrics WHERE 1=1`;
  const params: any[] = [];

  if (agentId) { sql += ` AND agent_id = ?`; params.push(agentId); }
  if (metricName) { sql += ` AND metric_name = ?`; params.push(metricName); }
  sql += ` ORDER BY recorded_at DESC LIMIT ?`;
  params.push(limit);

  const result = db.exec(sql, params);
  if (result.length === 0) return [];
  return result[0].values.map((r: any[]) => ({
    id: r[0] as number, agent_id: r[1] as string, metric_name: r[2] as string,
    metric_value: r[3] as number, metadata: r[4] as string | null,
    recorded_at: r[5] as string,
  }));
}

export function getMetricsSummary(agentId?: string): Record<string, { count: number; avg: number; min: number; max: number }> {
  const db = getDb();
  let sql = `SELECT metric_name, COUNT(*) as cnt, AVG(metric_value) as avg_val,
             MIN(metric_value) as min_val, MAX(metric_value) as max_val
             FROM agent_metrics`;
  const params: any[] = [];
  if (agentId) { sql += ` WHERE agent_id = ?`; params.push(agentId); }
  sql += ` GROUP BY metric_name`;

  const result = db.exec(sql, params);
  if (result.length === 0) return {};

  const summary: Record<string, { count: number; avg: number; min: number; max: number }> = {};
  for (const r of result[0].values) {
    summary[r[0] as string] = {
      count: r[1] as number,
      avg: r[2] as number,
      min: r[3] as number,
      max: r[4] as number,
    };
  }
  return summary;
}

// ═══════════════════════════════════════════════
// SWARM STATISTICS
// ═══════════════════════════════════════════════

export function getSwarmStats(): {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalMessages: number;
  unreadMessages: number;
  activeTriggers: number;
} {
  const db = getDb();

  const agentCount = db.exec(`SELECT COUNT(*) FROM agent_definitions`);
  const activeCount = db.exec(`SELECT COUNT(*) FROM agent_states WHERE status = 'processing'`);
  const taskCount = db.exec(`SELECT COUNT(*) FROM swarm_tasks`);
  const activeTaskCount = db.exec(`SELECT COUNT(*) FROM swarm_tasks WHERE status IN ('queued', 'assigned', 'processing')`);
  const completedCount = db.exec(`SELECT COUNT(*) FROM swarm_tasks WHERE status = 'completed'`);
  const failedCount = db.exec(`SELECT COUNT(*) FROM swarm_tasks WHERE status = 'failed'`);
  const msgCount = db.exec(`SELECT COUNT(*) FROM agent_messages`);
  const unreadCount = db.exec(`SELECT COUNT(*) FROM agent_messages WHERE is_read = 0`);
  const triggerCount = db.exec(`SELECT COUNT(*) FROM swarm_triggers WHERE enabled = 1`);

  const val = (r: any[]) => (r.length > 0 && r[0].values.length > 0) ? r[0].values[0][0] as number : 0;

  return {
    totalAgents: val(agentCount),
    activeAgents: val(activeCount),
    totalTasks: val(taskCount),
    activeTasks: val(activeTaskCount),
    completedTasks: val(completedCount),
    failedTasks: val(failedCount),
    totalMessages: val(msgCount),
    unreadMessages: val(unreadCount),
    activeTriggers: val(triggerCount),
  };
}
