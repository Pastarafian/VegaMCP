/**
 * VegaMCP — State Machine / Workflow Engine
 * Multi-step workflows with conditional branching.
 * MCP Tool: workflow_execute
 */

import { logAudit } from '../../db/graph-store.js';
import { getOrchestrator } from '../../swarm/orchestrator.js';

// ═══════════════════════════════════════════════
// BUILT-IN WORKFLOW TEMPLATES
// ═══════════════════════════════════════════════

const WORKFLOW_TEMPLATES: Record<string, any> = {
  research_report: {
    name: 'Research Report Pipeline',
    description: 'Complete research pipeline: research → analyze → review → summarize',
    states: {
      research: { agent: 'researcher', taskType: 'research', next: 'analyze' },
      analyze: { agent: 'analyst', taskType: 'data_analysis', next: 'review' },
      review: { agent: 'reviewer', taskType: 'review', next: { approved: 'summarize', rejected: 'revise' } },
      revise: { agent: 'writer', taskType: 'content_creation', next: 'review' },
      summarize: { agent: 'summarizer', taskType: 'summarize', next: 'complete' },
      complete: { terminal: true, notify: true },
    },
  },
  code_pipeline: {
    name: 'Code Development Pipeline',
    description: 'Full dev cycle: plan → code → review → test → report',
    states: {
      plan: { agent: 'planner', taskType: 'planning', next: 'code' },
      code: { agent: 'coder', taskType: 'code_generation', next: 'review' },
      review: { agent: 'reviewer', taskType: 'code_review', next: { approved: 'test', rejected: 'revise' } },
      revise: { agent: 'coder', taskType: 'debugging', next: 'review' },
      test: { agent: 'reviewer', taskType: 'testing', next: 'report' },
      report: { agent: 'summarizer', taskType: 'generate_report', next: 'complete' },
      complete: { terminal: true, notify: true },
    },
  },
  content_creation: {
    name: 'Content Creation Pipeline',
    description: 'Content pipeline: research → write → critique → revise → publish',
    states: {
      research: { agent: 'researcher', taskType: 'research', next: 'write' },
      write: { agent: 'writer', taskType: 'content_creation', next: 'critique' },
      critique: { agent: 'critic', taskType: 'critique', next: { good: 'publish', needs_work: 'revise' } },
      revise: { agent: 'writer', taskType: 'content_creation', next: 'critique' },
      publish: { agent: 'summarizer', taskType: 'summarize', next: 'complete' },
      complete: { terminal: true, notify: true },
    },
  },
};

// ═══════════════════════════════════════════════
// MCP TOOL
// ═══════════════════════════════════════════════

export const workflowExecuteSchema = {
  name: 'workflow_execute',
  description: 'Execute a multi-step workflow (state machine) with conditional branching. Choose a built-in template (research_report, code_pipeline, content_creation) or define a custom workflow.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      template: { type: 'string', description: 'Built-in template name', enum: Object.keys(WORKFLOW_TEMPLATES) },
      custom_workflow: {
        type: 'object',
        description: 'Custom workflow definition (if not using a template)',
        properties: {
          name: { type: 'string' },
          states: { type: 'object', description: 'Map of state IDs to state definitions', properties: {} },
          initial_state: { type: 'string' },
        },
      },
      input: { type: 'object', description: 'Input data passed to the first step', properties: {} },
      priority: { type: 'number', description: 'Pipeline priority', default: 2 },
    },
  },
};

export async function handleWorkflowExecute(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  try {
    let workflow: any;

    if (args.template && WORKFLOW_TEMPLATES[args.template]) {
      workflow = WORKFLOW_TEMPLATES[args.template];
    } else if (args.custom_workflow) {
      workflow = args.custom_workflow;
    } else {
      return { content: [{ type: 'text', text: JSON.stringify({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Provide either a template name or custom_workflow definition' },
        available_templates: Object.entries(WORKFLOW_TEMPLATES).map(([key, val]: [string, any]) => ({
          name: key,
          description: val.description,
          states: Object.keys(val.states),
        })),
      }, null, 2) }] };
    }

    // Convert workflow states to pipeline steps
    const states = workflow.states;
    const stateIds = Object.keys(states);
    const steps: any[] = [];

    for (const stateId of stateIds) {
      const state = states[stateId];
      if (state.terminal) continue;

      const step: any = {
        stepId: stateId,
        taskType: state.taskType || state.task_type || 'generic',
        input: { ...(args.input || {}), workflowState: stateId },
      };

      if (typeof state.next === 'string') {
        step.onSuccess = state.next;
      } else if (typeof state.next === 'object') {
        const successKey = Object.keys(state.next).find(k => k !== 'fail' && k !== 'denied' && k !== 'rejected' && k !== 'needs_work') || Object.keys(state.next)[0];
        step.onSuccess = state.next[successKey];
        step.onFailure = state.next.fail || state.next.denied || state.next.rejected || state.next.needs_work;
      }

      steps.push(step);
    }

    const initialState = workflow.initial_state || stateIds.find(s => !states[s].terminal) || stateIds[0];

    const orchestrator = getOrchestrator();
    const executionId = await orchestrator.runPipeline({
      pipelineId: `workflow-${Date.now().toString(36)}`,
      name: workflow.name || 'Custom Workflow',
      description: workflow.description || '',
      steps,
      initialStepId: initialState,
      priority: args.priority ?? 2,
      timeoutMs: 600000,
    });

    logAudit('workflow_execute', `Started workflow ${executionId}: ${workflow.name}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true,
      execution_id: executionId,
      workflow: workflow.name,
      states: stateIds,
      initialState,
      stepCount: steps.length,
      message: 'Workflow started. Use swarm_get_task_status to monitor progress.',
    }, null, 2) }] };
  } catch (err: any) {
    logAudit('workflow_execute', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
