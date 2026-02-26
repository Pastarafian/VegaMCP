/**
 * VegaMCP — A/B Testing for Models (v2 — Persistent)
 * Compare model outputs side by side. Track which model performs best per task type.
 * Results are persisted to SQLite for cross-session analysis.
 */

import { getDb, saveDatabase } from '../../db/graph-store.js';

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ABTestResult {
  id: string; prompt: string; taskType: string; models: string[];
  results: { model: string; output: string; durationMs: number; tokenCount: number; score: number | null }[];
  winner: string | null; createdAt: string;
}

// ── Table Init ──

let tablesInit = false;

function initTables(): void {
  if (tablesInit) return;
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS ab_tests (
      id TEXT PRIMARY KEY,
      prompt TEXT DEFAULT '',
      task_type TEXT DEFAULT 'general',
      models TEXT DEFAULT '[]',
      results TEXT DEFAULT '[]',
      winner TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ab_task_type ON ab_tests(task_type);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS ab_model_stats (
      model TEXT NOT NULL,
      task_type TEXT NOT NULL,
      tests INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      PRIMARY KEY (model, task_type)
    );
  `);

  saveDatabase();
  tablesInit = true;
}

function updateStats(result: ABTestResult): void {
  const db = getDb();
  for (const r of result.results) {
    const isWinner = result.winner === r.model ? 1 : 0;
    db.run(
      `INSERT INTO ab_model_stats (model, task_type, tests, wins, total_duration_ms)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(model, task_type) DO UPDATE SET
         tests = tests + 1,
         wins = wins + ?,
         total_duration_ms = total_duration_ms + ?`,
      [r.model, result.taskType, isWinner, r.durationMs, isWinner, r.durationMs]
    );
  }
}

export const abTestSchema = {
  name: 'ab_test',
  description: 'A/B test prompts across models with persistent SQLite storage. Record test results, declare winners, and query stats to find the best model per task type. Results survive server restarts.',
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
      limit: { type: 'number', description: 'Max results (default: 10)' },
    },
    required: ['action'],
  },
};

export function handleABTest(args: any): string {
  initTables();
  const db = getDb();

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

        // Persist to SQLite
        db.run(
          `INSERT INTO ab_tests (id, prompt, task_type, models, results, winner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [test.id, test.prompt, test.taskType, JSON.stringify(test.models),
           JSON.stringify(test.results), test.winner, test.createdAt]
        );
        updateStats(test);
        saveDatabase();

        return JSON.stringify({ success: true, testId: test.id, winner: test.winner, models: test.models, persisted: true });
      }
      case 'get_stats': {
        if (args.model) {
          const rows = db.exec(
            `SELECT task_type, tests, wins, total_duration_ms FROM ab_model_stats WHERE model = ?`,
            [args.model]
          );
          if (!rows.length || !rows[0].values.length) {
            return JSON.stringify({ success: true, stats: null, message: 'No data for this model' });
          }
          const byTaskType: Record<string, any> = {};
          let totalTests = 0, totalWins = 0, totalDuration = 0;
          for (const row of rows[0].values) {
            const tt = row[0] as string;
            const tests = row[1] as number;
            const wins = row[2] as number;
            const dur = row[3] as number;
            byTaskType[tt] = { tests, wins, avgDuration: tests > 0 ? Math.round(dur / tests) : 0 };
            totalTests += tests;
            totalWins += wins;
            totalDuration += dur;
          }
          return JSON.stringify({
            success: true,
            stats: {
              model: args.model, totalTests, wins: totalWins,
              winRate: totalTests > 0 ? Math.round((totalWins / totalTests) * 100) : 0,
              avgDurationMs: totalTests > 0 ? Math.round(totalDuration / totalTests) : 0,
              byTaskType,
            },
          });
        }

        // All models stats
        const rows = db.exec(
          `SELECT model, SUM(tests) as total, SUM(wins) as wins, SUM(total_duration_ms) as dur 
           FROM ab_model_stats GROUP BY model ORDER BY SUM(wins) * 1.0 / MAX(SUM(tests), 1) DESC`
        );
        const all = rows.length > 0
          ? rows[0].values.map((r: any[]) => ({
              model: r[0],
              totalTests: r[1],
              wins: r[2],
              winRate: r[1] > 0 ? Math.round((r[2] / r[1]) * 100) : 0,
              avgDurationMs: r[1] > 0 ? Math.round(r[3] / r[1]) : 0,
            }))
          : [];
        return JSON.stringify({ success: true, stats: all, count: all.length, persistent: true });
      }
      case 'get_best': {
        if (!args.task_type) return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'task_type required' } });
        const rows = db.exec(
          `SELECT model, tests, wins, total_duration_ms FROM ab_model_stats 
           WHERE task_type = ? AND tests >= 1 ORDER BY wins * 1.0 / MAX(tests, 1) DESC, total_duration_ms / MAX(tests, 1) ASC`,
          [args.task_type]
        );
        const candidates = rows.length > 0
          ? rows[0].values.map((r: any[]) => ({
              model: r[0], tests: r[1], winRate: r[1] > 0 ? Math.round((r[2] / r[1]) * 100) : 0,
              avgDuration: r[1] > 0 ? Math.round(r[3] / r[1]) : 0,
            }))
          : [];
        return JSON.stringify({ success: true, taskType: args.task_type, bestModel: candidates[0]?.model || null, rankings: candidates });
      }
      case 'list_tests': {
        const limit = args.limit || 10;
        const rows = db.exec(
          `SELECT id, task_type, models, winner, created_at FROM ab_tests ORDER BY created_at DESC LIMIT ?`,
          [limit]
        );
        const tests = rows.length > 0
          ? rows[0].values.map((r: any[]) => ({
              id: r[0], taskType: r[1], models: JSON.parse(r[2] as string), winner: r[3], createdAt: r[4],
            }))
          : [];
        const total = db.exec(`SELECT COUNT(*) FROM ab_tests`);
        return JSON.stringify({ success: true, tests, count: tests.length, total: total.length > 0 ? total[0].values[0][0] : 0, persistent: true });
      }
      case 'clear': {
        const total = db.exec(`SELECT COUNT(*) FROM ab_tests`);
        const count = total.length > 0 ? total[0].values[0][0] : 0;
        db.run(`DELETE FROM ab_tests`);
        db.run(`DELETE FROM ab_model_stats`);
        saveDatabase();
        return JSON.stringify({ success: true, message: `Cleared ${count} test results (persistent store cleaned)` });
      }
      default: return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown: ${args.action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'AB_TEST_ERROR', message: err.message } });
  }
}
