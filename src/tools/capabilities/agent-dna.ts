/**
 * VegaMCP — Agent DNA / Learned Preferences
 * Tracks per-agent performance stats and enables adaptive routing.
 * DNA builds up over time as agents complete tasks.
 */

interface TaskRecord {
  taskType: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
}

interface AgentDNA {
  agentId: string;
  taskHistory: TaskRecord[];
  specializations: Record<string, { successRate: number; avgDurationMs: number; count: number }>;
  strengths: string[];
  weaknesses: string[];
  totalTasks: number;
  overallSuccessRate: number;
  lastUpdated: string;
}

// In-memory DNA store
const dnaStore = new Map<string, AgentDNA>();

function getOrCreateDNA(agentId: string): AgentDNA {
  if (!dnaStore.has(agentId)) {
    dnaStore.set(agentId, {
      agentId,
      taskHistory: [],
      specializations: {},
      strengths: [],
      weaknesses: [],
      totalTasks: 0,
      overallSuccessRate: 0,
      lastUpdated: new Date().toISOString(),
    });
  }
  return dnaStore.get(agentId)!;
}

function recalculateDNA(dna: AgentDNA): void {
  // Recalculate specializations from history
  const byType: Record<string, { successes: number; total: number; totalMs: number }> = {};
  for (const rec of dna.taskHistory) {
    if (!byType[rec.taskType]) byType[rec.taskType] = { successes: 0, total: 0, totalMs: 0 };
    byType[rec.taskType].total++;
    byType[rec.taskType].totalMs += rec.durationMs;
    if (rec.success) byType[rec.taskType].successes++;
  }

  dna.specializations = {};
  for (const [type, stats] of Object.entries(byType)) {
    dna.specializations[type] = {
      successRate: stats.total > 0 ? Math.round((stats.successes / stats.total) * 100) : 0,
      avgDurationMs: stats.total > 0 ? Math.round(stats.totalMs / stats.total) : 0,
      count: stats.total,
    };
  }

  // Determine strengths (>80% success, 3+ tasks) and weaknesses (<60% success, 3+ tasks)
  dna.strengths = Object.entries(dna.specializations)
    .filter(([_, s]) => s.successRate >= 80 && s.count >= 3)
    .sort((a, b) => b[1].successRate - a[1].successRate)
    .map(([type]) => type);

  dna.weaknesses = Object.entries(dna.specializations)
    .filter(([_, s]) => s.successRate < 60 && s.count >= 3)
    .sort((a, b) => a[1].successRate - b[1].successRate)
    .map(([type]) => type);

  dna.totalTasks = dna.taskHistory.length;
  const successes = dna.taskHistory.filter(t => t.success).length;
  dna.overallSuccessRate = dna.totalTasks > 0 ? Math.round((successes / dna.totalTasks) * 100) : 0;
  dna.lastUpdated = new Date().toISOString();
}

export const agentDnaSchema = {
  name: 'agent_dna',
  description: 'Manage agent DNA — learned performance profiles that enable adaptive task routing. ' +
    'Record task outcomes, query agent specializations, and get routing recommendations ' +
    'based on historical performance data.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['record', 'get_profile', 'get_recommendation', 'list_profiles', 'reset'],
        description: 'Action to perform',
      },
      agent_id: {
        type: 'string',
        description: 'Agent ID (for record, get_profile, reset)',
      },
      task_type: {
        type: 'string',
        description: 'Task type completed (for record, get_recommendation)',
      },
      success: {
        type: 'boolean',
        description: 'Whether the task succeeded (for record)',
      },
      duration_ms: {
        type: 'number',
        description: 'Task duration in milliseconds (for record)',
      },
    },
    required: ['action'],
  },
};

export function handleAgentDna(args: any): string {
  try {
    const { action } = args;

    switch (action) {
      case 'record': {
        if (!args.agent_id || !args.task_type || args.success === undefined) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'agent_id, task_type, and success are required' } });
        }
        const dna = getOrCreateDNA(args.agent_id);
        dna.taskHistory.push({
          taskType: args.task_type,
          success: args.success,
          durationMs: args.duration_ms || 0,
          timestamp: new Date().toISOString(),
        });
        // Keep last 500 records
        if (dna.taskHistory.length > 500) dna.taskHistory = dna.taskHistory.slice(-500);
        recalculateDNA(dna);
        return JSON.stringify({
          success: true,
          agentId: args.agent_id,
          totalTasks: dna.totalTasks,
          overallSuccessRate: dna.overallSuccessRate,
          taskTypeStats: dna.specializations[args.task_type],
        });
      }

      case 'get_profile': {
        if (!args.agent_id) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'agent_id is required' } });
        }
        const dna = dnaStore.get(args.agent_id);
        if (!dna) {
          return JSON.stringify({ success: true, profile: null, message: 'No DNA profile exists yet for this agent' });
        }
        return JSON.stringify({
          success: true,
          profile: {
            agentId: dna.agentId,
            totalTasks: dna.totalTasks,
            overallSuccessRate: dna.overallSuccessRate,
            strengths: dna.strengths,
            weaknesses: dna.weaknesses,
            specializations: dna.specializations,
            lastUpdated: dna.lastUpdated,
          },
        });
      }

      case 'get_recommendation': {
        if (!args.task_type) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'task_type is required' } });
        }
        const candidates: { agentId: string; score: number; successRate: number; avgDuration: number; count: number }[] = [];
        for (const [agentId, dna] of dnaStore.entries()) {
          const spec = dna.specializations[args.task_type];
          if (spec && spec.count >= 1) {
            // Score = success rate weighted by experience
            const experienceBonus = Math.min(spec.count / 10, 1); // max 1.0 at 10+ tasks
            const score = spec.successRate * (0.5 + 0.5 * experienceBonus);
            candidates.push({
              agentId,
              score: Math.round(score),
              successRate: spec.successRate,
              avgDuration: spec.avgDurationMs,
              count: spec.count,
            });
          }
        }
        candidates.sort((a, b) => b.score - a.score);
        return JSON.stringify({
          success: true,
          taskType: args.task_type,
          recommendations: candidates.slice(0, 5),
          bestAgent: candidates[0]?.agentId || null,
          message: candidates.length > 0
            ? `Best agent for "${args.task_type}": ${candidates[0].agentId} (${candidates[0].successRate}% success, ${candidates[0].count} tasks)`
            : `No agents have DNA data for task type "${args.task_type}" yet`,
        });
      }

      case 'list_profiles': {
        const profiles = Array.from(dnaStore.values()).map(dna => ({
          agentId: dna.agentId,
          totalTasks: dna.totalTasks,
          overallSuccessRate: dna.overallSuccessRate,
          strengths: dna.strengths,
          weaknesses: dna.weaknesses,
          lastUpdated: dna.lastUpdated,
        }));
        return JSON.stringify({ success: true, profiles, count: profiles.length });
      }

      case 'reset': {
        if (args.agent_id) {
          dnaStore.delete(args.agent_id);
          return JSON.stringify({ success: true, message: `DNA profile for "${args.agent_id}" reset` });
        }
        const count = dnaStore.size;
        dnaStore.clear();
        return JSON.stringify({ success: true, message: `All ${count} DNA profiles reset` });
      }

      default:
        return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'DNA_ERROR', message: err.message } });
  }
}
