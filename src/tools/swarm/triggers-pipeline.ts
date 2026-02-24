/**
 * VegaMCP — Swarm Register Trigger Tool
 */

import { logAudit } from '../../db/graph-store.js';
import { registerTrigger, getAllTriggers, deleteTrigger } from '../../db/swarm-store.js';

export const swarmRegisterTriggerSchema = {
  name: 'swarm_register_trigger',
  description: 'Register an event trigger that automatically creates tasks when conditions are met. Trigger types: event (data events), schedule (cron-like), webhook (external), threshold (metric-based), manual.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      trigger_type: { type: 'string', description: 'Type of trigger', enum: ['event', 'schedule', 'webhook', 'threshold', 'manual'] },
      condition: { type: 'object', description: 'JSON condition definition (e.g., { source: "monitor", event: "threshold_exceeded", value: 100 })', properties: {} },
      action: { type: 'object', description: 'JSON action to take (e.g., { task_type: "research", priority: 1, input: {} })', properties: {} },
      cooldown: { type: 'number', description: 'Minimum seconds between fires', default: 60 },
      enabled: { type: 'boolean', description: 'Whether the trigger is active', default: true },
    },
    required: ['trigger_type', 'condition', 'action'],
  },
};

export async function handleSwarmRegisterTrigger(args: any) {
  const start = Date.now();
  try {
    const trigger = registerTrigger({
      trigger_type: args.trigger_type,
      condition: JSON.stringify(args.condition),
      action: JSON.stringify(args.action),
      enabled: args.enabled !== false,
      cooldown_secs: args.cooldown || 60,
    });

    logAudit('swarm_register_trigger', `Registered trigger ${trigger.trigger_id}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, trigger }, null, 2) }] };
  } catch (err: any) {
    logAudit('swarm_register_trigger', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}

/**
 * VegaMCP — Swarm Run Pipeline Tool
 */

export const swarmRunPipelineSchema = {
  name: 'swarm_run_pipeline',
  description: 'Execute a multi-step pipeline — a chain of agent tasks with conditional branching. Each step runs an agent task and routes to the next based on success/failure.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Pipeline name' },
      steps: {
        type: 'array',
        description: 'Ordered list of pipeline steps',
        items: {
          type: 'object',
          properties: {
            step_id: { type: 'string', description: 'Unique step identifier' },
            task_type: { type: 'string', description: 'Task type to execute' },
            input: { type: 'object', description: 'Input data for the task', properties: {} },
            on_success: { type: 'string', description: 'Step ID to run on success' },
            on_failure: { type: 'string', description: 'Step ID to run on failure' },
          },
          required: ['step_id', 'task_type'],
        },
      },
      initial_step: { type: 'string', description: 'Step ID to start with' },
      priority: { type: 'number', description: 'Pipeline priority', default: 2 },
      timeout: { type: 'number', description: 'Total pipeline timeout in ms', default: 300000 },
    },
    required: ['name', 'steps', 'initial_step'],
  },
};

export async function handleSwarmRunPipeline(args: any) {
  const start = Date.now();
  try {
    const { getOrchestrator } = await import('../../swarm/orchestrator.js');
    const orchestrator = getOrchestrator();

    const pipelineId = `pipe-${Date.now().toString(36)}`;
    const definition = {
      pipelineId,
      name: args.name,
      description: args.description || '',
      steps: args.steps.map((s: any) => ({
        stepId: s.step_id,
        taskType: s.task_type,
        input: s.input || {},
        onSuccess: s.on_success,
        onFailure: s.on_failure,
      })),
      initialStepId: args.initial_step,
      priority: args.priority ?? 2,
      timeoutMs: args.timeout || 300000,
    };

    const executionId = await orchestrator.runPipeline(definition);

    logAudit('swarm_run_pipeline', `Started pipeline ${executionId}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, execution_id: executionId, pipeline: args.name, steps: args.steps.length }, null, 2) }] };
  } catch (err: any) {
    logAudit('swarm_run_pipeline', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
