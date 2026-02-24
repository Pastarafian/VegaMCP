/**
 * VegaMCP — Swarm Create Task Tool
 */

import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';
import { getOrchestrator } from '../../swarm/orchestrator.js';

export const swarmCreateTaskSchema = {
  name: 'swarm_create_task',
  description: 'Create a new task for the swarm to process. The task will be routed to the appropriate coordinator and agent based on task_type. Task types include: research, deep_research, web_research, data_analysis, pattern_analysis, trend_analysis, content_creation, documentation, code_generation, code_review, debugging, refactoring, planning, task_decomposition, review, validation, testing, critique, feedback, integration, monitoring, health_check, summarize, generate_report.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      task_type: { type: 'string', description: 'Type of task to create' },
      priority: { type: 'number', description: 'Priority: 0=emergency, 1=high, 2=normal, 3=background', default: 2 },
      input_data: { type: 'object', description: 'Input data for the task', properties: {} },
      timeout: { type: 'number', description: 'Timeout in seconds', default: 300 },
      target_agent: { type: 'string', description: 'Optional: specific agent to assign the task to' },
    },
    required: ['task_type'],
  },
};

export async function handleSwarmCreateTask(args: any) {
  const start = Date.now();
  const rateCheck = checkRateLimit('swarm');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const orchestrator = getOrchestrator();
    const taskId = await orchestrator.submitTask(
      args.task_type,
      args.input_data || {},
      {
        priority: args.priority ?? 2,
        targetAgent: args.target_agent,
        timeout: args.timeout || 300,
      }
    );

    logAudit('swarm_create_task', `Created task ${taskId} (${args.task_type})`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, task_id: taskId, task_type: args.task_type, priority: args.priority ?? 2 }, null, 2) }] };
  } catch (err: any) {
    logAudit('swarm_create_task', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
