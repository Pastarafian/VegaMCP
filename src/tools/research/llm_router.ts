/**
 * VegaMCP — Multi-LLM Intelligent Router
 * 
 * Routes requests to the optimal LLM based on task characteristics:
 * - Complexity scoring → small/medium/large model tiers
 * - Cost-aware routing → cheapest model that can handle the task
 * - Latency preferences → fast vs. quality
 * - Capability matching → code, reasoning, creative, translation
 * - Fallback chains → automatic retry on failure
 * 
 * Supports: OpenRouter, DeepSeek, Kimi, Ollama, MCP Sampling
 */

import { requestSampling, isSamplingAvailable } from '../../mcp-extensions.js';

// ═══════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════

export const llmRouterSchema = {
  name: 'llm_router',
  description: `Multi-LLM Intelligent Router — routes requests to the optimal model based on task complexity, cost, latency, and capability requirements. Supports OpenRouter, DeepSeek, Kimi, Ollama, and MCP Sampling. Actions: route (auto-select and query), analyze (score task complexity), models (list available), benchmark (compare models on a task).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['route', 'analyze', 'models', 'benchmark'],
        description: 'Action to perform',
      },
      prompt: { type: 'string', description: 'The prompt to route/analyze' },
      preference: {
        type: 'string',
        enum: ['quality', 'speed', 'cost', 'balanced'],
        description: 'Routing preference (default: balanced)',
      },
      capability: {
        type: 'string',
        enum: ['general', 'code', 'reasoning', 'creative', 'translation', 'analysis'],
        description: 'Required capability (default: general)',
      },
      max_tokens: { type: 'number', description: 'Max tokens for response (default: 1000)' },
      force_model: { type: 'string', description: 'Force a specific model (bypass routing)' },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// MODEL REGISTRY
// ═══════════════════════════════════════════════

interface ModelConfig {
  id: string;
  name: string;
  provider: 'openrouter' | 'deepseek' | 'kimi' | 'ollama' | 'sampling';
  tier: 'small' | 'medium' | 'large';
  costPer1kTokens: number; // Relative cost (0=free, 1=cheap, 10=expensive)
  latencyMs: number; // Estimated average latency
  capabilities: string[];
  contextWindow: number;
  available: () => boolean;
}

const MODELS: ModelConfig[] = [
  // MCP Sampling (host LLM — free, uses whatever the client has)
  {
    id: 'sampling',
    name: 'MCP Host LLM',
    provider: 'sampling',
    tier: 'large',
    costPer1kTokens: 0,
    latencyMs: 500,
    capabilities: ['general', 'code', 'reasoning', 'creative', 'analysis', 'translation'],
    contextWindow: 128000,
    available: () => isSamplingAvailable(),
  },
  // OpenRouter models
  {
    id: 'openrouter/deepseek-r1',
    name: 'DeepSeek R1 (via OpenRouter)',
    provider: 'openrouter',
    tier: 'large',
    costPer1kTokens: 2,
    latencyMs: 3000,
    capabilities: ['reasoning', 'code', 'analysis', 'general'],
    contextWindow: 64000,
    available: () => !!process.env.OPENROUTER_API_KEY,
  },
  {
    id: 'openrouter/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (via OpenRouter)',
    provider: 'openrouter',
    tier: 'large',
    costPer1kTokens: 8,
    latencyMs: 2000,
    capabilities: ['general', 'code', 'reasoning', 'creative', 'analysis'],
    contextWindow: 200000,
    available: () => !!process.env.OPENROUTER_API_KEY,
  },
  {
    id: 'openrouter/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (via OpenRouter)',
    provider: 'openrouter',
    tier: 'medium',
    costPer1kTokens: 1,
    latencyMs: 1000,
    capabilities: ['general', 'code', 'analysis'],
    contextWindow: 1000000,
    available: () => !!process.env.OPENROUTER_API_KEY,
  },
  // DeepSeek direct
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat (Direct)',
    provider: 'deepseek',
    tier: 'medium',
    costPer1kTokens: 1,
    latencyMs: 1500,
    capabilities: ['general', 'code', 'reasoning'],
    contextWindow: 64000,
    available: () => !!process.env.DEEPSEEK_API_KEY,
  },
  // Kimi (Moonshot)
  {
    id: 'moonshot-v1-128k',
    name: 'Kimi 128K (Moonshot)',
    provider: 'kimi',
    tier: 'medium',
    costPer1kTokens: 3,
    latencyMs: 2000,
    capabilities: ['general', 'reasoning', 'analysis', 'translation'],
    contextWindow: 128000,
    available: () => !!process.env.KIMI_API_KEY,
  },
  // Ollama (local)
  {
    id: 'ollama/llama3',
    name: 'Llama 3 (Ollama Local)',
    provider: 'ollama',
    tier: 'small',
    costPer1kTokens: 0,
    latencyMs: 800,
    capabilities: ['general', 'code'],
    contextWindow: 8192,
    available: () => true, // Always potentially available
  },
  {
    id: 'ollama/codellama',
    name: 'CodeLlama (Ollama Local)',
    provider: 'ollama',
    tier: 'small',
    costPer1kTokens: 0,
    latencyMs: 600,
    capabilities: ['code'],
    contextWindow: 16384,
    available: () => true,
  },
];

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleLlmRouter(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;

  try {
    switch (action) {
      case 'route': return await handleRoute(args);
      case 'analyze': return handleAnalyze(args);
      case 'models': return handleModels();
      case 'benchmark': return await handleBenchmark(args);
      default: return out({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return out({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// ACTION: ROUTE
// ═══════════════════════════════════════════════

async function handleRoute(args: any) {
  const {
    prompt,
    preference = 'balanced',
    capability = 'general',
    max_tokens = 1000,
    force_model,
  } = args;

  if (!prompt) return out({ error: 'prompt is required' });

  // Analyze task complexity
  const complexity = analyzeComplexity(prompt);

  // Select best model
  const model = force_model
    ? MODELS.find(m => m.id === force_model)
    : selectModel(complexity, preference, capability);

  if (!model) {
    return out({
      error: 'No suitable model available',
      suggestion: 'Set OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or KIMI_API_KEY in .env',
      analysis: complexity,
    });
  }

  // Execute the request
  const startTime = Date.now();
  let response: string | null = null;
  let error: string | null = null;

  try {
    response = await executeOnModel(model, prompt, max_tokens);
  } catch (err: any) {
    error = err.message;
  }

  const elapsed = Date.now() - startTime;

  return out({
    model: model.id,
    modelName: model.name,
    provider: model.provider,
    tier: model.tier,
    preference,
    complexity,
    response: response || undefined,
    error: error || undefined,
    latencyMs: elapsed,
    tokensEstimate: response ? Math.ceil(response.length / 4) : 0,
  });
}

// ═══════════════════════════════════════════════
// ACTION: ANALYZE
// ═══════════════════════════════════════════════

function handleAnalyze(args: any) {
  const { prompt } = args;
  if (!prompt) return out({ error: 'prompt is required' });

  const complexity = analyzeComplexity(prompt);
  const recommended = selectModel(complexity, 'balanced', 'general');

  return out({
    complexity,
    recommendedModel: recommended ? {
      id: recommended.id,
      name: recommended.name,
      tier: recommended.tier,
      reason: `Complexity ${complexity.score}/10 → ${complexity.tier} tier`,
    } : null,
    availableModels: MODELS.filter(m => m.available()).length,
  });
}

// ═══════════════════════════════════════════════
// ACTION: MODELS
// ═══════════════════════════════════════════════

function handleModels() {
  return out({
    models: MODELS.map(m => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      tier: m.tier,
      available: m.available(),
      costPer1kTokens: m.costPer1kTokens,
      latencyMs: m.latencyMs,
      capabilities: m.capabilities,
      contextWindow: m.contextWindow,
    })),
    availableCount: MODELS.filter(m => m.available()).length,
    totalCount: MODELS.length,
  });
}

// ═══════════════════════════════════════════════
// ACTION: BENCHMARK
// ═══════════════════════════════════════════════

async function handleBenchmark(args: any) {
  const { prompt, max_tokens = 200 } = args;
  if (!prompt) return out({ error: 'prompt is required' });

  const available = MODELS.filter(m => m.available());
  const results: Array<{
    model: string;
    provider: string;
    latencyMs: number;
    responseLength: number;
    success: boolean;
    error?: string;
  }> = [];

  for (const model of available.slice(0, 3)) { // Limit to 3 to avoid cost
    const start = Date.now();
    try {
      const response = await executeOnModel(model, prompt, max_tokens);
      results.push({
        model: model.id,
        provider: model.provider,
        latencyMs: Date.now() - start,
        responseLength: response?.length || 0,
        success: !!response,
      });
    } catch (err: any) {
      results.push({
        model: model.id,
        provider: model.provider,
        latencyMs: Date.now() - start,
        responseLength: 0,
        success: false,
        error: err.message,
      });
    }
  }

  return out({
    prompt: prompt.slice(0, 100),
    benchmarked: results.length,
    results,
    fastest: results.filter(r => r.success).sort((a, b) => a.latencyMs - b.latencyMs)[0]?.model || null,
  });
}

// ═══════════════════════════════════════════════
// INTERNAL: COMPLEXITY ANALYSIS
// ═══════════════════════════════════════════════

interface ComplexityAnalysis {
  score: number; // 1-10
  tier: 'small' | 'medium' | 'large';
  factors: string[];
  estimatedTokens: number;
}

function analyzeComplexity(prompt: string): ComplexityAnalysis {
  let score = 3; // Baseline
  const factors: string[] = [];

  // Length factor
  if (prompt.length > 5000) { score += 2; factors.push('long_prompt'); }
  else if (prompt.length > 1000) { score += 1; factors.push('medium_prompt'); }

  // Code detection
  if (/```|function\s|class\s|def\s|import\s/.test(prompt)) {
    score += 1;
    factors.push('contains_code');
  }

  // Reasoning markers
  if (/explain|why|how|analyze|compare|evaluate|reason/i.test(prompt)) {
    score += 1;
    factors.push('reasoning_required');
  }

  // Multi-step
  if (/step\s*\d|first.*then|1\)|2\)|bullet/i.test(prompt)) {
    score += 1;
    factors.push('multi_step');
  }

  // Creative
  if (/create|write|generate|design|invent|story|poem/i.test(prompt)) {
    score += 1;
    factors.push('creative_task');
  }

  // Technical depth
  if (/algorithm|architecture|optimization|distributed|concurrency|async/i.test(prompt)) {
    score += 1;
    factors.push('technical_depth');
  }

  score = Math.min(Math.max(score, 1), 10);
  const tier: 'small' | 'medium' | 'large' = score <= 3 ? 'small' : score <= 6 ? 'medium' : 'large';

  return {
    score,
    tier,
    factors,
    estimatedTokens: Math.ceil(prompt.length / 4),
  };
}

// ═══════════════════════════════════════════════
// INTERNAL: MODEL SELECTION
// ═══════════════════════════════════════════════

function selectModel(
  complexity: ComplexityAnalysis,
  preference: string,
  capability: string
): ModelConfig | null {
  const available = MODELS.filter(m => m.available());
  if (available.length === 0) return null;

  // Filter by capability
  const capable = available.filter(m => m.capabilities.includes(capability));
  const pool = capable.length > 0 ? capable : available;

  // Filter by tier (allow tier match or higher)
  const tierOrder = { small: 0, medium: 1, large: 2 };
  const minTier = tierOrder[complexity.tier];
  const tiered = pool.filter(m => tierOrder[m.tier] >= minTier);
  const candidates = tiered.length > 0 ? tiered : pool;

  // Sort by preference
  switch (preference) {
    case 'quality':
      return candidates.sort((a, b) => tierOrder[b.tier] - tierOrder[a.tier])[0];
    case 'speed':
      return candidates.sort((a, b) => a.latencyMs - b.latencyMs)[0];
    case 'cost':
      return candidates.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens)[0];
    case 'balanced':
    default: {
      // Score: quality(40%) + speed(30%) + cost(30%)
      return candidates.sort((a, b) => {
        const scoreA = tierOrder[a.tier] * 0.4 - (a.latencyMs / 5000) * 0.3 - (a.costPer1kTokens / 10) * 0.3;
        const scoreB = tierOrder[b.tier] * 0.4 - (b.latencyMs / 5000) * 0.3 - (b.costPer1kTokens / 10) * 0.3;
        return scoreB - scoreA;
      })[0];
    }
  }
}

// ═══════════════════════════════════════════════
// INTERNAL: MODEL EXECUTION
// ═══════════════════════════════════════════════

async function executeOnModel(model: ModelConfig, prompt: string, maxTokens: number): Promise<string | null> {
  switch (model.provider) {
    case 'sampling':
      return requestSampling(prompt, { maxTokens });

    case 'openrouter': {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id.replace('openrouter/', ''),
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json() as any;
      return data?.choices?.[0]?.message?.content || null;
    }

    case 'deepseek': {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json() as any;
      return data?.choices?.[0]?.message?.content || null;
    }

    case 'kimi': {
      const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KIMI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json() as any;
      return data?.choices?.[0]?.message?.content || null;
    }

    case 'ollama': {
      try {
        const resp = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id.replace('ollama/', ''),
            prompt,
            stream: false,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await resp.json() as any;
        return data?.response || null;
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

function out(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
