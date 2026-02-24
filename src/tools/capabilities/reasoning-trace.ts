/**
 * VegaMCP — Chain of Thought Logger (Reasoning Trace)
 * Captures structured decision traces for pipeline/task steps.
 * Enables explainable AI — "why did the swarm make this decision?"
 */

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface TraceStep {
  stepId: string;
  action: string;
  input: any;
  reasoning: string;
  alternatives: { option: string; reason_rejected: string }[];
  decision: string;
  output: any;
  durationMs: number;
  timestamp: string;
}

interface ReasoningTrace {
  id: string;
  taskId: string | null;
  pipelineId: string | null;
  title: string;
  steps: TraceStep[];
  createdAt: string;
  completedAt: string | null;
  status: 'in_progress' | 'completed' | 'failed';
  summary: string | null;
}

// In-memory store
const traces = new Map<string, ReasoningTrace>();
const MAX_TRACES = 100;

export const reasoningTraceSchema = {
  name: 'reasoning_trace',
  description: 'Log and query structured reasoning traces for pipeline and task decisions. ' +
    'Record each decision step with inputs, reasoning, rejected alternatives, and outputs. ' +
    'Query traces to understand why the swarm made specific decisions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'add_step', 'complete', 'query', 'list', 'get'],
        description: 'Action to perform',
      },
      trace_id: {
        type: 'string',
        description: 'Trace ID (for add_step, complete, get)',
      },
      title: {
        type: 'string',
        description: 'Trace title (for create)',
      },
      task_id: {
        type: 'string',
        description: 'Associated task ID (for create)',
      },
      pipeline_id: {
        type: 'string',
        description: 'Associated pipeline ID (for create)',
      },
      step_action: {
        type: 'string',
        description: 'What action was taken (for add_step)',
      },
      input: {
        type: 'object',
        description: 'Step input data (for add_step)',
        properties: {},
      },
      reasoning: {
        type: 'string',
        description: 'Why this decision was made (for add_step)',
      },
      alternatives: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            option: { type: 'string' },
            reason_rejected: { type: 'string' },
          },
        },
        description: 'Alternatives considered and why they were rejected (for add_step)',
      },
      decision: {
        type: 'string',
        description: 'Final decision made (for add_step)',
      },
      output: {
        type: 'object',
        description: 'Step output data (for add_step)',
        properties: {},
      },
      duration_ms: {
        type: 'number',
        description: 'Step duration in ms (for add_step)',
      },
      summary: {
        type: 'string',
        description: 'Overall trace summary (for complete)',
      },
      status: {
        type: 'string',
        enum: ['completed', 'failed'],
        description: 'Final status (for complete)',
      },
      search: {
        type: 'string',
        description: 'Search text in trace titles and reasoning (for query)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return',
        default: 10,
      },
    },
    required: ['action'],
  },
};

export function handleReasoningTrace(args: any): string {
  try {
    const { action } = args;

    switch (action) {
      case 'create': {
        const trace: ReasoningTrace = {
          id: `trace-${genId()}`,
          taskId: args.task_id || null,
          pipelineId: args.pipeline_id || null,
          title: args.title || 'Untitled Trace',
          steps: [],
          createdAt: new Date().toISOString(),
          completedAt: null,
          status: 'in_progress',
          summary: null,
        };
        traces.set(trace.id, trace);
        // Trim old traces
        if (traces.size > MAX_TRACES) {
          const oldest = Array.from(traces.keys())[0];
          traces.delete(oldest);
        }
        return JSON.stringify({
          success: true,
          trace: { id: trace.id, title: trace.title },
          message: `Reasoning trace "${trace.title}" started`,
        });
      }

      case 'add_step': {
        const trace = traces.get(args.trace_id);
        if (!trace) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Trace not found' } });
        }
        const step: TraceStep = {
          stepId: `step-${trace.steps.length + 1}`,
          action: args.step_action || 'unknown',
          input: args.input || {},
          reasoning: args.reasoning || '',
          alternatives: args.alternatives || [],
          decision: args.decision || '',
          output: args.output || {},
          durationMs: args.duration_ms || 0,
          timestamp: new Date().toISOString(),
        };
        trace.steps.push(step);
        return JSON.stringify({
          success: true,
          step: { stepId: step.stepId, action: step.action, decision: step.decision },
          totalSteps: trace.steps.length,
        });
      }

      case 'complete': {
        const trace = traces.get(args.trace_id);
        if (!trace) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Trace not found' } });
        }
        trace.status = args.status || 'completed';
        trace.completedAt = new Date().toISOString();
        trace.summary = args.summary || `Completed with ${trace.steps.length} steps`;
        return JSON.stringify({
          success: true,
          trace: {
            id: trace.id, title: trace.title, status: trace.status,
            totalSteps: trace.steps.length, summary: trace.summary,
          },
        });
      }

      case 'get': {
        const trace = traces.get(args.trace_id);
        if (!trace) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Trace not found' } });
        }
        return JSON.stringify({
          success: true,
          trace: {
            id: trace.id,
            title: trace.title,
            taskId: trace.taskId,
            pipelineId: trace.pipelineId,
            status: trace.status,
            summary: trace.summary,
            createdAt: trace.createdAt,
            completedAt: trace.completedAt,
            steps: trace.steps.map(s => ({
              stepId: s.stepId,
              action: s.action,
              reasoning: s.reasoning,
              decision: s.decision,
              alternativesCount: s.alternatives.length,
              alternatives: s.alternatives,
              durationMs: s.durationMs,
              timestamp: s.timestamp,
            })),
            totalSteps: trace.steps.length,
          },
        });
      }

      case 'list': {
        const limit = args.limit || 10;
        const allTraces = Array.from(traces.values()).reverse().slice(0, limit);
        return JSON.stringify({
          success: true,
          traces: allTraces.map(t => ({
            id: t.id,
            title: t.title,
            taskId: t.taskId,
            status: t.status,
            totalSteps: t.steps.length,
            createdAt: t.createdAt,
            completedAt: t.completedAt,
          })),
          count: allTraces.length,
          totalTraces: traces.size,
        });
      }

      case 'query': {
        const search = (args.search || '').toLowerCase();
        const limit = args.limit || 10;
        const results = Array.from(traces.values())
          .filter(t =>
            t.title.toLowerCase().includes(search) ||
            t.steps.some(s => s.reasoning.toLowerCase().includes(search) || s.decision.toLowerCase().includes(search))
          )
          .reverse()
          .slice(0, limit);
        return JSON.stringify({
          success: true,
          results: results.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            matchingSteps: t.steps.filter(s =>
              s.reasoning.toLowerCase().includes(search) || s.decision.toLowerCase().includes(search)
            ).map(s => ({ stepId: s.stepId, action: s.action, decision: s.decision })),
          })),
          count: results.length,
        });
      }

      default:
        return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'TRACE_ERROR', message: err.message } });
  }
}
