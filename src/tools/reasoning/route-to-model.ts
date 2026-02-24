/**
 * VegaMCP — Multi-Model Reasoning Router v3.2
 * 
 * Major upgrade: Reasoning modes, auto-routing, multi-model debate,
 * conversation memory, updated models, system prompt presets, structured output.
 * 
 * Inspired by: Claude Code agents, multi-agent debate architectures,
 * ensemble voting systems, and chain-of-thought research.
 */

import { checkRateLimit } from '../../security/rate-limiter.js';
import { validateString } from '../../security/input-validator.js';
import { logAudit, logReasoningUsage, searchEntities } from '../../db/graph-store.js';
import { checkTokenBudget } from '../capabilities/token-budget.js';

// ═══════════════════════════════════════════════
// MODEL REGISTRY — Updated 2026
// ═══════════════════════════════════════════════

interface ModelInfo {
  id: string;
  apiModel: string;
  provider: string;
  category: 'reasoning' | 'fast' | 'code' | 'general' | 'local';
  contextWindow: number;
  costPer1kIn: number;
  costPer1kOut: number;
  strengths: string[];
}

const MODEL_REGISTRY: Record<string, ModelInfo> = {
  // DeepSeek
  'deepseek/deepseek-r1':      { id: 'deepseek/deepseek-r1', apiModel: 'deepseek-reasoner', provider: 'deepseek', category: 'reasoning', contextWindow: 64000, costPer1kIn: 0.00055, costPer1kOut: 0.0022, strengths: ['math', 'logic', 'chain-of-thought'] },
  'deepseek/deepseek-chat':    { id: 'deepseek/deepseek-chat', apiModel: 'deepseek-chat', provider: 'deepseek', category: 'general', contextWindow: 128000, costPer1kIn: 0.00014, costPer1kOut: 0.00028, strengths: ['general', 'coding', 'cheap'] },
  'deepseek/deepseek-v3':      { id: 'deepseek/deepseek-v3', apiModel: 'deepseek-chat', provider: 'deepseek', category: 'general', contextWindow: 128000, costPer1kIn: 0.00014, costPer1kOut: 0.00028, strengths: ['general', 'coding', 'latest'] },
  // Anthropic
  'anthropic/claude-3.5-sonnet': { id: 'anthropic/claude-3.5-sonnet', apiModel: 'anthropic/claude-3.5-sonnet', provider: 'openrouter', category: 'general', contextWindow: 200000, costPer1kIn: 0.003, costPer1kOut: 0.015, strengths: ['coding', 'analysis', 'writing'] },
  'anthropic/claude-sonnet-4':  { id: 'anthropic/claude-sonnet-4', apiModel: 'anthropic/claude-sonnet-4', provider: 'openrouter', category: 'general', contextWindow: 200000, costPer1kIn: 0.003, costPer1kOut: 0.015, strengths: ['coding', 'analysis', 'reasoning'] },
  'anthropic/claude-opus-4':    { id: 'anthropic/claude-opus-4', apiModel: 'anthropic/claude-opus-4', provider: 'openrouter', category: 'reasoning', contextWindow: 200000, costPer1kIn: 0.015, costPer1kOut: 0.075, strengths: ['deep-reasoning', 'complex-analysis', 'coding'] },
  // OpenAI
  'openai/gpt-4o':             { id: 'openai/gpt-4o', apiModel: 'openai/gpt-4o', provider: 'openrouter', category: 'general', contextWindow: 128000, costPer1kIn: 0.0025, costPer1kOut: 0.01, strengths: ['general', 'multimodal', 'fast'] },
  'openai/gpt-4.1':            { id: 'openai/gpt-4.1', apiModel: 'openai/gpt-4.1', provider: 'openrouter', category: 'general', contextWindow: 128000, costPer1kIn: 0.002, costPer1kOut: 0.008, strengths: ['coding', 'instruction-following'] },
  'openai/o3-mini':            { id: 'openai/o3-mini', apiModel: 'openai/o3-mini', provider: 'openrouter', category: 'reasoning', contextWindow: 128000, costPer1kIn: 0.0011, costPer1kOut: 0.0044, strengths: ['reasoning', 'math', 'logic'] },
  // Meta
  'meta-llama/llama-3.1-405b': { id: 'meta-llama/llama-3.1-405b', apiModel: 'meta-llama/llama-3.1-405b', provider: 'openrouter', category: 'general', contextWindow: 128000, costPer1kIn: 0.003, costPer1kOut: 0.003, strengths: ['general', 'open-source'] },
  'meta-llama/llama-4-maverick': { id: 'meta-llama/llama-4-maverick', apiModel: 'meta-llama/llama-4-maverick', provider: 'openrouter', category: 'general', contextWindow: 128000, costPer1kIn: 0.002, costPer1kOut: 0.006, strengths: ['general', 'coding', 'latest'] },
  // Kimi
  'moonshot/kimi-128k':        { id: 'moonshot/kimi-128k', apiModel: 'kimi-for-coding', provider: 'kimi', category: 'code', contextWindow: 128000, costPer1kIn: 0.00084, costPer1kOut: 0.00084, strengths: ['long-context', 'coding', 'cheap'] },
  'moonshot/kimi-32k':         { id: 'moonshot/kimi-32k', apiModel: 'kimi-for-coding', provider: 'kimi', category: 'code', contextWindow: 32000, costPer1kIn: 0.00084, costPer1kOut: 0.00084, strengths: ['coding', 'cheap'] },
  // Google
  'google/gemini-2.0-flash':   { id: 'google/gemini-2.0-flash', apiModel: 'gemini-2.0-flash', provider: 'google', category: 'fast', contextWindow: 1000000, costPer1kIn: 0.0001, costPer1kOut: 0.0004, strengths: ['speed', 'cheap', 'long-context'] },
  'google/gemini-2.5-pro':     { id: 'google/gemini-2.5-pro', apiModel: 'gemini-2.5-pro-preview-06-05', provider: 'google', category: 'reasoning', contextWindow: 1000000, costPer1kIn: 0.00125, costPer1kOut: 0.01, strengths: ['reasoning', 'coding', 'multimodal'] },
  'google/gemini-2.5-flash':   { id: 'google/gemini-2.5-flash', apiModel: 'gemini-2.5-flash-preview-05-20', provider: 'google', category: 'fast', contextWindow: 1000000, costPer1kIn: 0.00015, costPer1kOut: 0.0006, strengths: ['speed', 'reasoning', 'cheap'] },
  // Groq
  'groq/llama-3.3-70b':       { id: 'groq/llama-3.3-70b', apiModel: 'llama-3.3-70b-versatile', provider: 'groq', category: 'fast', contextWindow: 128000, costPer1kIn: 0.00059, costPer1kOut: 0.00079, strengths: ['ultra-fast', 'general'] },
  'groq/mixtral-8x7b':        { id: 'groq/mixtral-8x7b', apiModel: 'mixtral-8x7b-32768', provider: 'groq', category: 'fast', contextWindow: 32000, costPer1kIn: 0.00024, costPer1kOut: 0.00024, strengths: ['ultra-fast', 'cheap'] },
  // Mistral
  'mistral/mistral-large':    { id: 'mistral/mistral-large', apiModel: 'mistral-large-latest', provider: 'mistral', category: 'general', contextWindow: 128000, costPer1kIn: 0.002, costPer1kOut: 0.006, strengths: ['general', 'multilingual'] },
  'mistral/codestral':        { id: 'mistral/codestral', apiModel: 'codestral-latest', provider: 'mistral', category: 'code', contextWindow: 32000, costPer1kIn: 0.0003, costPer1kOut: 0.0009, strengths: ['code-generation', 'fast', 'cheap'] },
  // Together
  'together/qwen-2.5-72b':    { id: 'together/qwen-2.5-72b', apiModel: 'Qwen/Qwen2.5-72B-Instruct-Turbo', provider: 'together', category: 'general', contextWindow: 128000, costPer1kIn: 0.0009, costPer1kOut: 0.0009, strengths: ['general', 'multilingual'] },
  'together/qwen-3-235b':     { id: 'together/qwen-3-235b', apiModel: 'Qwen/Qwen3-235B-A22B-fp8', provider: 'together', category: 'reasoning', contextWindow: 128000, costPer1kIn: 0.002, costPer1kOut: 0.006, strengths: ['reasoning', 'coding', 'multilingual'] },
  // xAI
  'xai/grok-3-mini':          { id: 'xai/grok-3-mini', apiModel: 'grok-3-mini', provider: 'xai', category: 'fast', contextWindow: 128000, costPer1kIn: 0.0003, costPer1kOut: 0.0005, strengths: ['fast', 'reasoning', 'cheap'] },
  // Local
  'ollama/auto':              { id: 'ollama/auto', apiModel: 'auto', provider: 'ollama', category: 'local', contextWindow: 32000, costPer1kIn: 0, costPer1kOut: 0, strengths: ['free', 'private', 'offline'] },
};

const VALID_MODELS = Object.keys(MODEL_REGISTRY);

// ═══════════════════════════════════════════════
// SYSTEM PROMPT PRESETS
// ═══════════════════════════════════════════════

const SYSTEM_PRESETS: Record<string, string> = {
  engineer: 'You are an expert software engineer. Solve problems step by step with clean, production-ready code. Consider edge cases, performance, and maintainability. Show your reasoning process.',
  mathematician: 'You are a world-class mathematician and algorithmic thinker. Approach problems with mathematical rigor. Define variables, state assumptions, prove correctness, and analyze complexity. Use formal notation where helpful.',
  security_auditor: 'You are a senior security auditor. Identify vulnerabilities, assess risk levels (critical/high/medium/low), suggest mitigations, and reference CWE/CVE identifiers where applicable. Think like an attacker.',
  architect: 'You are a principal software architect. Design systems considering scalability, reliability, maintainability, and cost. Evaluate trade-offs explicitly. Use diagrams (ASCII/mermaid) when helpful. Reference established patterns.',
  teacher: 'You are a patient, expert teacher. Explain concepts from first principles. Use analogies, examples, and progressive complexity. Check understanding at each step. Make complex topics accessible.',
  critic: 'You are a thorough code reviewer and technical critic. Identify bugs, anti-patterns, performance issues, and readability problems. Rate severity. Suggest specific improvements with code examples.',
  creative: 'You are a creative problem solver and innovator. Think outside the box. Generate multiple unconventional approaches before converging on the best solution. Challenge assumptions.',
  data_scientist: 'You are an expert data scientist. Approach problems with statistical rigor. Consider data quality, bias, feature engineering, model selection, and evaluation metrics. Show your analytical process.',
  debugger: 'You are an expert debugger and diagnostician. Systematically analyze the problem: reproduce, isolate, identify root cause, verify fix. Use hypothesis-driven debugging. Consider race conditions, edge cases, and environmental factors.',
  devops: 'You are a DevOps/SRE expert. Focus on reliability, observability, automation, and infrastructure-as-code. Consider deployment strategies, monitoring, incident response, and cost optimization.',
};

// ═══════════════════════════════════════════════
// REASONING MODES
// ═══════════════════════════════════════════════

type ReasoningMode = 'analyze' | 'quick' | 'code' | 'debug' | 'explain' | 'debate' | 'chain' | 'critique' | 'auto';

const MODE_CONFIGS: Record<ReasoningMode, { defaultModel: string; maxTokens: number; temperature: number; description: string; systemPreset: string }> = {
  analyze:  { defaultModel: 'deepseek/deepseek-r1', maxTokens: 8192, temperature: 0.1, description: 'Deep analysis — thorough, high-quality reasoning', systemPreset: 'engineer' },
  quick:    { defaultModel: 'google/gemini-2.5-flash', maxTokens: 2048, temperature: 0.3, description: 'Fast answer — speed optimized, lower cost', systemPreset: 'engineer' },
  code:     { defaultModel: 'mistral/codestral', maxTokens: 8192, temperature: 0.1, description: 'Code generation — optimized for programming tasks', systemPreset: 'engineer' },
  debug:    { defaultModel: 'anthropic/claude-sonnet-4', maxTokens: 4096, temperature: 0.1, description: 'Debugging — hypothesis-driven root cause analysis', systemPreset: 'debugger' },
  explain:  { defaultModel: 'openai/gpt-4o', maxTokens: 4096, temperature: 0.4, description: 'Teaching — step-by-step explanations', systemPreset: 'teacher' },
  debate:   { defaultModel: 'deepseek/deepseek-r1', maxTokens: 4096, temperature: 0.3, description: 'Multi-model debate — run 2-3 models, synthesize best answer', systemPreset: 'critic' },
  chain:    { defaultModel: 'deepseek/deepseek-r1', maxTokens: 4096, temperature: 0.2, description: 'Chain decomposition — break → solve parts → synthesize', systemPreset: 'architect' },
  critique: { defaultModel: 'anthropic/claude-sonnet-4', maxTokens: 6144, temperature: 0.2, description: 'Self-critique — generate answer, then critically review it', systemPreset: 'critic' },
  auto:     { defaultModel: 'auto', maxTokens: 4096, temperature: 0.2, description: 'Auto-detect best mode and model from problem text', systemPreset: 'engineer' },
};

// ═══════════════════════════════════════════════
// CONVERSATION SESSIONS
// ═══════════════════════════════════════════════

interface ConversationTurn { role: 'user' | 'assistant'; content: string; model?: string; timestamp: string; }
interface ConversationSession { id: string; turns: ConversationTurn[]; mode: ReasoningMode; model: string; created: string; }

const sessions = new Map<string, ConversationSession>();
let sessionCounter = 0;

// ═══════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════

export const routeToReasoningModelSchema = {
  name: 'route_to_reasoning_model',
  description: 'Delegate complex reasoning to specialized AI models. Modes: analyze (deep), quick (fast), code (programming), debug (root-cause), explain (teaching), debate (multi-model), chain (decomposition), critique (self-review), auto (smart-pick). 25+ models across 10 providers. Features: conversation memory, system prompt presets, structured output, auto-routing, budget-aware.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      problem: { type: 'string' as const, description: 'The problem to solve. Include constraints, examples, and code snippets.' },
      mode: { type: 'string' as const, enum: ['analyze', 'quick', 'code', 'debug', 'explain', 'debate', 'chain', 'critique', 'auto'] as const, description: 'Reasoning mode. Default: auto (smart-picks based on problem).' },
      model: { type: 'string' as const, enum: VALID_MODELS as unknown as readonly string[], description: 'Override model selection. Leave blank for auto-routing.' },
      systemPrompt: { type: 'string' as const, description: 'Custom system prompt. Or use preset name: engineer, mathematician, security_auditor, architect, teacher, critic, creative, data_scientist, debugger, devops.' },
      session_id: { type: 'string' as const, description: 'Continue a conversation session. Omit to start new.' },
      output_format: { type: 'string' as const, enum: ['free', 'json', 'code_only', 'markdown', 'structured'] as const, description: 'Output format. Default: free.' },
      debate_models: { type: 'array' as const, items: { type: 'string' as const }, description: 'Models to use in debate mode (2-3 models). Auto-selected if omitted.' },
      maxTokens: { type: 'number' as const, description: 'Max response tokens (256-16384).' },
      temperature: { type: 'number' as const, description: 'Sampling temperature 0.0-1.0.' },
      includeMemoryContext: { type: 'boolean' as const, description: 'Inject relevant memory graph context. Default: true.' },
      checkBudget: { type: 'boolean' as const, description: 'Check token budget before calling. Default: true.' },
    },
    required: ['problem'] as const,
  },
};

// ═══════════════════════════════════════════════
// API CONFIGURATION
// ═══════════════════════════════════════════════

interface ApiConfig { url: string; apiKey: string; provider: string; }

function getApiConfig(model: string): ApiConfig | null {
  const info = MODEL_REGISTRY[model];
  if (!info) return null;

  if (info.provider === 'ollama') {
    return { url: `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/chat`, apiKey: '', provider: 'ollama' };
  }
  if (info.provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    return { url: 'https://api.deepseek.com/chat/completions', apiKey: process.env.DEEPSEEK_API_KEY, provider: 'deepseek' };
  }
  if (info.provider === 'kimi' && process.env.KIMI_API_KEY) {
    return { url: 'https://api.kimi.com/coding/v1/chat/completions', apiKey: process.env.KIMI_API_KEY, provider: 'kimi' };
  }
  if (info.provider === 'google' && process.env.GEMINI_API_KEY) {
    return { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', apiKey: process.env.GEMINI_API_KEY, provider: 'google' };
  }
  if (info.provider === 'groq' && process.env.GROQ_API_KEY) {
    return { url: 'https://api.groq.com/openai/v1/chat/completions', apiKey: process.env.GROQ_API_KEY, provider: 'groq' };
  }
  if (info.provider === 'mistral' && process.env.MISTRAL_API_KEY) {
    return { url: 'https://api.mistral.ai/v1/chat/completions', apiKey: process.env.MISTRAL_API_KEY, provider: 'mistral' };
  }
  if (info.provider === 'together' && process.env.TOGETHER_API_KEY) {
    return { url: 'https://api.together.xyz/v1/chat/completions', apiKey: process.env.TOGETHER_API_KEY, provider: 'together' };
  }
  if (info.provider === 'xai' && process.env.XAI_API_KEY) {
    return { url: 'https://api.x.ai/v1/chat/completions', apiKey: process.env.XAI_API_KEY, provider: 'xai' };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { url: 'https://openrouter.ai/api/v1/chat/completions', apiKey: process.env.OPENROUTER_API_KEY, provider: 'openrouter' };
  }
  return null;
}

function getAvailableProviders(): string[] {
  const p: string[] = [];
  if (process.env.OPENROUTER_API_KEY) p.push('openrouter');
  if (process.env.DEEPSEEK_API_KEY) p.push('deepseek');
  if (process.env.KIMI_API_KEY) p.push('kimi');
  if (process.env.GEMINI_API_KEY) p.push('google');
  if (process.env.GROQ_API_KEY) p.push('groq');
  if (process.env.MISTRAL_API_KEY) p.push('mistral');
  if (process.env.TOGETHER_API_KEY) p.push('together');
  if (process.env.XAI_API_KEY) p.push('xai');
  p.push('ollama');
  return p;
}

// ═══════════════════════════════════════════════
// AUTO-ROUTER — Smart model selection
// ═══════════════════════════════════════════════

function autoDetectMode(problem: string): ReasoningMode {
  const lower = problem.toLowerCase();
  const codeSignals = ['function', 'class ', 'const ', 'import ', 'def ', 'return ', 'error:', 'stacktrace', 'typeerror', 'syntaxerror', '```', 'implement', 'refactor', 'write a function', 'code that'];
  const debugSignals = ['bug', 'error', 'crash', 'not working', 'fails', 'broken', 'unexpected', 'wrong output', 'debug', 'fix this', 'stacktrace', 'exception'];
  const mathSignals = ['algorithm', 'complexity', 'proof', 'theorem', 'optimize', 'O(n)', 'mathematical', 'formula', 'equation', 'calculate'];
  const explainSignals = ['explain', 'what is', 'how does', 'why does', 'teach me', 'difference between', 'understand', 'learn about'];
  const archSignals = ['architecture', 'design', 'scalab', 'tradeoff', 'compare approach', 'system design', 'microservice'];

  const codeScore = codeSignals.filter(s => lower.includes(s)).length;
  const debugScore = debugSignals.filter(s => lower.includes(s)).length;
  const mathScore = mathSignals.filter(s => lower.includes(s)).length;
  const explainScore = explainSignals.filter(s => lower.includes(s)).length;
  const archScore = archSignals.filter(s => lower.includes(s)).length;

  if (debugScore >= 2) return 'debug';
  if (codeScore >= 2) return 'code';
  if (mathScore >= 2) return 'analyze';
  if (explainScore >= 2) return 'explain';
  if (archScore >= 2) return 'analyze';
  if (problem.length > 2000) return 'analyze';
  if (problem.length < 200) return 'quick';
  return 'analyze';
}

function autoSelectModel(mode: ReasoningMode): string {
  const config = MODE_CONFIGS[mode];
  const preferred = config.defaultModel;
  if (getApiConfig(preferred)) return preferred;

  // Fallback chain by category
  const category = MODEL_REGISTRY[preferred]?.category || 'general';
  const fallbacks = Object.values(MODEL_REGISTRY)
    .filter(m => m.category === category)
    .sort((a, b) => a.costPer1kOut - b.costPer1kOut);
  
  for (const m of fallbacks) {
    if (getApiConfig(m.id)) return m.id;
  }
  // Last resort: any available model
  for (const m of Object.values(MODEL_REGISTRY)) {
    if (getApiConfig(m.id)) return m.id;
  }
  return 'ollama/auto';
}

// ═══════════════════════════════════════════════
// OLLAMA
// ═══════════════════════════════════════════════

let ollamaAvailable: boolean | null = null;
let ollamaModels: string[] = [];

async function checkOllamaAvailability(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable;
  try {
    const url = process.env.OLLAMA_URL || 'http://localhost:11434';
    const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data: any = await response.json();
      ollamaModels = (data.models || []).map((m: any) => m.name);
      ollamaAvailable = ollamaModels.length > 0;
    } else { ollamaAvailable = false; }
  } catch { ollamaAvailable = false; }
  return ollamaAvailable;
}

async function callOllama(messages: Array<{role: string; content: string}>, maxTokens: number, temperature: number) {
  const url = process.env.OLLAMA_URL || 'http://localhost:11434';
  if (ollamaModels.length === 0) await checkOllamaAvailability();
  const preferred = ['llama3.1', 'llama3', 'codellama', 'mistral', 'phi3', 'qwen2', 'deepseek'];
  let selectedModel = ollamaModels[0] || 'llama3';
  for (const p of preferred) { const f = ollamaModels.find(m => m.toLowerCase().includes(p)); if (f) { selectedModel = f; break; } }

  const response = await fetch(`${url}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: selectedModel, messages, stream: false, options: { num_predict: maxTokens, temperature } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  const data: any = await response.json();
  return { content: data.message?.content || '', model: `ollama/${selectedModel}`, promptTokens: data.prompt_eval_count || 0, completionTokens: data.eval_count || 0 };
}

// ═══════════════════════════════════════════════
// API CALL
// ═══════════════════════════════════════════════

async function callModel(model: string, messages: Array<{role: string; content: string}>, maxTokens: number, temperature: number) {
  if (model.startsWith('ollama/')) return callOllama(messages, maxTokens, temperature);

  const apiConfig = getApiConfig(model);
  if (!apiConfig) throw new Error(`No API key for ${model}. Available: ${getAvailableProviders().join(', ')}`);

  const info = MODEL_REGISTRY[model];
  const apiModel = info?.apiModel || model;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` };
  if (apiConfig.provider === 'openrouter') { headers['HTTP-Referer'] = 'https://vegamcp.local'; headers['X-Title'] = 'VegaMCP'; }
  if (apiConfig.provider === 'kimi') { headers['User-Agent'] = 'claude-code/1.0'; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const response = await fetch(apiConfig.url, {
    method: 'POST', headers,
    body: JSON.stringify({ model: apiModel, messages, max_tokens: maxTokens, temperature, stream: false }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${err.slice(0, 500)}`);
  }

  const data: any = await response.json();
  const usage = data.usage || {};
  return {
    content: data.choices?.[0]?.message?.content || '',
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
  };
}

// ═══════════════════════════════════════════════
// CHAIN-OF-THOUGHT EXTRACTION
// ═══════════════════════════════════════════════

function extractChainOfThought(content: string) {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const cot = thinkMatch[1].trim();
    const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    const steps: string[] = [];
    const stepPattern = /(?:^|\n)\s*(?:Step\s+)?\d+[\.):\s]+(.+)/gi;
    let match;
    while ((match = stepPattern.exec(cot)) !== null) steps.push(match[1].trim());
    return { chainOfThought: cot, steps, answer };
  }
  return { chainOfThought: null, steps: [] as string[], answer: content };
}

// ═══════════════════════════════════════════════
// MEMORY CONTEXT
// ═══════════════════════════════════════════════

function buildMemoryContext(problem: string): string[] {
  try {
    const keywords = problem.split(/\s+/).filter(w => w.length > 4).slice(0, 5).join(' ');
    if (!keywords) return [];
    return searchEntities(keywords, undefined, undefined, 5)
      .flatMap(e => e.observations.map(obs => `• Entity "${e.name}": ${obs}`)).slice(0, 10);
  } catch { return []; }
}

// ═══════════════════════════════════════════════
// OUTPUT FORMAT WRAPPERS
// ═══════════════════════════════════════════════

function applyOutputFormat(format: string | undefined): string {
  switch (format) {
    case 'json': return '\n\nIMPORTANT: Return your answer as valid JSON only. No markdown, no explanation outside the JSON structure.';
    case 'code_only': return '\n\nIMPORTANT: Return ONLY code. No explanations, no markdown fences, just raw executable code.';
    case 'markdown': return '\n\nIMPORTANT: Format your entire response as clean, well-structured Markdown with headers, lists, and code blocks.';
    case 'structured': return '\n\nIMPORTANT: Structure your answer with these sections:\n## Analysis\n## Approach\n## Solution\n## Trade-offs\n## Confidence (1-10)';
    default: return '';
  }
}

// ═══════════════════════════════════════════════
// DEBATE MODE — Multi-model comparison
// ═══════════════════════════════════════════════

async function runDebate(problem: string, systemPrompt: string, models: string[], maxTokens: number, temperature: number) {
  // Phase 1: Get independent answers
  const promises = models.map(m => callModel(m, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: problem },
  ], maxTokens, temperature).catch(err => ({ content: `[Error from ${m}: ${err.message}]`, model: m, promptTokens: 0, completionTokens: 0 })));

  const responses = await Promise.all(promises);
  
  // Phase 2: Synthesize with judge model
  const judgeModel = models.find(m => MODEL_REGISTRY[m]?.category === 'reasoning') || models[0];
  const synthesisPrompt = `You are a judge evaluating ${responses.length} different AI model responses to the same problem.

ORIGINAL PROBLEM:
${problem}

${responses.map((r, i) => `--- MODEL ${i + 1} (${r.model}) ---\n${r.content.slice(0, 3000)}\n`).join('\n')}

TASK: Analyze all responses. Identify the strongest reasoning, the most accurate answer, and any errors. Produce a final SYNTHESIZED answer that takes the best from each response. Also declare which model performed best and why.

Format:
## Best Model: [model name]
## Synthesis
[your synthesized best answer]
## Model Comparison
[brief comparison of each model's strengths/weaknesses]`;

  const synthesis = await callModel(judgeModel, [
    { role: 'system', content: 'You are an expert judge synthesizing answers from multiple AI models. Be fair, thorough, and identify the objectively best reasoning.' },
    { role: 'user', content: synthesisPrompt },
  ], maxTokens, 0.1);

  return {
    individualResponses: responses.map(r => ({ model: r.model, answer: r.content.slice(0, 2000), tokens: r.promptTokens + r.completionTokens })),
    synthesis: synthesis.content,
    judgeModel: judgeModel,
    totalTokens: responses.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0) + synthesis.promptTokens + synthesis.completionTokens,
  };
}

// ═══════════════════════════════════════════════
// CHAIN MODE — Decompose → solve → synthesize
// ═══════════════════════════════════════════════

async function runChain(problem: string, systemPrompt: string, model: string, maxTokens: number, temperature: number) {
  // Step 1: Decompose
  const decompose = await callModel(model, [
    { role: 'system', content: 'You are an expert problem decomposer. Break complex problems into 2-5 independent sub-problems. Return ONLY a numbered list of sub-problems, nothing else.' },
    { role: 'user', content: `Decompose this problem into sub-problems:\n\n${problem}` },
  ], 1024, 0.1);

  const subProblems = decompose.content.split('\n').filter((l: string) => l.trim().match(/^\d/)).map((l: string) => l.replace(/^\d+[\.):\s]+/, '').trim()).filter(Boolean);
  if (subProblems.length === 0) subProblems.push(problem);

  // Step 2: Solve each sub-problem
  const solutions: string[] = [];
  for (const sub of subProblems.slice(0, 5)) {
    const sol = await callModel(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Solve this specific sub-problem (part of a larger problem):\n\n${sub}\n\nOriginal context: ${problem.slice(0, 500)}` },
    ], Math.floor(maxTokens / 2), temperature);
    solutions.push(sol.content);
  }

  // Step 3: Synthesize
  const synthesis = await callModel(model, [
    { role: 'system', content: 'You are an expert synthesizer. Combine partial solutions into a coherent, complete answer.' },
    { role: 'user', content: `Original problem: ${problem}\n\nSub-problems and solutions:\n${subProblems.map((sp: string, i: number) => `### Sub-problem ${i + 1}: ${sp}\n${solutions[i]}\n`).join('\n')}\n\nSynthesize these into a complete, coherent answer.` },
  ], maxTokens, 0.2);

  return {
    subProblems,
    partialSolutions: solutions.map((s: string, i: number) => ({ subProblem: subProblems[i], solution: s.slice(0, 1500) })),
    finalAnswer: synthesis.content,
  };
}

// ═══════════════════════════════════════════════
// CRITIQUE MODE — Generate then self-critique
// ═══════════════════════════════════════════════

async function runCritique(problem: string, systemPrompt: string, model: string, maxTokens: number, temperature: number) {
  // Phase 1: Initial answer
  const initial = await callModel(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: problem },
  ], maxTokens, temperature);

  // Phase 2: Self-critique
  const critique = await callModel(model, [
    { role: 'system', content: 'You are a ruthless technical critic. Find every flaw, assumption, edge case missed, and potential improvement in the given answer. Be specific and constructive.' },
    { role: 'user', content: `PROBLEM:\n${problem}\n\nPROPOSED ANSWER:\n${initial.content}\n\nCritique this answer thoroughly. Identify:\n1. Errors or incorrect statements\n2. Missing edge cases\n3. Unstated assumptions\n4. Performance/scalability concerns\n5. Alternative approaches that might be better\n\nRate confidence 1-10.` },
  ], maxTokens, 0.2);

  // Phase 3: Improved answer incorporating critique
  const improved = await callModel(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `PROBLEM:\n${problem}\n\nMY INITIAL ANSWER:\n${initial.content}\n\nCRITIQUE OF MY ANSWER:\n${critique.content}\n\nNow produce an IMPROVED answer that addresses all the critique points. This should be your best possible answer.` },
  ], maxTokens, temperature);

  return {
    initialAnswer: initial.content,
    critique: critique.content,
    improvedAnswer: improved.content,
  };
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════

export async function handleRouteToReasoningModel(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  const rateCheck = checkRateLimit('reasoning');
  if (!rateCheck.allowed) {
    return res({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } });
  }

  try {
    const problemCheck = validateString(args.problem, 'problemDescription', 'problem');
    if (!problemCheck.valid) return res({ success: false, error: { code: 'INVALID_INPUT', message: problemCheck.error } });

    // Resolve mode
    let mode: ReasoningMode = args.mode || 'auto';
    if (mode === 'auto') mode = autoDetectMode(args.problem);
    const modeConfig = MODE_CONFIGS[mode];

    // Resolve model
    let model = args.model && VALID_MODELS.includes(args.model) ? args.model : autoSelectModel(mode);

    // Resolve system prompt
    let systemPrompt = args.systemPrompt || '';
    if (SYSTEM_PRESETS[systemPrompt]) systemPrompt = SYSTEM_PRESETS[systemPrompt];
    if (!systemPrompt) systemPrompt = SYSTEM_PRESETS[modeConfig.systemPreset] || SYSTEM_PRESETS.engineer;

    const maxTokens = Math.min(Math.max(args.maxTokens || modeConfig.maxTokens, 256), 16384);
    const temperature = Math.min(Math.max(args.temperature ?? modeConfig.temperature, 0), 1);

    // Add output format instruction
    systemPrompt += applyOutputFormat(args.output_format);

    // Budget check
    if (args.checkBudget !== false) {
      const budgetCheck = checkTokenBudget(model, maxTokens);
      if (!budgetCheck.allowed) {
        if (budgetCheck.recommendedModel) { model = budgetCheck.recommendedModel; }
        else return res({ success: false, error: { code: 'BUDGET_EXCEEDED', message: budgetCheck.reason }, budgetRemaining: budgetCheck.budgetRemaining });
      }
    }

    // Build context
    let enrichedProblem = problemCheck.value!;
    let memoryContext: string[] = [];
    if (args.includeMemoryContext !== false) {
      memoryContext = buildMemoryContext(enrichedProblem);
      if (memoryContext.length > 0) {
        enrichedProblem = `--- PROJECT CONTEXT ---\n${memoryContext.join('\n')}\n--- END CONTEXT ---\n\n${enrichedProblem}`;
      }
    }

    // Build messages (with conversation history if session)
    const messages: Array<{role: string; content: string}> = [{ role: 'system', content: systemPrompt }];
    if (args.session_id && sessions.has(args.session_id)) {
      const session = sessions.get(args.session_id)!;
      for (const turn of session.turns.slice(-10)) { messages.push({ role: turn.role, content: turn.content }); }
    }
    messages.push({ role: 'user', content: enrichedProblem });

    // ─── EXECUTE BY MODE ───
    let result: any;

    if (mode === 'debate') {
      const debateModels = args.debate_models?.length >= 2
        ? args.debate_models.filter((m: string) => getApiConfig(m))
        : pickDebateModels();
      if (debateModels.length < 2) return res({ success: false, error: { code: 'DEBATE_NEEDS_MODELS', message: 'Debate mode needs 2+ available models. Configure more API keys.' } });

      const debateResult = await runDebate(enrichedProblem, systemPrompt, debateModels, maxTokens, temperature);
      result = {
        success: true, mode: 'debate', models: debateModels, judgeModel: debateResult.judgeModel,
        individualResponses: debateResult.individualResponses,
        synthesis: debateResult.synthesis,
        usage: { totalTokens: debateResult.totalTokens, estimatedCost: `$${(debateResult.totalTokens * 0.002 / 1000).toFixed(4)}` },
      };
    } else if (mode === 'chain') {
      const chainResult = await runChain(enrichedProblem, systemPrompt, model, maxTokens, temperature);
      result = {
        success: true, mode: 'chain', model,
        subProblems: chainResult.subProblems,
        partialSolutions: chainResult.partialSolutions,
        answer: chainResult.finalAnswer,
      };
    } else if (mode === 'critique') {
      const critiqueResult = await runCritique(enrichedProblem, systemPrompt, model, maxTokens, temperature);
      result = {
        success: true, mode: 'critique', model,
        initialAnswer: critiqueResult.initialAnswer,
        critique: critiqueResult.critique,
        answer: critiqueResult.improvedAnswer,
      };
    } else {
      // Standard mode (analyze, quick, code, debug, explain)
      const response = await callModel(model, messages, maxTokens, temperature);
      const { chainOfThought, steps, answer } = extractChainOfThought(response.content);

      const costInfo = MODEL_REGISTRY[model] || { costPer1kIn: 0.001, costPer1kOut: 0.002 };
      const cost = (response.promptTokens / 1000 * costInfo.costPer1kIn) + (response.completionTokens / 1000 * costInfo.costPer1kOut);
      logReasoningUsage(model, response.promptTokens, response.completionTokens, cost);

      result = {
        success: true, mode, model, provider: MODEL_REGISTRY[model]?.provider || 'unknown',
        reasoning: chainOfThought ? { chainOfThought, steps: steps.length > 0 ? steps : undefined } : undefined,
        answer,
        usage: { promptTokens: response.promptTokens, completionTokens: response.completionTokens, totalTokens: response.promptTokens + response.completionTokens, estimatedCost: `$${cost.toFixed(4)}` },
      };

      // Save to conversation session
      const sessionId = args.session_id || `reason-${++sessionCounter}-${Date.now().toString(36)}`;
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { id: sessionId, turns: [], mode, model, created: new Date().toISOString() });
      }
      const session = sessions.get(sessionId)!;
      session.turns.push({ role: 'user', content: args.problem, timestamp: new Date().toISOString() });
      session.turns.push({ role: 'assistant', content: answer, model, timestamp: new Date().toISOString() });
      result.session_id = sessionId;
      result.conversationTurns = session.turns.length;
    }

    result.memoryContextUsed = memoryContext.length > 0 ? memoryContext : undefined;
    result.modeDescription = modeConfig.description;
    result.availableModes = Object.entries(MODE_CONFIGS).map(([k, v]) => ({ mode: k, description: v.description }));

    logAudit('route_to_reasoning_model', `${mode}/${model}, ${Date.now() - start}ms`, true, undefined, Date.now() - start);
    return res(result);
  } catch (err: any) {
    const code = err.name === 'AbortError' ? 'MODEL_TIMEOUT' : 'API_ERROR';
    logAudit('route_to_reasoning_model', err.message, false, code, Date.now() - start);
    return res({ success: false, error: { code, message: err.message } });
  }
}

function pickDebateModels(): string[] {
  const candidates = ['deepseek/deepseek-r1', 'anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'mistral/mistral-large'];
  return candidates.filter(m => getApiConfig(m)).slice(0, 3);
}

function res(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
