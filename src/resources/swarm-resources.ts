/**
 * VegaMCP — Swarm Resources
 * Exposes swarm state as browsable MCP resources.
 */

import {
  getAllAgentStates, getActiveTasks, getTask, getSubTasks,
  getTasksByAgent, getSwarmStats, getMetricsSummary,
  getAllTriggers,
} from '../db/swarm-store.js';

export const swarmResources = [
  {
    uri: 'swarm://status',
    name: 'Swarm Status',
    description: 'Live status of all agents, active tasks, and coordinators.',
    mimeType: 'application/json',
  },
  {
    uri: 'swarm://tasks/active',
    name: 'Active Tasks',
    description: 'Currently running and queued swarm tasks.',
    mimeType: 'application/json',
  },
  {
    uri: 'swarm://metrics/dashboard',
    name: 'Metrics Dashboard',
    description: 'Aggregated performance metrics across all agents.',
    mimeType: 'application/json',
  },
  {
    uri: 'swarm://triggers',
    name: 'Event Triggers',
    description: 'All registered event triggers and their fire history.',
    mimeType: 'application/json',
  },
];

export function readSwarmResource(uri: string): string {
  try {
    // swarm://status
    if (uri === 'swarm://status') {
      const agents = getAllAgentStates();
      const stats = getSwarmStats();
      return JSON.stringify({
        swarmStats: stats,
        agents: agents.map(a => ({
          id: a.agent_id,
          name: a.agent_name,
          role: a.agent_role,
          coordinator: a.coordinator,
          model: a.model_pref,
          enabled: a.enabled,
          status: a.status,
          currentTask: a.current_task_id,
          lastHeartbeat: a.last_heartbeat,
          uptimeSeconds: a.uptime_seconds,
          tasksCompleted: a.tasks_completed,
          tasksFailed: a.tasks_failed,
        })),
        coordinators: [
          { type: 'research', agents: agents.filter(a => a.coordinator === 'research').map(a => a.agent_id) },
          { type: 'quality', agents: agents.filter(a => a.coordinator === 'quality').map(a => a.agent_id) },
          { type: 'operations', agents: agents.filter(a => a.coordinator === 'operations').map(a => a.agent_id) },
        ],
      }, null, 2);
    }

    // swarm://tasks/active
    if (uri === 'swarm://tasks/active') {
      const tasks = getActiveTasks();
      return JSON.stringify({
        activeTasks: tasks.map(t => ({
          taskId: t.task_id,
          type: t.task_type,
          priority: t.priority,
          status: t.status,
          assignedAgent: t.assigned_agent,
          coordinator: t.coordinator,
          createdAt: t.created_at,
          startedAt: t.started_at,
          timeoutSeconds: t.timeout_seconds,
          retryCount: t.retry_count,
        })),
        count: tasks.length,
      }, null, 2);
    }

    // swarm://tasks/{task_id}
    if (uri.startsWith('swarm://tasks/') && uri !== 'swarm://tasks/active') {
      const taskId = uri.replace('swarm://tasks/', '');
      const task = getTask(taskId);
      if (!task) return JSON.stringify({ error: `Task ${taskId} not found` });
      const subtasks = getSubTasks(taskId);
      let inputData: any = null;
      let outputData: any = null;
      try { inputData = task.input_data ? JSON.parse(task.input_data) : null; } catch { inputData = task.input_data; }
      try { outputData = task.output_data ? JSON.parse(task.output_data) : null; } catch { outputData = task.output_data; }
      return JSON.stringify({
        task: { ...task, input_data: inputData, output_data: outputData },
        subtasks: subtasks.map(st => ({
          taskId: st.task_id, type: st.task_type, status: st.status, agent: st.assigned_agent,
        })),
      }, null, 2);
    }

    // swarm://agents/{agent_id}/history
    if (uri.startsWith('swarm://agents/') && uri.endsWith('/history')) {
      const agentId = uri.replace('swarm://agents/', '').replace('/history', '');
      const tasks = getTasksByAgent(agentId);
      const summary = getMetricsSummary(agentId);
      return JSON.stringify({
        agentId,
        taskHistory: tasks.map(t => ({
          taskId: t.task_id, type: t.task_type, status: t.status,
          createdAt: t.created_at, completedAt: t.completed_at,
        })),
        metrics: summary,
        totalTasks: tasks.length,
      }, null, 2);
    }

    // swarm://metrics/dashboard
    if (uri === 'swarm://metrics/dashboard') {
      const stats = getSwarmStats();
      const summary = getMetricsSummary();
      const agents = getAllAgentStates();
      return JSON.stringify({
        overview: stats,
        metricsSummary: summary,
        agentPerformance: agents.map(a => ({
          id: a.agent_id,
          name: a.agent_name,
          status: a.status,
          tasksCompleted: a.tasks_completed,
          tasksFailed: a.tasks_failed,
          successRate: a.tasks_completed + a.tasks_failed > 0
            ? ((a.tasks_completed / (a.tasks_completed + a.tasks_failed)) * 100).toFixed(1) + '%'
            : 'N/A',
        })),
      }, null, 2);
    }

    // swarm://triggers
    if (uri === 'swarm://triggers') {
      const triggers = getAllTriggers();
      return JSON.stringify({
        triggers: triggers.map(t => ({
          id: t.trigger_id,
          type: t.trigger_type,
          condition: (() => { try { return JSON.parse(t.condition); } catch { return t.condition; } })(),
          action: (() => { try { return JSON.parse(t.action); } catch { return t.action; } })(),
          enabled: t.enabled,
          fireCount: t.fire_count,
          lastFired: t.last_fired,
          cooldownSecs: t.cooldown_secs,
        })),
        count: triggers.length,
      }, null, 2);
    }

    return JSON.stringify({ error: `Unknown swarm resource URI: ${uri}` });
  } catch (err: any) {
    return JSON.stringify({ error: `Failed to read swarm resource: ${err.message}` });
  }
}
