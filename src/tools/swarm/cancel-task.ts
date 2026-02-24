/**
 * VegaMCP — Swarm Cancel Task Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { getOrchestrator } from '../../swarm/orchestrator.js';

export const swarmCancelTaskSchema = {
  name: 'swarm_cancel_task',
  description: 'Cancel a queued or running swarm task.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      task_id: { type: 'string', description: 'The task ID to cancel' },
      reason: { type: 'string', description: 'Reason for cancellation', default: 'User requested' },
    },
    required: ['task_id'],
  },
};

export async function handleSwarmCancelTask(args: any) {
  const start = Date.now();
  try {
    const orchestrator = getOrchestrator();
    const cancelled = await orchestrator.cancelTask(args.task_id, args.reason || 'User requested');

    if (!cancelled) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'CANCEL_FAILED', message: 'Task not found or already completed/cancelled' } }) }] };
    }

    logAudit('swarm_cancel_task', `Cancelled task ${args.task_id}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, task_id: args.task_id, status: 'cancelled', reason: args.reason }) }] };
  } catch (err: any) {
    logAudit('swarm_cancel_task', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
