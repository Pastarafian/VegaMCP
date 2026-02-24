/**
 * SwarmMonitor.tsx — Real-time Swarm Dashboard
 * Exposes VegaMCP swarm operations as REST API endpoints.
 * 
 * Views: Agent Grid, Task Pipeline, Metrics Dashboard, Trigger Manager
 * Connects to the FastAPI swarm bridge endpoints.
 * 
 * Drop-in integration: import { SwarmMonitor } from './SwarmMonitor';
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface Agent {
  agent_id: string;
  name: string;
  role: string;
  coordinator: string;
  model: string;
  enabled: boolean;
  status: 'idle' | 'processing' | 'error' | 'paused' | 'terminated';
  currentTask: string | null;
  lastHeartbeat: string | null;
  uptimeSeconds: number;
  tasksCompleted: number;
  tasksFailed: number;
  lastError: string | null;
}

interface SwarmStats {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalMessages: number;
  unreadMessages: number;
  activeTriggers: number;
}

interface Task {
  taskId: string;
  type: string;
  priority: number;
  status: string;
  assignedAgent: string | null;
  coordinator: string;
  createdAt: string;
  startedAt: string | null;
  timeoutSeconds: number;
}

interface Trigger {
  id: string;
  type: string;
  condition: any;
  action: any;
  enabled: boolean;
  fireCount: number;
  lastFired: string | null;
  cooldownSecs: number;
}

// ═══════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════

const API_BASE = '/api/v1/swarm';

async function swarmApi(path: string, options?: RequestInit) {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

// ═══════════════════════════════════════════════
// STATUS COLORS
// ═══════════════════════════════════════════════

const STATUS_COLORS: Record<string, string> = {
  idle: '#22c55e',       // green
  processing: '#3b82f6', // blue
  error: '#ef4444',      // red
  paused: '#f59e0b',     // amber
  terminated: '#6b7280', // gray
};

const COORDINATOR_ICONS: Record<string, string> = {
  research: '🔬',
  quality: '✅',
  operations: '⚙️',
};

const PRIORITY_LABELS = ['🔴 EMERGENCY', '🟠 HIGH', '🟡 NORMAL', '🟢 BACKGROUND'];

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════

type Tab = 'agents' | 'tasks' | 'metrics' | 'triggers';

export function SwarmMonitor() {
  const [activeTab, setActiveTab] = useState<Tab>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<SwarmStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [metricsSummary, setMetricsSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling
  const fetchData = useCallback(async () => {
    try {
      const statusData = await swarmApi('/status');
      setAgents(statusData.agents || []);
      setStats(statusData.stats || null);
      setMetricsSummary(statusData.metricsSummary || null);

      if (activeTab === 'tasks') {
        // Fetch active tasks - this would call the tasks endpoint
        // For now use stats data
      }

      if (activeTab === 'triggers') {
        // Would fetch triggers
      }

      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  // Agent actions
  const controlAgent = async (agentId: string, action: string) => {
    try {
      await swarmApi(`/agents/${agentId}/control`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Create task
  const [taskType, setTaskType] = useState('research');
  const [taskInput, setTaskInput] = useState('');

  const createTask = async () => {
    try {
      await swarmApi('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          task_type: taskType,
          priority: 2,
          input_data: { query: taskInput },
        }),
      });
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>🐝 Swarm Monitor</h1>
          <span style={styles.version}>VegaMCP v2.0.0</span>
        </div>
        {stats && (
          <div style={styles.statsBar}>
            <StatBadge label="Agents" value={stats.activeAgents} total={stats.totalAgents} color="#22c55e" />
            <StatBadge label="Tasks" value={stats.activeTasks} total={stats.totalTasks} color="#3b82f6" />
            <StatBadge label="Completed" value={stats.completedTasks} color="#22c55e" />
            <StatBadge label="Failed" value={stats.failedTasks} color="#ef4444" />
            <StatBadge label="Messages" value={stats.unreadMessages} total={stats.totalMessages} color="#f59e0b" />
            <StatBadge label="Triggers" value={stats.activeTriggers} color="#8b5cf6" />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={styles.dismissBtn}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['agents', 'tasks', 'metrics', 'triggers'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
          >
            {tab === 'agents' && '🤖 Agents'}
            {tab === 'tasks' && '📋 Tasks'}
            {tab === 'metrics' && '📊 Metrics'}
            {tab === 'triggers' && '⚡ Triggers'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.loading}>Loading swarm data...</div>
        ) : (
          <>
            {activeTab === 'agents' && <AgentGrid agents={agents} onControl={controlAgent} />}
            {activeTab === 'tasks' && <TaskPanel stats={stats} taskType={taskType} setTaskType={setTaskType} taskInput={taskInput} setTaskInput={setTaskInput} onCreate={createTask} />}
            {activeTab === 'metrics' && <MetricsPanel agents={agents} summary={metricsSummary} />}
            {activeTab === 'triggers' && <TriggersPanel triggers={triggers} />}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════

function StatBadge({ label, value, total, color }: { label: string; value: number; total?: number; color: string }) {
  return (
    <div style={styles.statBadge}>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      {total !== undefined && <span style={styles.statTotal}>/{total}</span>}
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function AgentGrid({ agents, onControl }: { agents: Agent[]; onControl: (id: string, action: string) => void }) {
  const coordinatorGroups = {
    research: agents.filter(a => a.coordinator === 'research'),
    quality: agents.filter(a => a.coordinator === 'quality'),
    operations: agents.filter(a => a.coordinator === 'operations'),
  };

  return (
    <div>
      {Object.entries(coordinatorGroups).map(([coord, coordAgents]) => (
        <div key={coord} style={styles.coordinatorSection}>
          <h2 style={styles.coordinatorTitle}>
            {COORDINATOR_ICONS[coord]} {coord.toUpperCase()} COORDINATOR ({coordAgents.length} agents)
          </h2>
          <div style={styles.agentGrid}>
            {coordAgents.map(agent => (
              <AgentCard key={agent.agent_id} agent={agent} onControl={onControl} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentCard({ agent, onControl }: { agent: Agent; onControl: (id: string, action: string) => void }) {
  const statusColor = STATUS_COLORS[agent.status] || '#6b7280';
  const successRate = agent.tasksCompleted + agent.tasksFailed > 0
    ? ((agent.tasksCompleted / (agent.tasksCompleted + agent.tasksFailed)) * 100).toFixed(0)
    : 'N/A';

  return (
    <div style={{ ...styles.agentCard, borderLeftColor: statusColor }}>
      <div style={styles.agentHeader}>
        <span style={styles.agentName}>{agent.name}</span>
        <span style={{ ...styles.statusDot, backgroundColor: statusColor }}>{agent.status}</span>
      </div>
      <div style={styles.agentRole}>{agent.role}</div>
      <div style={styles.agentMeta}>
        <span>🤖 {agent.model?.split('/').pop()}</span>
        <span>✅ {agent.tasksCompleted} | ❌ {agent.tasksFailed}</span>
        <span>📈 {successRate}%</span>
      </div>
      {agent.currentTask && (
        <div style={styles.currentTask}>▶ {agent.currentTask}</div>
      )}
      {agent.lastError && (
        <div style={styles.lastError}>⚠ {agent.lastError}</div>
      )}
      <div style={styles.agentActions}>
        {agent.status === 'idle' && <button onClick={() => onControl(agent.agent_id, 'pause')} style={styles.actionBtn}>Pause</button>}
        {agent.status === 'paused' && <button onClick={() => onControl(agent.agent_id, 'start')} style={styles.actionBtnGreen}>Resume</button>}
        {agent.status === 'error' && <button onClick={() => onControl(agent.agent_id, 'restart')} style={styles.actionBtnBlue}>Restart</button>}
        {agent.status === 'terminated' && <button onClick={() => onControl(agent.agent_id, 'start')} style={styles.actionBtnGreen}>Start</button>}
        {['idle', 'processing'].includes(agent.status) && <button onClick={() => onControl(agent.agent_id, 'stop')} style={styles.actionBtnRed}>Stop</button>}
      </div>
    </div>
  );
}

function TaskPanel({ stats, taskType, setTaskType, taskInput, setTaskInput, onCreate }: any) {
  const TASK_TYPES = [
    'research', 'deep_research', 'web_research',
    'data_analysis', 'pattern_analysis',
    'content_creation', 'documentation', 'copywriting',
    'code_generation', 'code_review', 'debugging',
    'planning', 'task_decomposition', 'strategy',
    'review', 'validation', 'testing',
    'critique', 'feedback', 'improvement',
    'integration', 'api_coordination', 'data_pipeline',
    'monitoring', 'health_check', 'alerting',
    'summarize', 'generate_report', 'synthesis',
  ];

  return (
    <div>
      <div style={styles.createTaskForm}>
        <h3>Create Task</h3>
        <div style={styles.formRow}>
          <select value={taskType} onChange={e => setTaskType(e.target.value)} style={styles.select}>
            {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={taskInput} onChange={e => setTaskInput(e.target.value)} placeholder="Input" style={styles.input} />
          <button onClick={onCreate} style={styles.actionBtnGreen}>Create Task</button>
        </div>
      </div>
      {stats && (
        <div style={styles.taskStats}>
          <div style={styles.taskStatCard}>
            <span style={styles.taskStatValue}>{stats.activeTasks}</span>
            <span>Active</span>
          </div>
          <div style={styles.taskStatCard}>
            <span style={{ ...styles.taskStatValue, color: '#22c55e' }}>{stats.completedTasks}</span>
            <span>Completed</span>
          </div>
          <div style={styles.taskStatCard}>
            <span style={{ ...styles.taskStatValue, color: '#ef4444' }}>{stats.failedTasks}</span>
            <span>Failed</span>
          </div>
          <div style={styles.taskStatCard}>
            <span style={styles.taskStatValue}>{stats.totalTasks}</span>
            <span>Total</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricsPanel({ agents, summary }: { agents: Agent[]; summary: any }) {
  return (
    <div>
      <h3 style={styles.sectionTitle}>Agent Performance</h3>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Agent</th>
            <th style={styles.th}>Role</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Completed</th>
            <th style={styles.th}>Failed</th>
            <th style={styles.th}>Success Rate</th>
            <th style={styles.th}>Uptime</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(a => {
            const rate = a.tasksCompleted + a.tasksFailed > 0
              ? ((a.tasksCompleted / (a.tasksCompleted + a.tasksFailed)) * 100).toFixed(1)
              : 'N/A';
            const uptime = a.uptimeSeconds > 3600
              ? `${(a.uptimeSeconds / 3600).toFixed(1)}h`
              : `${Math.floor(a.uptimeSeconds / 60)}m`;
            return (
              <tr key={a.agent_id}>
                <td style={styles.td}>{a.name}</td>
                <td style={styles.td}>{a.role}</td>
                <td style={styles.td}>
                  <span style={{ color: STATUS_COLORS[a.status] }}>{a.status}</span>
                </td>
                <td style={styles.td}>{a.tasksCompleted}</td>
                <td style={styles.td}>{a.tasksFailed}</td>
                <td style={styles.td}>{rate}%</td>
                <td style={styles.td}>{uptime}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TriggersPanel({ triggers }: { triggers: Trigger[] }) {
  return (
    <div>
      <h3 style={styles.sectionTitle}>Event Triggers</h3>
      {triggers.length === 0 ? (
        <div style={styles.emptyState}>No triggers registered. Use swarm_register_trigger to add event-driven automation.</div>
      ) : (
        triggers.map(t => (
          <div key={t.id} style={styles.triggerCard}>
            <div><strong>{t.type}</strong> — {t.enabled ? '✅ Enabled' : '⬚ Disabled'}</div>
            <div>Fires: {t.fireCount} | Cooldown: {t.cooldownSecs}s</div>
            {t.lastFired && <div>Last fired: {new Date(t.lastFired).toLocaleString()}</div>}
          </div>
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: "'Inter', -apple-system, sans-serif", color: '#e2e8f0', background: '#0f172a', minHeight: '100vh', padding: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  title: { fontSize: '24px', fontWeight: 700, margin: 0 },
  version: { fontSize: '12px', background: '#1e293b', padding: '4px 8px', borderRadius: '4px', color: '#94a3b8' },
  statsBar: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  statBadge: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: '#1e293b', padding: '8px 16px', borderRadius: '8px' },
  statValue: { fontSize: '20px', fontWeight: 700 },
  statTotal: { fontSize: '14px', color: '#64748b' },
  statLabel: { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  errorBanner: { background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' },
  dismissBtn: { background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '16px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '4px' },
  tab: { padding: '8px 20px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', borderRadius: '8px 8px 0 0', fontSize: '14px', fontWeight: 500, transition: 'all 0.2s' },
  tabActive: { background: '#1e293b', color: '#f1f5f9', borderBottom: '2px solid #3b82f6' },
  content: { background: '#1e293b', borderRadius: '12px', padding: '24px', minHeight: '400px' },
  loading: { textAlign: 'center', padding: '40px', color: '#64748b' },
  coordinatorSection: { marginBottom: '24px' },
  coordinatorTitle: { fontSize: '16px', color: '#94a3b8', marginBottom: '12px', fontWeight: 600 },
  agentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' },
  agentCard: { background: '#0f172a', borderRadius: '8px', padding: '16px', borderLeft: '4px solid', transition: 'transform 0.2s', cursor: 'default' },
  agentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  agentName: { fontWeight: 700, fontSize: '15px' },
  statusDot: { fontSize: '11px', padding: '2px 8px', borderRadius: '12px', color: '#fff', fontWeight: 600 },
  agentRole: { fontSize: '12px', color: '#64748b', marginBottom: '8px' },
  agentMeta: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '8px' },
  currentTask: { fontSize: '11px', color: '#3b82f6', background: '#1e3a5f', padding: '4px 8px', borderRadius: '4px', marginBottom: '8px' },
  lastError: { fontSize: '11px', color: '#ef4444', marginBottom: '8px' },
  agentActions: { display: 'flex', gap: '8px' },
  actionBtn: { padding: '4px 12px', fontSize: '12px', border: '1px solid #334155', borderRadius: '4px', background: 'none', color: '#94a3b8', cursor: 'pointer' },
  actionBtnGreen: { padding: '4px 12px', fontSize: '12px', border: 'none', borderRadius: '4px', background: '#166534', color: '#22c55e', cursor: 'pointer' },
  actionBtnBlue: { padding: '4px 12px', fontSize: '12px', border: 'none', borderRadius: '4px', background: '#1e3a5f', color: '#3b82f6', cursor: 'pointer' },
  actionBtnRed: { padding: '4px 12px', fontSize: '12px', border: 'none', borderRadius: '4px', background: '#7f1d1d', color: '#ef4444', cursor: 'pointer' },
  createTaskForm: { marginBottom: '24px' },
  formRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  select: { padding: '8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '13px' },
  input: { padding: '8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: '13px', width: '120px' },
  taskStats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  taskStatCard: { background: '#0f172a', borderRadius: '8px', padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' },
  taskStatValue: { fontSize: '28px', fontWeight: 700, color: '#3b82f6' },
  sectionTitle: { fontSize: '18px', fontWeight: 600, marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' },
  td: { padding: '8px 12px', borderBottom: '1px solid #1e293b', fontSize: '13px' },
  triggerCard: { background: '#0f172a', borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' },
  emptyState: { textAlign: 'center', color: '#64748b', padding: '40px' },
};

export default SwarmMonitor;
