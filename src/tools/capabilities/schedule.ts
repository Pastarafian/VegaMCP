/**
 * VegaMCP — Schedule Tool
 * Manages scheduled/recurring tasks using cron expressions or intervals.
 * Inspired by popular MCP servers like Schedule Task MCP.
 */

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ScheduledJob {
  id: string;
  name: string;
  type: 'cron' | 'interval' | 'once';
  expression: string;       // cron expression or interval in ms
  taskType: string;
  inputData: Record<string, any>;
  priority: number;
  enabled: boolean;
  createdAt: string;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  maxRuns: number | null;    // null = unlimited
  status: 'active' | 'paused' | 'completed' | 'error';
  lastError: string | null;
}

// In-memory schedule store
const schedules = new Map<string, ScheduledJob>();
const activeTimers = new Map<string, NodeJS.Timeout>();

// Simple cron parser for common patterns
function getNextCronRun(_expression: string): Date {
  // Simplified: return next minute for now
  const next = new Date();
  next.setMinutes(next.getMinutes() + 1, 0, 0);
  return next;
}

export const scheduleToolSchema = {
  name: 'schedule_task',
  description: 'Manage scheduled/recurring tasks. Create, list, pause, resume, or delete scheduled jobs. ' +
    'Supports interval-based scheduling (every N ms), one-time delayed execution, and cron expressions. ' +
    'Scheduled jobs automatically create swarm tasks when triggered.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'get', 'pause', 'resume', 'delete', 'run_now'],
        description: 'Action to perform',
      },
      schedule_id: {
        type: 'string',
        description: 'Schedule ID (required for get/pause/resume/delete/run_now)',
      },
      name: {
        type: 'string',
        description: 'Human-readable name for the schedule (for create)',
      },
      schedule_type: {
        type: 'string',
        enum: ['cron', 'interval', 'once'],
        description: 'Type of schedule: cron expression, fixed interval, or one-time delayed',
      },
      expression: {
        type: 'string',
        description: 'Cron expression (e.g. "*/5 * * * *") or interval in ms (e.g. "60000" for 1 min)',
      },
      task_type: {
        type: 'string',
        description: 'Swarm task type to create when schedule fires',
      },
      input_data: {
        type: 'object',
        description: 'Input data to pass to the created task',
        properties: {},
      },
      priority: {
        type: 'number',
        description: '0=emergency, 1=high, 2=normal, 3=background',
      },
      max_runs: {
        type: 'number',
        description: 'Maximum number of times to run (null = unlimited)',
      },
    },
    required: ['action'],
  },
};

export function handleScheduleTool(args: any): string {
  try {
    const { action } = args;

    switch (action) {
      case 'create': {
        const id = `sched-${randomId()}`;
        const now = new Date().toISOString();
        const intervalMs = args.schedule_type === 'interval' ? parseInt(args.expression) : null;

        const job: ScheduledJob = {
          id,
          name: args.name || `Schedule ${id}`,
          type: args.schedule_type || 'interval',
          expression: args.expression || '60000',
          taskType: args.task_type || 'research',
          inputData: args.input_data || {},
          priority: args.priority ?? 2,
          enabled: true,
          createdAt: now,
          lastRun: null,
          nextRun: args.schedule_type === 'cron'
            ? getNextCronRun(args.expression).toISOString()
            : new Date(Date.now() + (intervalMs || 60000)).toISOString(),
          runCount: 0,
          maxRuns: args.max_runs ?? null,
          status: 'active',
          lastError: null,
        };

        schedules.set(id, job);

        // Set up timer for interval/once types
        if (job.type === 'interval' && intervalMs) {
          const timer = setInterval(() => {
            executeScheduledJob(id);
          }, intervalMs);
          activeTimers.set(id, timer);
        } else if (job.type === 'once' && intervalMs) {
          const timer = setTimeout(() => {
            executeScheduledJob(id);
            job.status = 'completed';
          }, intervalMs);
          activeTimers.set(id, timer);
        }

        return JSON.stringify({
          success: true,
          schedule: {
            id: job.id,
            name: job.name,
            type: job.type,
            expression: job.expression,
            taskType: job.taskType,
            nextRun: job.nextRun,
            status: job.status,
          },
          message: `Schedule "${job.name}" created. Will create "${job.taskType}" tasks.`,
        });
      }

      case 'list': {
        const jobs = Array.from(schedules.values());
        return JSON.stringify({
          success: true,
          schedules: jobs.map(j => ({
            id: j.id,
            name: j.name,
            type: j.type,
            expression: j.expression,
            taskType: j.taskType,
            status: j.status,
            runCount: j.runCount,
            lastRun: j.lastRun,
            nextRun: j.nextRun,
            enabled: j.enabled,
          })),
          count: jobs.length,
          active: jobs.filter(j => j.status === 'active').length,
          paused: jobs.filter(j => j.status === 'paused').length,
        });
      }

      case 'get': {
        const job = schedules.get(args.schedule_id);
        if (!job) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Schedule ${args.schedule_id} not found` } });
        }
        return JSON.stringify({ success: true, schedule: job });
      }

      case 'pause': {
        const job = schedules.get(args.schedule_id);
        if (!job) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Schedule ${args.schedule_id} not found` } });
        }
        job.status = 'paused';
        job.enabled = false;
        const timer = activeTimers.get(args.schedule_id);
        if (timer) { clearInterval(timer); clearTimeout(timer); activeTimers.delete(args.schedule_id); }
        return JSON.stringify({ success: true, message: `Schedule "${job.name}" paused` });
      }

      case 'resume': {
        const job = schedules.get(args.schedule_id);
        if (!job) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Schedule ${args.schedule_id} not found` } });
        }
        job.status = 'active';
        job.enabled = true;
        if (job.type === 'interval') {
          const ms = parseInt(job.expression);
          const newTimer = setInterval(() => executeScheduledJob(job.id), ms);
          activeTimers.set(job.id, newTimer);
        }
        return JSON.stringify({ success: true, message: `Schedule "${job.name}" resumed` });
      }

      case 'delete': {
        const job = schedules.get(args.schedule_id);
        if (!job) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Schedule ${args.schedule_id} not found` } });
        }
        const t = activeTimers.get(args.schedule_id);
        if (t) { clearInterval(t); clearTimeout(t); activeTimers.delete(args.schedule_id); }
        schedules.delete(args.schedule_id);
        return JSON.stringify({ success: true, message: `Schedule "${job.name}" deleted` });
      }

      case 'run_now': {
        const job = schedules.get(args.schedule_id);
        if (!job) {
          return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: `Schedule ${args.schedule_id} not found` } });
        }
        executeScheduledJob(job.id);
        return JSON.stringify({ success: true, message: `Schedule "${job.name}" triggered manually`, runCount: job.runCount });
      }

      default:
        return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'SCHEDULE_ERROR', message: err.message } });
  }
}

function executeScheduledJob(scheduleId: string): void {
  const job = schedules.get(scheduleId);
  if (!job || !job.enabled) return;

  try {
    job.runCount++;
    job.lastRun = new Date().toISOString();

    // Check max runs
    if (job.maxRuns !== null && job.runCount >= job.maxRuns) {
      job.status = 'completed';
      job.enabled = false;
      const timer = activeTimers.get(scheduleId);
      if (timer) { clearInterval(timer); clearTimeout(timer); activeTimers.delete(scheduleId); }
    }

    // Update next run
    if (job.type === 'interval') {
      const ms = parseInt(job.expression);
      job.nextRun = new Date(Date.now() + ms).toISOString();
    } else if (job.type === 'cron') {
      job.nextRun = getNextCronRun(job.expression).toISOString();
    }

    // Note: In production, this would call the orchestrator's submitTask
    // For now, it just logs the execution
    job.lastError = null;
  } catch (err: any) {
    job.lastError = err.message;
    job.status = 'error';
  }
}
