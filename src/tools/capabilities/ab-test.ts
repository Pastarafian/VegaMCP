/**
 * VegaMCP — A/B Testing for Models
 * Compare model outputs side by side. Track which model performs best per task type.
 */

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ABTestResult {
  id: string; prompt: string; taskType: string; models: string[];
  results: { model: string; output: string; durationMs: number; tokenCount: number; score: number | null }[];
  winner: string | null; createdAt: string;
}

interface ModelStats {
  model: string; totalTests: number; wins: number; avgDurationMs: number;
  byTaskType: Record<string, { tests: number; wins: number; avgDuration: number }>;
}

const testResults: ABTestResult[] = [];
const modelStats = new Map<string, ModelStats>();
const MAX_RESULTS = 100;

function updateStats(result: ABTestResult): void {
  for (const r of result.results) {
    if (!modelStats.has(r.model)) {
      modelStats.set(r.model, { model: r.model, totalTests: 0, wins: 0, avgDurationMs: 0, byTaskType: {} });
    }
    const stats = modelStats.get(r.model)!;
    stats.totalTests++;
    stats.avgDurationMs = Math.round(((stats.avgDurationMs * (stats.totalTests - 1)) + r.durationMs) / stats.totalTests);
    if (result.winner === r.model) stats.wins++;
    if (!stats.byTaskType[result.taskType]) stats.byTaskType[result.taskType] = { tests: 0, wins: 0, avgDuration: 0 };
    const tt = stats.byTaskType[result.taskType];
    tt.tests++; tt.avgDuration = Math.round(((tt.avgDuration * (tt.tests - 1)) + r.durationMs) / tt.tests);
    if (result.winner === r.model) tt.wins++;
  }
}

export const abTestSchema = {
  name: 'ab_test',
  description: 'A/B test prompts across models. Record test results, declare winners, and query stats to find the best model per task type.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['record', 'get_stats', 'get_best', 'list_tests', 'clear'] },
      prompt: { type: 'string', description: 'Test prompt (for record)' },
      task_type: { type: 'string', description: 'Task type (for record, get_best)' },
      results: { type: 'array', items: { type: 'object', properties: {
        model: { type: 'string' }, output: { type: 'string' },
        duration_ms: { type: 'number' }, token_count: { type: 'number' }, score: { type: 'number' }
      }}, description: 'Model results (for record)' },
      winner: { type: 'string', description: 'Winning model (for record)' },
      model: { type: 'string', description: 'Filter by model (for get_stats)' },
      limit: { type: 'number', default: 10 },
    },
    required: ['action'],
  },
};

export function handleABTest(args: any): string {
  try {
    switch (args.action) {
      case 'record': {
        if (!args.results || args.results.length < 2) {
          return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'Need at least 2 model results' } });
        }
        const test: ABTestResult = {
          id: `ab-${genId()}`, prompt: args.prompt || '', taskType: args.task_type || 'general',
          models: args.results.map((r: any) => r.model),
          results: args.results.map((r: any) => ({
            model: r.model, output: r.output || '', durationMs: r.duration_ms || 0,
            tokenCount: r.token_count || 0, score: r.score ?? null,
          })),
          winner: args.winner || null, createdAt: new Date().toISOString(),
        };
        testResults.unshift(test);
        while (testResults.length > MAX_RESULTS) testResults.pop();
        updateStats(test);
        return JSON.stringify({ success: true, testId: test.id, winner: test.winner, models: test.models });
      }
      case 'get_stats': {
        if (args.model) {
          const s = modelStats.get(args.model);
          if (!s) return JSON.stringify({ success: true, stats: null, message: 'No data for this model' });
          return JSON.stringify({ success: true, stats: { ...s, winRate: s.totalTests > 0 ? Math.round((s.wins / s.totalTests) * 100) : 0 } });
        }
        const all = Array.from(modelStats.values()).map(s => ({
          ...s, winRate: s.totalTests > 0 ? Math.round((s.wins / s.totalTests) * 100) : 0,
        })).sort((a, b) => b.winRate - a.winRate);
        return JSON.stringify({ success: true, stats: all, count: all.length });
      }
      case 'get_best': {
        if (!args.task_type) return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'task_type required' } });
        const candidates: { model: string; winRate: number; tests: number; avgDuration: number }[] = [];
        for (const [model, stats] of modelStats.entries()) {
          const tt = stats.byTaskType[args.task_type];
          if (tt && tt.tests >= 1) {
            candidates.push({ model, winRate: Math.round((tt.wins / tt.tests) * 100), tests: tt.tests, avgDuration: tt.avgDuration });
          }
        }
        candidates.sort((a, b) => b.winRate - a.winRate || a.avgDuration - b.avgDuration);
        return JSON.stringify({ success: true, taskType: args.task_type, bestModel: candidates[0]?.model || null, rankings: candidates });
      }
      case 'list_tests': {
        const limit = args.limit || 10;
        return JSON.stringify({ success: true, tests: testResults.slice(0, limit).map(t => ({
          id: t.id, taskType: t.taskType, models: t.models, winner: t.winner, createdAt: t.createdAt })),
          count: Math.min(limit, testResults.length), total: testResults.length });
      }
      case 'clear': {
        const c = testResults.length; testResults.length = 0; modelStats.clear();
        return JSON.stringify({ success: true, message: `Cleared ${c} test results` });
      }
      default: return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown: ${args.action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'AB_TEST_ERROR', message: err.message } });
  }
}
