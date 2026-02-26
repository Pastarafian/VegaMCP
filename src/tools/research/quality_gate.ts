/**
 * VegaMCP — Quality Gate & Regression Tracker
 * 
 * Inspired by MT5MCP's CodeScene-style regression tracker.
 * Generalized for any VegaMCP pipeline quality tracking:
 *   - Records quality snapshots after each significant operation
 *   - Detects regressions (score drops across dimensions)
 *   - Provides trend data for dashboards
 *   - Supports arbitrary metric dimensions (not just code metrics)
 * 
 * Use cases:
 *   - Track hypothesis quality over time (Tournament of Ideas)
 *   - Monitor self-evolution learning rate
 *   - Track swarm agent performance trends
 *   - Detect degradation in knowledge base quality
 */

import { getDb, saveDatabase } from '../../db/graph-store.js';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const qualityGateSchema = {
  name: 'quality_gate',
  description: `Quality Gate & Regression Tracker — monitors system quality over time. Records snapshots of quality metrics, detects regressions (score drops), provides trend data, and enforces quality gates (pass/fail thresholds). Tracks arbitrary dimensions: task_performance, knowledge_quality, hypothesis_success, agent_efficiency, system_health, code_quality, data_accuracy, user_satisfaction.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['record', 'check', 'trend', 'history', 'gate', 'clear'],
        description: 'Action to perform',
      },
      dimension: {
        type: 'string',
        enum: [
          'task_performance', 'knowledge_quality', 'hypothesis_success',
          'agent_efficiency', 'system_health', 'code_quality',
          'data_accuracy', 'user_satisfaction', 'custom',
        ],
        description: 'Quality dimension to track',
      },
      score: {
        type: 'number',
        description: 'Quality score 0.0-100.0 (for record)',
      },
      metadata: {
        type: 'object',
        properties: {},
        description: 'Additional metadata for the snapshot',
      },
      notes: {
        type: 'string',
        description: 'Human-readable notes for the snapshot',
      },
      threshold: {
        type: 'number',
        description: 'Regression threshold — minimum score drop to flag (default: 5.0)',
      },
      gate_minimum: {
        type: 'number',
        description: 'Gate minimum score — below this = fail (for gate action, default: 60)',
      },
      last_n: {
        type: 'number',
        description: 'Number of snapshots to show (default: 20)',
      },
      source: {
        type: 'string',
        description: 'Source of the snapshot (e.g., agent:visionary, tool:hypothesis_gen)',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// TABLE INITIALIZATION
// ═══════════════════════════════════════════════

let qualityTablesInitialized = false;

function initQualityTables(): void {
  if (qualityTablesInitialized) return;
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS quality_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension TEXT NOT NULL,
      score REAL NOT NULL,
      source TEXT DEFAULT 'system',
      metadata TEXT DEFAULT '{}',
      notes TEXT DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_quality_dimension ON quality_snapshots(dimension);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_quality_timestamp ON quality_snapshots(timestamp);`);
  saveDatabase();
  qualityTablesInitialized = true;
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleQualityGate(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;
  initQualityTables();

  try {
    switch (action) {
      case 'record':
        return handleRecord(args);
      case 'check':
        return handleCheck(args);
      case 'trend':
        return handleTrend(args);
      case 'history':
        return handleHistory(args);
      case 'gate':
        return handleGate(args);
      case 'clear':
        return handleClear(args);
      default:
        return result({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return result({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// ACTION: RECORD
// ═══════════════════════════════════════════════

function handleRecord(args: any) {
  const { dimension, score, metadata = {}, notes = '', source = 'system' } = args;
  if (!dimension) return result({ error: 'dimension is required' });
  if (score === undefined || score === null) return result({ error: 'score is required' });

  const db = getDb();
  db.run(
    `INSERT INTO quality_snapshots (dimension, score, source, metadata, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [dimension, score, source, JSON.stringify(metadata), notes]
  );
  saveDatabase();

  // Auto-check for regressions
  const regressions = checkRegressions(dimension);

  return result({
    status: 'recorded',
    dimension,
    score,
    regressions: regressions.length > 0 ? regressions : null,
    alert: regressions.length > 0
      ? `⚠️ ${regressions.length} regression(s) detected in ${dimension}!`
      : null,
  });
}

// ═══════════════════════════════════════════════
// ACTION: CHECK REGRESSIONS
// ═══════════════════════════════════════════════

function handleCheck(args: any) {
  const { dimension, threshold = 5.0 } = args;

  if (dimension) {
    const regressions = checkRegressions(dimension, threshold);
    return result({
      dimension,
      threshold,
      regressions,
      status: regressions.length > 0 ? '⚠️ REGRESSIONS DETECTED' : '✅ No regressions',
    });
  }

  // Check all dimensions
  const allDimensions = getAllDimensions();
  const allRegressions: Record<string, any[]> = {};
  let totalRegressions = 0;

  for (const dim of allDimensions) {
    const regs = checkRegressions(dim, threshold);
    if (regs.length > 0) {
      allRegressions[dim] = regs;
      totalRegressions += regs.length;
    }
  }

  return result({
    dimensionsChecked: allDimensions.length,
    totalRegressions,
    regressions: allRegressions,
    status: totalRegressions > 0
      ? `⚠️ ${totalRegressions} regression(s) across ${Object.keys(allRegressions).length} dimension(s)`
      : '✅ No regressions across all dimensions',
  });
}

// ═══════════════════════════════════════════════
// ACTION: TREND
// ═══════════════════════════════════════════════

function handleTrend(args: any) {
  const { dimension, last_n = 20 } = args;
  if (!dimension) return result({ error: 'dimension is required' });

  const db = getDb();
  const trendResult = db.exec(
    `SELECT score, timestamp FROM quality_snapshots 
     WHERE dimension = ? ORDER BY timestamp DESC LIMIT ?`,
    [dimension, last_n]
  );

  if (trendResult.length === 0) {
    return result({ dimension, trend: [], count: 0 });
  }

  const trend = trendResult[0].values.map((row: any[]) => ({
    score: row[0] as number,
    timestamp: row[1] as string,
  })).reverse();

  // Calculate statistics
  const scores = trend.map(t => t.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const latest = scores[scores.length - 1];
  const direction = scores.length >= 2
    ? (scores[scores.length - 1] > scores[scores.length - 2] ? '📈 improving' 
       : scores[scores.length - 1] < scores[scores.length - 2] ? '📉 declining' 
       : '➡️ stable')
    : '➡️ insufficient data';

  return result({
    dimension,
    trend,
    stats: {
      count: scores.length,
      latest: Math.round(latest * 10) / 10,
      average: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      direction,
    },
  });
}

// ═══════════════════════════════════════════════
// ACTION: HISTORY
// ═══════════════════════════════════════════════

function handleHistory(args: any) {
  const { dimension, last_n = 20 } = args;
  const db = getDb();

  let sql = `SELECT * FROM quality_snapshots`;
  const params: any[] = [];
  if (dimension) {
    sql += ` WHERE dimension = ?`;
    params.push(dimension);
  }
  sql += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(last_n);

  const histResult = db.exec(sql, params);
  if (histResult.length === 0) {
    return result({ count: 0, snapshots: [] });
  }

  const snapshots = histResult[0].values.map((row: any[]) => ({
    id: row[0] as number,
    dimension: row[1] as string,
    score: row[2] as number,
    source: row[3] as string,
    metadata: JSON.parse((row[4] as string) || '{}'),
    notes: row[5] as string,
    timestamp: row[6] as string,
  }));

  return result({
    count: snapshots.length,
    snapshots,
  });
}

// ═══════════════════════════════════════════════
// ACTION: GATE (Pass/Fail)
// ═══════════════════════════════════════════════

function handleGate(args: any) {
  const { dimension, gate_minimum = 60 } = args;
  if (!dimension) return result({ error: 'dimension is required' });

  const db = getDb();
  const latestResult = db.exec(
    `SELECT score, timestamp FROM quality_snapshots 
     WHERE dimension = ? ORDER BY timestamp DESC LIMIT 1`,
    [dimension]
  );

  if (latestResult.length === 0 || latestResult[0].values.length === 0) {
    return result({
      dimension,
      gate: 'NO_DATA',
      passed: false,
      message: `No quality data recorded for dimension: ${dimension}`,
    });
  }

  const latestScore = latestResult[0].values[0][0] as number;
  const passed = latestScore >= gate_minimum;

  return result({
    dimension,
    gate: passed ? '✅ PASSED' : '❌ FAILED',
    passed,
    score: latestScore,
    minimum: gate_minimum,
    deficit: passed ? 0 : Math.round((gate_minimum - latestScore) * 10) / 10,
    message: passed
      ? `Quality gate passed: ${latestScore}/${gate_minimum}`
      : `Quality gate FAILED: ${latestScore} is below minimum ${gate_minimum}. Improvement needed.`,
  });
}

// ═══════════════════════════════════════════════
// ACTION: CLEAR
// ═══════════════════════════════════════════════

function handleClear(args: any) {
  const { dimension } = args;
  const db = getDb();

  if (dimension) {
    const countResult = db.exec(
      `SELECT COUNT(*) FROM quality_snapshots WHERE dimension = ?`, [dimension]
    );
    const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    db.run(`DELETE FROM quality_snapshots WHERE dimension = ?`, [dimension]);
    saveDatabase();
    return result({ status: 'cleared', dimension, entriesRemoved: count });
  }

  const countResult = db.exec(`SELECT COUNT(*) FROM quality_snapshots`);
  const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
  db.run(`DELETE FROM quality_snapshots`);
  saveDatabase();
  return result({ status: 'cleared', dimension: 'all', entriesRemoved: count });
}

// ═══════════════════════════════════════════════
// INTERNAL: REGRESSION DETECTION
// ═══════════════════════════════════════════════

function checkRegressions(dimension: string, threshold: number = 5.0): any[] {
  const db = getDb();
  const recentResult = db.exec(
    `SELECT score, timestamp FROM quality_snapshots 
     WHERE dimension = ? ORDER BY timestamp DESC LIMIT 2`,
    [dimension]
  );

  if (recentResult.length === 0 || recentResult[0].values.length < 2) {
    return [];
  }

  const current = recentResult[0].values[0][0] as number;
  const previous = recentResult[0].values[1][0] as number;
  const delta = current - previous;

  if (delta < -threshold) {
    return [{
      dimension,
      previous: Math.round(previous * 10) / 10,
      current: Math.round(current * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      severity: delta < -threshold * 2 ? 'critical' : 'warning',
    }];
  }

  return [];
}

function getAllDimensions(): string[] {
  const db = getDb();
  const dimResult = db.exec(`SELECT DISTINCT dimension FROM quality_snapshots`);
  if (dimResult.length === 0) return [];
  return dimResult[0].values.map((row: any[]) => row[0] as string);
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}
