/**
 * VegaMCP — Swarm List Agents Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { getAllAgentStates } from '../../db/swarm-store.js';

export const swarmListAgentsSchema = {
  name: 'swarm_list_agents',
  description: 'List all registered swarm agents with their current status, role, coordinator, model preference, and performance metrics.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      coordinator: { type: 'string', description: 'Optional: filter by coordinator (research, risk, execution)' },
      status: { type: 'string', description: 'Optional: filter by status (idle, processing, error, paused, terminated)' },
    },
  },
};

export async function handleSwarmListAgents(args: any) {
  const start = Date.now();
  try {
    let agents = getAllAgentStates();

    if (args.coordinator) {
      agents = agents.filter(a => a.coordinator === args.coordinator);
    }
    if (args.status) {
      agents = agents.filter(a => a.status === args.status);
    }

    const result = {
      success: true,
      agents: agents.map(a => ({
        agent_id: a.agent_id,
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
        lastError: a.last_error,
      })),
      totalAgents: agents.length,
    };

    logAudit('swarm_list_agents', `Listed ${agents.length} agents`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('swarm_list_agents', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
