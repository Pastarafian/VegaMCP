/**
 * VegaMCP — Swarm Get Task Status Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { getTask, getSubTasks } from '../../db/swarm-store.js';

export const swarmGetTaskStatusSchema = {
  name: 'swarm_get_task_status',
  description: 'Check the status of a swarm task by its ID. Returns full task details including status, assigned agent, output data, and any subtasks.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      task_id: { type: 'string', description: 'The task ID to check' },
    },
    required: ['task_id'],
  },
};

export async function handleSwarmGetTaskStatus(args: any) {
  const start = Date.now();
  try {
    const task = getTask(args.task_id);
    if (!task) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Task ${args.task_id} not found` } }) }] };
    }

    const subtasks = getSubTasks(args.task_id);
    let outputData: any = null;
    try { outputData = task.output_data ? JSON.parse(task.output_data) : null; } catch { outputData = task.output_data; }

    let inputData: any = null;
    try { inputData = task.input_data ? JSON.parse(task.input_data) : null; } catch { inputData = task.input_data; }

    const result = {
      success: true,
      task: {
        ...task,
        input_data: inputData,
        output_data: outputData,
      },
      subtasks: subtasks.map(st => ({
        task_id: st.task_id,
        task_type: st.task_type,
        status: st.status,
        assigned_agent: st.assigned_agent,
      })),
      subtaskCount: subtasks.length,
    };

    logAudit('swarm_get_task_status', `Checked task ${args.task_id}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('swarm_get_task_status', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
