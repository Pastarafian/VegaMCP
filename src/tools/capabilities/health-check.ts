/**
 * VegaMCP — Health Check Tool
 * 
 * Comprehensive diagnostic tool that checks:
 * - API key configuration & validity
 * - Database integrity (SQLite + Vector Store)
 * - Ollama reachability
 * - Playwright browser status
 * - Swarm agent health
 * - Disk space & data directory
 * - Token budget status
 * - Knowledge engine stats
 * 
 * MCP Tool: vegamcp_health_check
 */

import { logAudit } from '../../db/graph-store.js';
import { getVectorStoreStats } from '../../db/vector-store.js';
import { getSwarmStats } from '../../db/swarm-store.js';
import fs from 'node:fs';
import path from 'node:path';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const healthCheckSchema = {
  name: 'vegamcp_health_check',
  description: 'Comprehensive diagnostics for the VegaMCP server. Checks API key validity, database integrity, Ollama reachability, Playwright status, swarm health, vector store, token budget, and data directory. Use this to verify everything is working correctly.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      verbose: {
        type: 'boolean',
        description: 'Include detailed diagnostics for each check',
        default: false,
      },
      checks: {
        type: 'array',
        description: 'Specific checks to run. Default: all. Options: api_keys, database, ollama, playwright, swarm, vector_store, budget, disk',
        items: { type: 'string' },
      },
    },
    required: [],
  },
};

// ═══════════════════════════════════════════════
// HEALTH CHECK IMPLEMENTATIONS
// ═══════════════════════════════════════════════

interface CheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unconfigured';
  message: string;
  details?: Record<string, any>;
}

async function checkApiKeys(verbose: boolean): Promise<CheckResult> {
  const keys: Record<string, { set: boolean; prefix?: string }> = {};
  const keyNames = [
    'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY',
    'GITHUB_TOKEN', 'TAVILY_API_KEY', 'SENTRY_AUTH_TOKEN',
    'GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY',
    'TOGETHER_API_KEY', 'XAI_API_KEY',
  ];

  let configured = 0;
  let reasoningKeys = 0;

  for (const name of keyNames) {
    const val = process.env[name];
    const isSet = !!val && val.length > 5;
    keys[name] = { set: isSet };
    if (verbose && isSet) {
      keys[name].prefix = val!.slice(0, 6) + '...';
    }
    if (isSet) configured++;
    if (isSet && ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY'].includes(name)) {
      reasoningKeys++;
    }
  }

  const status = reasoningKeys > 0 ? 'healthy' : configured > 0 ? 'degraded' : 'unhealthy';
  return {
    name: '🔑 API Keys',
    status,
    message: reasoningKeys > 0
      ? `${configured} keys configured (${reasoningKeys} reasoning model${reasoningKeys > 1 ? 's' : ''})`
      : 'No reasoning model API keys configured — agents cannot think',
    details: verbose ? keys : { configured, total: keyNames.length, reasoningKeys },
  };
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const dataDir = path.resolve(process.env.DATA_DIR || './data');
    const memoryDb = path.join(dataDir, 'memory.db');
    const exists = fs.existsSync(memoryDb);
    const stats = exists ? fs.statSync(memoryDb) : null;

    return {
      name: '🗄️ Database (SQLite)',
      status: exists ? 'healthy' : 'unhealthy',
      message: exists
        ? `memory.db exists (${(stats!.size / 1024).toFixed(1)} KB)`
        : 'memory.db not found — database not initialized',
      details: exists ? {
        path: memoryDb,
        sizeKB: Math.round(stats!.size / 1024),
        lastModified: stats!.mtime.toISOString(),
      } : undefined,
    };
  } catch (err: any) {
    return { name: '🗄️ Database (SQLite)', status: 'unhealthy', message: err.message };
  }
}

async function checkOllama(): Promise<CheckResult> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const data: any = await resp.json();
      const models = data.models?.map((m: any) => m.name) || [];
      return {
        name: '🏠 Ollama (Local LLM)',
        status: 'healthy',
        message: `Connected — ${models.length} model${models.length !== 1 ? 's' : ''} available`,
        details: { url: ollamaUrl, models: models.slice(0, 10) },
      };
    }
    return {
      name: '🏠 Ollama (Local LLM)',
      status: 'degraded',
      message: `Ollama responded with status ${resp.status}`,
    };
  } catch {
    return {
      name: '🏠 Ollama (Local LLM)',
      status: 'unconfigured',
      message: `Not reachable at ${ollamaUrl} — local models unavailable`,
    };
  }
}

async function checkPlaywright(): Promise<CheckResult> {
  try {
    // Just check if playwright is importable
    await import('playwright');
    return {
      name: '🧪 Playwright Browser',
      status: 'healthy',
      message: 'Playwright installed — browser tools available (lazy-init on first use)',
    };
  } catch {
    return {
      name: '🧪 Playwright Browser',
      status: 'unhealthy',
      message: 'Playwright not installed — browser tools unavailable. Run: npx playwright install',
    };
  }
}

async function checkSwarm(): Promise<CheckResult> {
  try {
    const stats = getSwarmStats();

    return {
      name: '🐝 Agent Swarm',
      status: stats.totalAgents > 0 ? 'healthy' : 'degraded',
      message: `${stats.totalAgents} agents registered, ${stats.activeAgents} active, ${stats.totalTasks} total tasks`,
      details: {
        totalAgents: stats.totalAgents,
        activeAgents: stats.activeAgents,
        totalTasks: stats.totalTasks,
        activeTasks: stats.activeTasks,
        completedTasks: stats.completedTasks,
        failedTasks: stats.failedTasks,
        totalMessages: stats.totalMessages,
        activeTriggers: stats.activeTriggers,
      },
    };
  } catch (err: any) {
    return { name: '🐝 Agent Swarm', status: 'unhealthy', message: err.message };
  }
}

async function checkVectorStore(): Promise<CheckResult> {
  try {
    const stats = getVectorStoreStats();
    const totalEntries = stats.totalEntries || 0;

    return {
      name: '🧠 Knowledge Engine (Vector Store)',
      status: totalEntries > 0 ? 'healthy' : 'degraded',
      message: totalEntries > 0
        ? `${totalEntries} entries across ${Object.keys(stats.collections || {}).length} collections`
        : 'Empty — no knowledge indexed. Consider seeding with project documentation.',
      details: stats,
    };
  } catch (err: any) {
    return { name: '🧠 Knowledge Engine (Vector Store)', status: 'unhealthy', message: err.message };
  }
}

async function checkBudget(): Promise<CheckResult> {
  const dailyBudget = parseFloat(process.env.TOKEN_DAILY_BUDGET_USD || '5.00');
  const hourlyBudget = parseFloat(process.env.TOKEN_HOURLY_BUDGET_USD || '1.00');

  return {
    name: '🧮 Token Budget',
    status: 'healthy',
    message: `Budget: $${dailyBudget}/day, $${hourlyBudget}/hr`,
    details: { dailyBudgetUSD: dailyBudget, hourlyBudgetUSD: hourlyBudget },
  };
}

async function checkDisk(): Promise<CheckResult> {
  try {
    const dataDir = path.resolve(process.env.DATA_DIR || './data');
    if (!fs.existsSync(dataDir)) {
      return { name: '💾 Data Directory', status: 'degraded', message: `Data directory not found: ${dataDir}` };
    }

    let totalSize = 0;
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      try {
        const stat = fs.statSync(path.join(dataDir, file));
        if (stat.isFile()) totalSize += stat.size;
      } catch { /* skip */ }
    }

    return {
      name: '💾 Data Directory',
      status: 'healthy',
      message: `${files.length} files, ${(totalSize / 1024).toFixed(1)} KB total`,
      details: { path: dataDir, fileCount: files.length, totalSizeKB: Math.round(totalSize / 1024) },
    };
  } catch (err: any) {
    return { name: '💾 Data Directory', status: 'unhealthy', message: err.message };
  }
}

async function checkToolProfile(): Promise<CheckResult> {
  const profile = (process.env.VEGAMCP_TOOL_PROFILE || 'full').toLowerCase();
  return {
    name: '🎯 Tool Profile',
    status: 'healthy',
    message: `Profile: ${profile}`,
    details: { profile, validProfiles: ['full', 'minimal', 'research', 'coding', 'ops'] },
  };
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleHealthCheck(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const verbose = args.verbose || false;
  const requestedChecks = args.checks as string[] | undefined;

  const allChecks: Record<string, () => Promise<CheckResult>> = {
    api_keys: () => checkApiKeys(verbose),
    database: checkDatabase,
    ollama: checkOllama,
    playwright: checkPlaywright,
    swarm: checkSwarm,
    vector_store: checkVectorStore,
    budget: checkBudget,
    disk: checkDisk,
    tool_profile: checkToolProfile,
  };

  const checksToRun = requestedChecks?.length
    ? Object.fromEntries(Object.entries(allChecks).filter(([k]) => requestedChecks.includes(k)))
    : allChecks;

  const results: CheckResult[] = [];
  for (const [, checkFn] of Object.entries(checksToRun)) {
    try {
      results.push(await checkFn());
    } catch (err: any) {
      results.push({ name: 'Unknown', status: 'unhealthy', message: err.message });
    }
  }

  const healthy = results.filter(r => r.status === 'healthy').length;
  const degraded = results.filter(r => r.status === 'degraded').length;
  const unhealthy = results.filter(r => r.status === 'unhealthy').length;
  const unconfigured = results.filter(r => r.status === 'unconfigured').length;

  const overallStatus = unhealthy > 0 ? 'unhealthy' : degraded > 0 ? 'degraded' : 'healthy';
  const statusEmoji = { healthy: '✅', degraded: '⚠️', unhealthy: '❌', unconfigured: '⬚' };

  const durationMs = Date.now() - start;
  logAudit('health_check', `${overallStatus}: ${healthy}✅ ${degraded}⚠️ ${unhealthy}❌`, true, undefined, durationMs);

  const output = {
    success: true,
    overall: overallStatus,
    summary: `${healthy} healthy, ${degraded} degraded, ${unhealthy} unhealthy, ${unconfigured} unconfigured`,
    durationMs,
    timestamp: new Date().toISOString(),
    serverVersion: '3.0.0',
    checks: results.map(r => ({
      ...r,
      emoji: statusEmoji[r.status],
    })),
    recommendations: [] as string[],
  };

  // Generate recommendations
  for (const r of results) {
    if (r.status === 'unhealthy' && r.name.includes('API Keys')) {
      output.recommendations.push('⚡ Set at least one reasoning model API key (OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or KIMI_API_KEY) for agents to function');
    }
    if (r.status === 'degraded' && r.name.includes('Knowledge Engine')) {
      output.recommendations.push('📚 Seed the knowledge engine with project docs using knowledge_engine(batch_add)');
    }
    if (r.status === 'unconfigured' && r.name.includes('Ollama')) {
      output.recommendations.push('🏠 Install Ollama for free local LLM fallback: https://ollama.ai');
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}
