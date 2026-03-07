/**
 * VegaMCP — Adaptive Model Router
 * 
 * Intelligently routes LLM requests across the fleet AND cloud APIs.
 * Scores local Ollama models, fleet models, and cloud coding APIs
 * together to pick the absolute best option for each task.
 * 
 * Flow:
 *   1. Probes local hardware (RAM, GPU, CPU cores)
 *   2. Probes each fleet agent's Ollama instance for available models
 *   3. Discovers available cloud APIs via env vars
 *   4. Scores ALL candidates (local + fleet + cloud) in one ranking
 *   5. Routes to the winner — could be local, remote, or cloud
 * 
 * Supported Cloud APIs:
 *   DeepSeek, OpenRouter, OpenAI, Anthropic, Google Gemini,
 *   Groq, Mistral, Together, xAI, Kimi
 * 
 * Integrates with: project-memory.ts, whatsapp-bridge.ts, the-claw.ts
 */

import os from 'os';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface NodeCapability {
  nodeId: string;
  name: string;
  ollamaUrl: string;
  hardware: {
    totalRamGb: number;
    freeRamGb: number;
    cpuCores: number;
    cpuModel: string;
    hasGpu: boolean;
    gpuName?: string;
    gpuVramGb?: number;
  };
  models: ModelInfo[];
  lastProbed: number;
  reachable: boolean;
  latencyMs: number;
}

export interface ModelInfo {
  name: string;
  size: number;         // bytes
  sizeGb: number;       // for quick comparison
  parameterSize: string; // e.g. "8B", "70B"
  quantization: string;  // e.g. "Q4_K_M"
  family: string;        // e.g. "llama", "deepseek", "qwen"
}

export interface RoutingDecision {
  nodeId: string;
  nodeName: string;
  ollamaUrl: string;
  model: string;
  reason: string;
  score: number;
  isCloud: boolean;
  apiEndpoint?: string;
  apiKey?: string;
}

// Cloud provider definitions
interface CloudProvider {
  id: string;
  name: string;
  envKey: string;
  endpoint: string;
  models: CloudModel[];
}

interface CloudModel {
  id: string;
  name: string;
  parameterSize: string;
  family: string;
  strengths: TaskType[];
  score: Record<TaskType, number>;
}

// ═══════════════════════════════════════════════════════════════
// Fleet Node Registry
// ═══════════════════════════════════════════════════════════════

const nodeCapabilities = new Map<string, NodeCapability>();
const PROBE_INTERVAL_MS = 60_000; // Re-probe every 60s
const PROBE_TIMEOUT_MS = 5_000;

// ═══════════════════════════════════════════════════════════════
// Local Hardware Detection
// ═══════════════════════════════════════════════════════════════

function getLocalHardware(): NodeCapability['hardware'] {
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const cpus = os.cpus();

  return {
    totalRamGb: Math.round(totalRam / (1024 ** 3) * 10) / 10,
    freeRamGb: Math.round(freeRam / (1024 ** 3) * 10) / 10,
    cpuCores: cpus.length,
    cpuModel: cpus[0]?.model || 'Unknown',
    hasGpu: false, // Detected via Ollama GPU check
    gpuName: undefined,
    gpuVramGb: undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// Ollama Probing — Discover models & GPU on a node
// ═══════════════════════════════════════════════════════════════

async function probeOllamaNode(
  nodeId: string,
  nodeName: string,
  ollamaUrl: string
): Promise<NodeCapability> {
  const start = Date.now();
  const hardware = nodeId === 'local' ? getLocalHardware() : {
    totalRamGb: 0, freeRamGb: 0, cpuCores: 0,
    cpuModel: 'Remote', hasGpu: false,
  };

  try {
    // Fetch available models
    const modelsResp = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!modelsResp.ok) {
      return {
        nodeId, name: nodeName, ollamaUrl, hardware,
        models: [], lastProbed: Date.now(), reachable: false,
        latencyMs: Date.now() - start,
      };
    }

    const modelsData = await modelsResp.json() as any;
    const models: ModelInfo[] = (modelsData.models || []).map((m: any) => ({
      name: m.name || m.model,
      size: m.size || 0,
      sizeGb: Math.round((m.size || 0) / (1024 ** 3) * 10) / 10,
      parameterSize: m.details?.parameter_size || extractParamSize(m.name || ''),
      quantization: m.details?.quantization_level || 'unknown',
      family: m.details?.family || extractFamily(m.name || ''),
    }));

    // Check for GPU via Ollama's /api/version or running model info
    let hasGpu = false;
    let gpuName: string | undefined;
    let gpuVramGb: number | undefined;

    try {
      // Try to get GPU info from a running model's process info
      const psResp = await fetch(`${ollamaUrl}/api/ps`, {
        signal: AbortSignal.timeout(3000),
      });
      if (psResp.ok) {
        const psData = await psResp.json() as any;
        const runningModels = psData.models || [];
        for (const rm of runningModels) {
          if (rm.size_vram && rm.size_vram > 0) {
            hasGpu = true;
            gpuVramGb = Math.round(rm.size_vram / (1024 ** 3) * 10) / 10;
          }
        }
      }
    } catch { /* no GPU info available */ }

    // If remote, try to get system info via the Claw gateway
    if (nodeId !== 'local') {
      try {
        const gatewayResp = await fetch(`http://127.0.0.1:42019/status`, {
          signal: AbortSignal.timeout(3000),
        });
        const gatewayData = await gatewayResp.json() as any;
        const agent = (gatewayData.fleet || []).find((a: any) => a.id === nodeId);
        if (agent) {
          hardware.totalRamGb = agent.ram_total || hardware.totalRamGb;
          hardware.freeRamGb = agent.ram_free || hardware.freeRamGb;
          hardware.cpuCores = agent.cpu_cores || hardware.cpuCores;
          hardware.cpuModel = agent.cpu_model || hardware.cpuModel;
        }
      } catch { /* no gateway data */ }
    }

    hardware.hasGpu = hasGpu;
    hardware.gpuName = gpuName;
    hardware.gpuVramGb = gpuVramGb;

    const latencyMs = Date.now() - start;

    return {
      nodeId, name: nodeName, ollamaUrl, hardware,
      models, lastProbed: Date.now(), reachable: true, latencyMs,
    };

  } catch {
    return {
      nodeId, name: nodeName, ollamaUrl, hardware,
      models: [], lastProbed: Date.now(), reachable: false,
      latencyMs: Date.now() - start,
    };
  }
}

function extractParamSize(name: string): string {
  const match = name.match(/(\d+\.?\d*)[bB]/);
  return match ? `${match[1]}B` : 'unknown';
}

function extractFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('llama')) return 'llama';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('mistral')) return 'mistral';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('phi')) return 'phi';
  if (lower.includes('codellama') || lower.includes('code')) return 'code';
  if (lower.includes('llava') || lower.includes('moondream')) return 'vision';
  return 'other';
}

// ═══════════════════════════════════════════════════════════════
// Model Scoring — Rank models by capability
// ═══════════════════════════════════════════════════════════════

function scoreModel(model: ModelInfo, node: NodeCapability, task: TaskType): number {
  let score = 0;

  // Base: Parameter size (bigger = smarter, usually)
  const params = parseFloat(model.parameterSize.replace(/[^0-9.]/g, '')) || 0;
  if (params >= 70) score += 100;
  else if (params >= 32) score += 80;
  else if (params >= 14) score += 60;
  else if (params >= 7) score += 40;
  else if (params >= 3) score += 20;
  else score += 10;

  // Family preference based on task
  if (task === 'brainstorm' || task === 'conversation') {
    if (model.family === 'deepseek') score += 15;
    if (model.family === 'llama') score += 10;
    if (model.family === 'qwen') score += 10;
  } else if (task === 'code') {
    if (model.family === 'code') score += 20;
    if (model.family === 'deepseek') score += 15;
    if (model.family === 'qwen') score += 10;
  } else if (task === 'vision') {
    if (model.family === 'vision') score += 50;
    else score -= 50; // Non-vision models can't do vision
  }

  // Hardware bonuses
  if (node.hardware.hasGpu) score += 25;
  if (node.hardware.gpuVramGb && node.hardware.gpuVramGb >= 8) score += 15;
  if (node.hardware.freeRamGb >= 16) score += 10;
  if (node.hardware.cpuCores >= 8) score += 5;

  // Quantization quality
  if (model.quantization.includes('f16') || model.quantization.includes('fp16')) score += 10;
  else if (model.quantization.includes('Q8')) score += 8;
  else if (model.quantization.includes('Q6')) score += 6;
  else if (model.quantization.includes('Q5') || model.quantization.includes('Q4_K_M')) score += 4;

  // Latency penalty (prefer faster nodes)
  if (node.latencyMs > 1000) score -= 10;
  if (node.latencyMs > 3000) score -= 20;

  // Can the node even run this model? (RAM check)
  if (model.sizeGb > node.hardware.freeRamGb * 0.8) {
    score -= 30; // Might cause swapping
  }

  return score;
}

type TaskType = 'brainstorm' | 'conversation' | 'code' | 'vision' | 'general';

// ═══════════════════════════════════════════════════════════════
// Cloud API Provider Registry
// ═══════════════════════════════════════════════════════════════

const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    id: 'deepseek', name: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY',
    endpoint: 'https://api.deepseek.com/chat/completions',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', parameterSize: '685B', family: 'deepseek',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 140, conversation: 130, brainstorm: 125, vision: 0, general: 130 } },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', parameterSize: '685B', family: 'deepseek',
        strengths: ['code', 'brainstorm'],
        score: { code: 155, conversation: 120, brainstorm: 145, vision: 0, general: 135 } },
    ],
  },
  {
    id: 'openrouter', name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', parameterSize: 'cloud', family: 'claude',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 180, conversation: 175, brainstorm: 165, vision: 130, general: 175 } },
      { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', parameterSize: 'cloud', family: 'claude',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 185, conversation: 180, brainstorm: 170, vision: 135, general: 180 } },
      { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', parameterSize: 'cloud', family: 'gemini',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 175, conversation: 170, brainstorm: 160, vision: 155, general: 170 } },
      { id: 'openai/gpt-5.4', name: 'GPT-5.4', parameterSize: 'cloud', family: 'gpt',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 180, conversation: 175, brainstorm: 165, vision: 150, general: 175 } },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (via OR)', parameterSize: '685B', family: 'deepseek',
        strengths: ['code', 'brainstorm'],
        score: { code: 150, conversation: 115, brainstorm: 140, vision: 0, general: 130 } },
      { id: 'mistralai/codestral-2501', name: 'Codestral 25.01', parameterSize: '22B', family: 'mistral',
        strengths: ['code'],
        score: { code: 145, conversation: 90, brainstorm: 85, vision: 0, general: 100 } },
      { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', parameterSize: '32B', family: 'qwen',
        strengths: ['code'],
        score: { code: 140, conversation: 95, brainstorm: 90, vision: 0, general: 105 } },
    ],
  },
  {
    id: 'openai', name: 'OpenAI', envKey: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', parameterSize: 'cloud', family: 'gpt',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 180, conversation: 175, brainstorm: 165, vision: 150, general: 175 } },
      { id: 'gpt-4.1', name: 'GPT-4.1', parameterSize: 'cloud', family: 'gpt',
        strengths: ['code', 'conversation', 'general'],
        score: { code: 155, conversation: 155, brainstorm: 145, vision: 140, general: 155 } },
      { id: 'o3', name: 'o3 (reasoning)', parameterSize: 'cloud', family: 'gpt',
        strengths: ['code', 'brainstorm'],
        score: { code: 175, conversation: 120, brainstorm: 165, vision: 0, general: 155 } },
      { id: 'o4-mini', name: 'o4-mini', parameterSize: 'cloud', family: 'gpt',
        strengths: ['code', 'vision'],
        score: { code: 160, conversation: 115, brainstorm: 140, vision: 145, general: 140 } },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', envKey: 'ANTHROPIC_API_KEY',
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', parameterSize: 'cloud', family: 'claude',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 185, conversation: 180, brainstorm: 170, vision: 135, general: 180 } },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', parameterSize: 'cloud', family: 'claude',
        strengths: ['code', 'conversation', 'brainstorm', 'general'],
        score: { code: 180, conversation: 175, brainstorm: 165, vision: 130, general: 175 } },
    ],
  },
  {
    id: 'google', name: 'Google Gemini', envKey: 'GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', parameterSize: 'cloud', family: 'gemini',
        strengths: ['code', 'conversation', 'brainstorm', 'vision', 'general'],
        score: { code: 175, conversation: 170, brainstorm: 160, vision: 160, general: 170 } },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (legacy)', parameterSize: 'cloud', family: 'gemini',
        strengths: ['code', 'conversation', 'brainstorm', 'vision', 'general'],
        score: { code: 160, conversation: 155, brainstorm: 150, vision: 145, general: 155 } },
    ],
  },
  {
    id: 'groq', name: 'Groq', envKey: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (Groq)', parameterSize: '17B', family: 'llama',
        strengths: ['conversation', 'code', 'general'],
        score: { code: 130, conversation: 135, brainstorm: 120, vision: 110, general: 130 } },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', parameterSize: '70B', family: 'llama',
        strengths: ['conversation', 'code', 'general'],
        score: { code: 120, conversation: 125, brainstorm: 115, vision: 0, general: 120 } },
    ],
  },
  {
    id: 'mistral', name: 'Mistral', envKey: 'MISTRAL_API_KEY',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    models: [
      { id: 'codestral-latest', name: 'Codestral 25.01', parameterSize: '22B', family: 'mistral',
        strengths: ['code'],
        score: { code: 145, conversation: 90, brainstorm: 85, vision: 0, general: 100 } },
      { id: 'mistral-large-latest', name: 'Mistral Large 3', parameterSize: '675B MoE', family: 'mistral',
        strengths: ['code', 'conversation', 'general'],
        score: { code: 150, conversation: 150, brainstorm: 140, vision: 120, general: 150 } },
    ],
  },
  {
    id: 'together', name: 'Together', envKey: 'TOGETHER_API_KEY',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    models: [
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen Coder 32B', parameterSize: '32B', family: 'qwen',
        strengths: ['code'],
        score: { code: 135, conversation: 90, brainstorm: 85, vision: 0, general: 100 } },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout', parameterSize: '17B', family: 'llama',
        strengths: ['code', 'conversation', 'general'],
        score: { code: 125, conversation: 130, brainstorm: 115, vision: 105, general: 125 } },
    ],
  },
  {
    id: 'xai', name: 'xAI', envKey: 'XAI_API_KEY',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    models: [
      { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Reasoning', parameterSize: 'cloud', family: 'grok',
        strengths: ['code', 'brainstorm'],
        score: { code: 160, conversation: 140, brainstorm: 150, vision: 0, general: 145 } },
      { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast', parameterSize: 'cloud', family: 'grok',
        strengths: ['code', 'conversation'],
        score: { code: 145, conversation: 150, brainstorm: 130, vision: 0, general: 140 } },
    ],
  },
  {
    id: 'kimi', name: 'Kimi', envKey: 'KIMI_API_KEY',
    endpoint: 'https://api.kimi.com/coding/v1/chat/completions',
    models: [
      { id: 'moonshot-v1-128k', name: 'Kimi Moonshot', parameterSize: 'cloud', family: 'kimi',
        strengths: ['code', 'conversation'],
        score: { code: 115, conversation: 120, brainstorm: 110, vision: 0, general: 115 } },
    ],
  },
];

function getAvailableCloudProviders(): { provider: CloudProvider; apiKey: string }[] {
  return CLOUD_PROVIDERS
    .filter(p => !!process.env[p.envKey])
    .map(p => ({ provider: p, apiKey: process.env[p.envKey]! }));
}

// ═══════════════════════════════════════════════════════════════
// Route — Pick the best model from local + fleet + cloud
// ═══════════════════════════════════════════════════════════════

export async function routeModel(
  task: TaskType = 'general',
  fleetNodes?: { id: string; name: string; ollamaUrl: string }[]
): Promise<RoutingDecision> {
  // Always probe local
  const localOllama = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const localNode = await probeOllamaNode('local', 'Local Machine', localOllama);
  nodeCapabilities.set('local', localNode);

  // Probe fleet nodes (if provided and not recently probed)
  if (fleetNodes) {
    for (const fn of fleetNodes) {
      const existing = nodeCapabilities.get(fn.id);
      if (!existing || (Date.now() - existing.lastProbed > PROBE_INTERVAL_MS)) {
        const cap = await probeOllamaNode(fn.id, fn.name, fn.ollamaUrl);
        nodeCapabilities.set(fn.id, cap);
      }
    }
  }

  // Collect all candidates: local Ollama + fleet Ollama + cloud APIs
  const candidates: Array<{
    nodeId: string; nodeName: string; ollamaUrl: string;
    model: string; score: number;
    isCloud: boolean; apiEndpoint?: string; apiKey?: string;
  }> = [];

  // Local + Fleet Ollama candidates
  for (const [, node] of nodeCapabilities) {
    if (!node.reachable || node.models.length === 0) continue;
    for (const model of node.models) {
      const s = scoreModel(model, node, task);
      candidates.push({
        nodeId: node.nodeId, nodeName: node.name, ollamaUrl: node.ollamaUrl,
        model: model.name, score: s, isCloud: false,
      });
    }
  }

  // Cloud API candidates
  const cloudProviders = getAvailableCloudProviders();
  for (const { provider, apiKey } of cloudProviders) {
    for (const cm of provider.models) {
      // Skip vision-only tasks with non-vision cloud models
      const taskScore = cm.score[task] || cm.score.general || 0;
      if (taskScore === 0) continue;

      candidates.push({
        nodeId: `cloud-${provider.id}`, nodeName: `${provider.name} API`,
        ollamaUrl: '', model: cm.id, score: taskScore,
        isCloud: true, apiEndpoint: provider.endpoint, apiKey,
      });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      nodeId: 'none', nodeName: 'No Model Available', ollamaUrl: '',
      model: 'none', reason: 'No local, fleet, or cloud models available. Set API keys or start Ollama.',
      score: 0, isCloud: false,
    };
  }

  const best = candidates[0];

  return {
    nodeId: best.nodeId,
    nodeName: best.nodeName,
    ollamaUrl: best.ollamaUrl,
    model: best.model,
    reason: best.isCloud
      ? `Using ${best.nodeName}: ${best.model} (score: ${best.score}). Cloud API chosen ${candidates.filter(c => !c.isCloud).length > 0 ? 'over' : 'because no'} local models ${candidates.filter(c => !c.isCloud).length > 0 ? `(best local: ${candidates.find(c => !c.isCloud)?.model || 'none'}, score: ${candidates.find(c => !c.isCloud)?.score || 0})` : 'available'}.`
      : best.nodeId === 'local'
        ? `Using local ${best.model} (score: ${best.score}).`
        : `Offloading to ${best.nodeName}: ${best.model} (score: ${best.score}).`,
    score: best.score,
    isCloud: best.isCloud,
    apiEndpoint: best.apiEndpoint,
    apiKey: best.apiKey,
  };
}

// ═══════════════════════════════════════════════════════════════
// Smart LLM Call — Unified local + fleet + cloud execution
// ═══════════════════════════════════════════════════════════════

export async function adaptiveChat(
  systemPrompt: string,
  userPrompt: string,
  task: TaskType = 'general',
  fleetNodes?: { id: string; name: string; ollamaUrl: string }[]
): Promise<{ text: string; model: string; node: string; reason: string }> {
  
  // Step 1: Find the absolute best model (local, fleet, OR cloud)
  const route = await routeModel(task, fleetNodes);

  if (route.nodeId === 'none') {
    return { text: '', model: 'none', node: 'none', reason: route.reason };
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Step 2: Execute on the chosen target
  if (route.isCloud && route.apiEndpoint && route.apiKey) {
    // ── Cloud API Call ──
    return await callCloudApi(route, messages, task);
  }

  // ── Local/Fleet Ollama Call ──
  try {
    const resp = await fetch(`${route.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: route.model,
        messages,
        stream: false,
        options: { temperature: task === 'brainstorm' ? 0.85 : 0.7, num_predict: 2000 },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      return {
        text: data?.message?.content || '',
        model: `${route.model}@${route.nodeName}`,
        node: route.nodeId,
        reason: route.reason,
      };
    }
  } catch { /* node failed */ }

  // Step 3: Ollama failed — try best cloud API as fallback
  const cloudFallback = getAvailableCloudProviders();
  if (cloudFallback.length > 0) {
    const fb = cloudFallback[0];
    const fbModel = fb.provider.models[0];
    const fbRoute: RoutingDecision = {
      nodeId: `cloud-${fb.provider.id}`, nodeName: `${fb.provider.name} API`,
      ollamaUrl: '', model: fbModel.id, reason: `Fallback after ${route.nodeName} failed`,
      score: 0, isCloud: true, apiEndpoint: fb.provider.endpoint, apiKey: fb.apiKey,
    };
    return await callCloudApi(fbRoute, messages, task);
  }

  return { text: '', model: 'none', node: 'none', reason: 'All providers failed.' };
}

// ═══════════════════════════════════════════════════════════════
// Cloud API Caller — Handles all cloud provider formats
// ═══════════════════════════════════════════════════════════════

async function callCloudApi(
  route: RoutingDecision,
  messages: { role: string; content: string }[],
  task: TaskType
): Promise<{ text: string; model: string; node: string; reason: string }> {
  const isAnthropic = route.nodeId.includes('anthropic');
  const temp = task === 'brainstorm' ? 0.85 : task === 'code' ? 0.3 : 0.7;

  try {
    if (isAnthropic) {
      // Anthropic has a different API format
      const systemMsg = messages.find(m => m.role === 'system');
      const userMsgs = messages.filter(m => m.role !== 'system');

      const resp = await fetch(route.apiEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': route.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: route.model,
          system: systemMsg?.content || '',
          messages: userMsgs,
          max_tokens: 4096,
          temperature: temp,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const text = data?.content?.[0]?.text || '';
        return { text, model: `${route.model}@${route.nodeName}`, node: route.nodeId, reason: route.reason };
      }
    } else {
      // OpenAI-compatible format (DeepSeek, OpenRouter, Google, Groq, Mistral, Together, xAI, Kimi)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${route.apiKey}`,
      };
      if (route.nodeId.includes('openrouter')) {
        headers['HTTP-Referer'] = 'https://vegamcp.dev';
      }

      const resp = await fetch(route.apiEndpoint!, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: route.model,
          messages,
          temperature: temp,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const text = data?.choices?.[0]?.message?.content || '';
        return { text, model: `${route.model}@${route.nodeName}`, node: route.nodeId, reason: route.reason };
      }
    }
  } catch { /* failed */ }

  return { text: '', model: route.model, node: route.nodeId, reason: `${route.nodeName} call failed` };
}

// ═══════════════════════════════════════════════════════════════
// Fleet Capability Report — For the GUI
// ═══════════════════════════════════════════════════════════════

export function getFleetCapabilities(): {
  nodes: NodeCapability[];
  cloudProviders: { id: string; name: string; models: string[]; available: boolean }[];
  totalModels: number;
  bestNode: string;
  recommendation: string;
} {
  const nodes = Array.from(nodeCapabilities.values());
  const reachable = nodes.filter(n => n.reachable);
  const localModels = reachable.reduce((sum, n) => sum + n.models.length, 0);

  // Cloud provider status
  const cloudStatus = CLOUD_PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    models: p.models.map(m => m.name),
    available: !!process.env[p.envKey],
  }));
  const availableCloud = cloudStatus.filter(c => c.available);
  const cloudModels = availableCloud.reduce((sum, c) => sum + c.models.length, 0);
  const totalModels = localModels + cloudModels;

  // Find best node
  let bestNode = 'none';
  let bestScore = -1;
  for (const node of reachable) {
    let nodeScore = 0;
    if (node.hardware.hasGpu) nodeScore += 50;
    nodeScore += node.hardware.totalRamGb;
    nodeScore += node.hardware.cpuCores * 2;
    nodeScore += node.models.length * 5;
    if (nodeScore > bestScore) {
      bestScore = nodeScore;
      bestNode = node.name;
    }
  }

  // Check if a cloud API would beat the best local
  if (availableCloud.length > 0 && bestScore < 100) {
    bestNode += ` (cloud APIs available: ${availableCloud.map(c => c.name).join(', ')})`;
  }

  let recommendation = '';
  if (reachable.length === 0 && availableCloud.length === 0) {
    recommendation = 'No models available. Start Ollama or set API keys (DEEPSEEK_API_KEY, OPENROUTER_API_KEY, etc).';
  } else if (reachable.length === 0) {
    recommendation = `No local Ollama, but ${availableCloud.length} cloud API${availableCloud.length > 1 ? 's' : ''} available: ${availableCloud.map(c => c.name).join(', ')}. Requests will route to cloud.`;
  } else {
    const gpuNodes = reachable.filter(n => n.hardware.hasGpu);
    recommendation = `${reachable.length} Ollama node${reachable.length > 1 ? 's' : ''} (${localModels} models) + ${availableCloud.length} cloud API${availableCloud.length > 1 ? 's' : ''} (${cloudModels} models). ${gpuNodes.length > 0 ? `GPU: ${gpuNodes.map(n => n.name).join(', ')}` : 'No GPU — cloud APIs will be preferred for large tasks.'}`;
  }

  return { nodes, cloudProviders: cloudStatus, totalModels, bestNode, recommendation };
}

// ═══════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════

export const AdaptiveRouter = {
  route: routeModel,
  chat: adaptiveChat,
  probe: probeOllamaNode,
  capabilities: getFleetCapabilities,
};
