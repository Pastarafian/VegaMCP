/**
 * VegaMCP — Token Budget Manager
 * 
 * Tracks total token usage across ALL models, enforces configurable budgets,
 * and auto-recommends cheaper models when budget runs low.
 * MCP Tool: token_budget
 */

import { getDb, saveDatabase, logAudit } from '../../db/graph-store.js';

// ═══════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════

let initialized = false;

function initTokenBudget(): void {
  if (initialized) return;
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS token_budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_type TEXT NOT NULL,
      budget_limit_usd REAL NOT NULL,
      current_usage_usd REAL NOT NULL DEFAULT 0,
      current_tokens INTEGER NOT NULL DEFAULT 0,
      period_start TEXT NOT NULL DEFAULT (datetime('now')),
      period_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_token_budget_type ON token_budget(budget_type);`);
  saveDatabase();
  initialized = true;
}

// ═══════════════════════════════════════════════
// COST MAP (per 1K tokens, USD)
// ═══════════════════════════════════════════════

const COST_MAP: Record<string, { input: number; output: number }> = {
  'deepseek/deepseek-r1': { input: 0.00055, output: 0.0022 },
  'deepseek/deepseek-chat': { input: 0.00014, output: 0.00028 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'openai/gpt-4o': { input: 0.0025, output: 0.01 },
  'meta-llama/llama-3.1-405b': { input: 0.003, output: 0.003 },
  'moonshot/kimi-128k': { input: 0.00084, output: 0.00084 },
  'moonshot/kimi-32k': { input: 0.00034, output: 0.00034 },
  'moonshot/kimi-8k': { input: 0.000017, output: 0.000017 },
  'ollama/local': { input: 0, output: 0 },
};

// Models sorted by cost (cheapest first) for auto-downgrade
const MODELS_BY_COST = [
  'ollama/local',
  'moonshot/kimi-8k',
  'deepseek/deepseek-chat',
  'moonshot/kimi-32k',
  'deepseek/deepseek-r1',
  'moonshot/kimi-128k',
  'openai/gpt-4o',
  'meta-llama/llama-3.1-405b',
  'anthropic/claude-3.5-sonnet',
];

// ═══════════════════════════════════════════════
// BUDGET MANAGEMENT
// ═══════════════════════════════════════════════

interface BudgetStatus {
  daily: { limit: number; used: number; remaining: number; percentUsed: number };
  hourly: { limit: number; used: number; remaining: number; percentUsed: number };
  session: { totalTokens: number; totalCost: number; modelBreakdown: Record<string, { tokens: number; cost: number }> };
}

function getDefaultBudgets(): { daily: number; hourly: number } {
  return {
    daily: parseFloat(process.env.TOKEN_DAILY_BUDGET_USD || '5.00'),
    hourly: parseFloat(process.env.TOKEN_HOURLY_BUDGET_USD || '1.00'),
  };
}

function getUsageForPeriod(periodType: 'daily' | 'hourly'): { tokens: number; cost: number } {
  const db = getDb();
  const now = new Date();
  let since: string;

  if (periodType === 'daily') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    since = startOfDay.toISOString().replace('T', ' ').replace('Z', '');
  } else {
    const oneHourAgo = new Date(now.getTime() - 3600000);
    since = oneHourAgo.toISOString().replace('T', ' ').replace('Z', '');
  }

  const result = db.exec(
    `SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as total_cost
     FROM reasoning_usage
     WHERE timestamp >= ?`,
    [since]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return { tokens: 0, cost: 0 };
  }

  return {
    tokens: result[0].values[0][0] as number,
    cost: result[0].values[0][1] as number,
  };
}

function getSessionBreakdown(): Record<string, { tokens: number; cost: number }> {
  const db = getDb();
  const result = db.exec(
    `SELECT model,
            SUM(prompt_tokens + completion_tokens) as total_tokens,
            SUM(estimated_cost_usd) as total_cost
     FROM reasoning_usage
     GROUP BY model
     ORDER BY total_cost DESC`
  );

  const breakdown: Record<string, { tokens: number; cost: number }> = {};
  if (result.length > 0) {
    for (const row of result[0].values) {
      breakdown[row[0] as string] = {
        tokens: row[1] as number,
        cost: row[2] as number,
      };
    }
  }
  return breakdown;
}

function getBudgetStatus(): BudgetStatus {
  const defaults = getDefaultBudgets();
  const dailyUsage = getUsageForPeriod('daily');
  const hourlyUsage = getUsageForPeriod('hourly');
  const breakdown = getSessionBreakdown();

  const totalTokens = Object.values(breakdown).reduce((sum, m) => sum + m.tokens, 0);
  const totalCost = Object.values(breakdown).reduce((sum, m) => sum + m.cost, 0);

  return {
    daily: {
      limit: defaults.daily,
      used: dailyUsage.cost,
      remaining: Math.max(0, defaults.daily - dailyUsage.cost),
      percentUsed: defaults.daily > 0 ? (dailyUsage.cost / defaults.daily) * 100 : 0,
    },
    hourly: {
      limit: defaults.hourly,
      used: hourlyUsage.cost,
      remaining: Math.max(0, defaults.hourly - hourlyUsage.cost),
      percentUsed: defaults.hourly > 0 ? (hourlyUsage.cost / defaults.hourly) * 100 : 0,
    },
    session: {
      totalTokens,
      totalCost,
      modelBreakdown: breakdown,
    },
  };
}

/**
 * Check if a model call is within budget. Returns allowed + recommended cheaper model if needed.
 */
export function checkTokenBudget(model: string, estimatedTokens: number = 4096): {
  allowed: boolean;
  reason?: string;
  recommendedModel?: string;
  budgetRemaining: { daily: number; hourly: number };
} {
  initTokenBudget();
  const defaults = getDefaultBudgets();
  const dailyUsage = getUsageForPeriod('daily');
  const hourlyUsage = getUsageForPeriod('hourly');

  const costInfo = COST_MAP[model] || { input: 0.002, output: 0.005 };
  const estimatedCost = (estimatedTokens / 1000) * ((costInfo.input + costInfo.output) / 2);

  const dailyRemaining = defaults.daily - dailyUsage.cost;
  const hourlyRemaining = defaults.hourly - hourlyUsage.cost;

  // Check if completely over budget
  if (dailyRemaining <= 0) {
    const freeModel = MODELS_BY_COST.find(m => {
      const c = COST_MAP[m];
      return c && c.input === 0 && c.output === 0;
    });
    return {
      allowed: false,
      reason: `Daily budget exhausted ($${defaults.daily.toFixed(2)}). Used: $${dailyUsage.cost.toFixed(4)}`,
      recommendedModel: freeModel || 'ollama/local',
      budgetRemaining: { daily: 0, hourly: Math.max(0, hourlyRemaining) },
    };
  }

  if (hourlyRemaining <= 0) {
    return {
      allowed: false,
      reason: `Hourly budget exhausted ($${defaults.hourly.toFixed(2)}). Used: $${hourlyUsage.cost.toFixed(4)}`,
      recommendedModel: 'deepseek/deepseek-chat',
      budgetRemaining: { daily: Math.max(0, dailyRemaining), hourly: 0 },
    };
  }

  // Check if estimated cost would exceed budget — recommend downgrade
  if (estimatedCost > dailyRemaining * 0.5) {
    // Find a cheaper model that fits
    const cheaper = MODELS_BY_COST.find(m => {
      const c = COST_MAP[m];
      if (!c) return false;
      const cheaperCost = (estimatedTokens / 1000) * ((c.input + c.output) / 2);
      return cheaperCost < estimatedCost * 0.5;
    });

    return {
      allowed: true,
      reason: `Budget running low. Consider switching to a cheaper model.`,
      recommendedModel: cheaper || model,
      budgetRemaining: { daily: dailyRemaining, hourly: hourlyRemaining },
    };
  }

  return {
    allowed: true,
    budgetRemaining: { daily: dailyRemaining, hourly: hourlyRemaining },
  };
}

// ═══════════════════════════════════════════════
// MCP TOOL
// ═══════════════════════════════════════════════

export const tokenBudgetSchema = {
  name: 'token_budget',
  description: 'Manage token usage budgets. Track spending across AI models, set daily/hourly limits, get cost recommendations, and monitor per-model breakdown. Helps control API costs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['get_usage', 'set_budget', 'get_budget', 'check_model', 'get_recommendation', 'get_history'],
        description: 'Action to perform',
      },
      budget_type: { type: 'string', enum: ['daily', 'hourly'], description: 'Budget type (for set_budget)' },
      limit_usd: { type: 'number', description: 'Budget limit in USD (for set_budget)' },
      model: { type: 'string', description: 'Model to check (for check_model)' },
      estimated_tokens: { type: 'number', description: 'Estimated tokens for the call (for check_model)', default: 4096 },
      days: { type: 'number', description: 'Number of days of history (for get_history)', default: 7 },
    },
    required: ['action'],
  },
};

export function handleTokenBudget(args: any): string {
  initTokenBudget();
  const start = Date.now();

  try {
    switch (args.action) {
      case 'get_usage': {
        const status = getBudgetStatus();
        logAudit('token_budget', 'get_usage', true, undefined, Date.now() - start);
        return JSON.stringify({
          success: true,
          ...status,
          budgetWarning: status.daily.percentUsed > 80 ? '⚠️ Over 80% of daily budget used!' : null,
        }, null, 2);
      }

      case 'set_budget': {
        const type = args.budget_type;
        const limit = args.limit_usd;
        if (!type || !limit || limit <= 0) {
          return JSON.stringify({ success: false, error: 'Provide budget_type (daily/hourly) and limit_usd > 0' });
        }

        // Set via environment (persisted for session)
        if (type === 'daily') {
          process.env.TOKEN_DAILY_BUDGET_USD = String(limit);
        } else {
          process.env.TOKEN_HOURLY_BUDGET_USD = String(limit);
        }

        logAudit('token_budget', `set_budget: ${type} = $${limit}`, true, undefined, Date.now() - start);
        return JSON.stringify({
          success: true,
          message: `${type} budget set to $${limit.toFixed(2)}`,
          budgets: getDefaultBudgets(),
        });
      }

      case 'get_budget': {
        return JSON.stringify({
          success: true,
          budgets: getDefaultBudgets(),
          costMap: COST_MAP,
          modelsByPrice: MODELS_BY_COST,
        }, null, 2);
      }

      case 'check_model': {
        const model = args.model || 'deepseek/deepseek-r1';
        const tokens = args.estimated_tokens || 4096;
        const check = checkTokenBudget(model, tokens);

        logAudit('token_budget', `check: ${model} ~${tokens} tokens`, true, undefined, Date.now() - start);
        return JSON.stringify({
          success: true,
          model,
          estimatedTokens: tokens,
          ...check,
        }, null, 2);
      }

      case 'get_recommendation': {
        const status = getBudgetStatus();
        const budgetPercent = status.daily.percentUsed;

        let recommendedModel: string;
        let reason: string;

        if (budgetPercent >= 100) {
          recommendedModel = 'ollama/local';
          reason = 'Budget exhausted — use free local model';
        } else if (budgetPercent >= 80) {
          recommendedModel = 'deepseek/deepseek-chat';
          reason = 'Budget running low — use cheapest API model';
        } else if (budgetPercent >= 50) {
          recommendedModel = 'moonshot/kimi-32k';
          reason = 'Budget at 50% — balanced cost/quality model';
        } else {
          recommendedModel = 'deepseek/deepseek-r1';
          reason = 'Budget healthy — use best reasoning model';
        }

        return JSON.stringify({
          success: true,
          recommendedModel,
          reason,
          currentBudgetUsed: `${budgetPercent.toFixed(1)}%`,
          dailyRemaining: `$${status.daily.remaining.toFixed(4)}`,
        }, null, 2);
      }

      case 'get_history': {
        const days = args.days || 7;
        const db = getDb();
        const since = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').replace('Z', '');

        const result = db.exec(
          `SELECT DATE(timestamp) as day,
                  model,
                  SUM(prompt_tokens) as prompt_total,
                  SUM(completion_tokens) as completion_total,
                  SUM(estimated_cost_usd) as cost_total,
                  COUNT(*) as call_count
           FROM reasoning_usage
           WHERE timestamp >= ?
           GROUP BY DATE(timestamp), model
           ORDER BY day DESC, cost_total DESC`,
          [since]
        );

        const history: any[] = [];
        if (result.length > 0) {
          for (const row of result[0].values) {
            history.push({
              date: row[0],
              model: row[1],
              promptTokens: row[2],
              completionTokens: row[3],
              totalCost: `$${(row[4] as number).toFixed(4)}`,
              calls: row[5],
            });
          }
        }

        logAudit('token_budget', `get_history: ${days} days`, true, undefined, Date.now() - start);
        return JSON.stringify({ success: true, days, history }, null, 2);
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}. Use: get_usage, set_budget, get_budget, check_model, get_recommendation, get_history` });
    }
  } catch (err: any) {
    logAudit('token_budget', err.message, false, 'ERROR', Date.now() - start);
    return JSON.stringify({ success: false, error: err.message });
  }
}
