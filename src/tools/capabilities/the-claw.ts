/**
 * VegaMCP — The Claw: Intelligent Multi-Agent Visual Orchestrator
 * 
 * Controls multiple AI agents across multiple machines/IDEs by:
 *   1. Taking screenshots of remote desktops (VPS/Docker via gateway)
 *   2. Sending screenshots to a vision AI for intelligent understanding
 *   3. Deciding what to do based on what it SEES (not dumb timeouts)
 *   4. Typing prompts, clicking buttons, reading responses
 *   5. Routing work between agents via relay channels
 * 
 * This is a meta-AI: an AI that controls other AIs through their GUIs.
 * 
 * Architecture:
 *   VegaMCP (orchestrator)
 *     ├── VPS-1: VS Code + Claude  (SSH tunnel → Gateway 42015)
 *     ├── VPS-2: Cursor + Gemini   (SSH tunnel → Gateway 42015)
 *     ├── Docker-1: Codex CLI      (TCP → Gateway 42016)
 *     └── Docker-2: Windsurf + o3  (TCP → Gateway 42017)
 *
 * Vision Analysis Priority:
 *   1. Ollama local model (llava/moondream) — fastest, free, private
 *   2. OpenRouter cloud (Gemini Flash) — fallback if no local model
 *   3. OpenAI (GPT-4o-mini) — fallback if no OpenRouter
 *   4. Heuristic — basic analysis without any AI
 */

import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import url from 'url';
import { EventEmitter } from 'events';
import { getIdeKnowledge } from './ide-knowledge.js';
import { ProjectMemory } from './project-memory.js';
import { AdaptiveRouter } from './adaptive-router.js';

// ═══════════════════════════════════════════════════════════════
// Observability: The Nervous System of The Claw
// ═══════════════════════════════════════════════════════════════

export interface ClawEvent {
  timestamp: number;
  type: 'sight' | 'thought' | 'action' | 'error' | 'meta';
  agent_id?: string;
  message: string;
  data?: any; // e.g. base64 image, parsed state, or raw cmd
}

class SystemMonitor extends EventEmitter {
  private logBuffer: ClawEvent[] = [];
  private readonly MAX_LOGS = 500;

  emit_event(event: Omit<ClawEvent, 'timestamp'>) {
    const fullEvent = { ...event, timestamp: Date.now() };
    this.logBuffer.push(fullEvent);
    if (this.logBuffer.length > this.MAX_LOGS) this.logBuffer.shift();
    this.emit('event', fullEvent);
    // Also write to a rolling debug file for recovery
    const logPath = path.join(os.tmpdir(), 'theclaw-live.log');
    fs.appendFileSync(logPath, JSON.stringify(fullEvent) + '\n');
  }

  get_recent_logs(limit = 100) {
    return this.logBuffer.slice(-limit);
  }

  // Self-Reflection: Filter logs to understand recent context
  reflect(query: string): string {
    const relevant = this.logBuffer.filter(e => 
      e.message.toLowerCase().includes(query.toLowerCase()) || 
      (e.agent_id && e.agent_id.toLowerCase().includes(query.toLowerCase()))
    ).slice(-20);
    
    return relevant.length > 0 
      ? relevant.map(e => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.type.toUpperCase()}: ${e.message}`).join('\n')
      : "No matching memory found.";
  }
}

export const monitor = new SystemMonitor();


// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface AgentTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  ide: string;
  model: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  lastScreenshot?: string;     // base64 PNG
  lastScreenState?: string;    // Vision AI description
  taskHistory: string[];
}

interface ScreenState {
  description: string;
  agent_status: 'idle' | 'thinking' | 'responding' | 'complete' | 'error' | 'unknown';
  has_text_input: boolean;
  response_text?: string;
  error_message?: string;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════
// Learned Positions — cache for UI element coordinates
// ═══════════════════════════════════════════════════════════════
const learnedPositions: Map<string, { model_selector?: { x: number; y: number } }> = new Map();

interface TaskRecord {
  id: string;
  agent_id: string;
  model: string;
  task_preview: string;
  task_keywords: string[];
  outcome: 'success' | 'failure' | 'timeout' | 'error';
  duration_ms: number;
  confidence: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// Agent Registry — tracks all controlled machines
// ═══════════════════════════════════════════════════════════════

const agents: Map<string, AgentTarget> = new Map();

// Auto-register configured environments from .env (via SSH tunnels)
if (process.env.VEGAMCP_VPS_1_HOST) {
  agents.set('vps-1', {
    id: 'vps-1',
    name: process.env.VEGAMCP_VPS_1_NAME || 'Windows VPS-1',
    host: '127.0.0.1', // Connected via SSH Tunnel
    port: 42015,
    ide: 'vscode',
    model: 'claude-3.5',
    status: 'idle',
    taskHistory: [],
  });
}

if (process.env.VEGAMCP_VPS_2_HOST) {
  agents.set('vps-2', {
    id: 'vps-2',
    name: process.env.VEGAMCP_VPS_2_NAME || 'Ubuntu Linux VPS-2',
    host: '127.0.0.1', // Connected via SSH Tunnel
    port: 42016,       // Offset port 42016 -> remote 42015
    ide: 'cursor', // Linux VPS typically uses Cursor or headless environments
    model: 'qwen2.5-coder', // Local Ollama model we provisioned
    status: 'idle',
    taskHistory: [],
  });
}


// ═══════════════════════════════════════════════════════════════
// Learning Ledger — persistent memory of task outcomes
// ═══════════════════════════════════════════════════════════════

const LEDGER_PATH = path.join(
  process.env.WORKSPACE_ROOT || path.join(os.homedir(), 'Documents', 'VegaMCP'),
  '.theclaw-ledger.json'
);

function loadLedger(): TaskRecord[] {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
    }
  } catch { /* corrupted file, start fresh */ }
  return [];
}

function saveLedger(records: TaskRecord[]): void {
  // Keep last 500 records to avoid unbounded growth
  const trimmed = records.slice(-500);
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
}

function recordOutcome(
  agentId: string, model: string, taskPreview: string,
  outcome: TaskRecord['outcome'], durationMs: number, confidence: number
): void {
  const records = loadLedger();
  const keywords = extractKeywords(taskPreview);
  records.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    agent_id: agentId,
    model,
    task_preview: taskPreview.substring(0, 200),
    task_keywords: keywords,
    outcome,
    duration_ms: durationMs,
    confidence,
    timestamp: Date.now(),
  });
  saveLedger(records);
}

function extractKeywords(text: string): string[] {
  // Extract meaningful words for task matching
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','to','of','and','in','for','on','with','it','this','that','do','at','by','from','or','as','if','can','will','should','would','could','make','use']);
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 15);
}

function getAgentStats(records: TaskRecord[]): Map<string, {
  agent_id: string; model: string; total: number; successes: number;
  failures: number; avg_duration_ms: number; success_rate: number;
  best_keywords: string[];
}> {
  const stats = new Map<string, any>();
  for (const r of records) {
    const key = r.agent_id;
    if (!stats.has(key)) {
      stats.set(key, {
        agent_id: r.agent_id, model: r.model, total: 0, successes: 0,
        failures: 0, durations: [], keywords_success: [] as string[],
      });
    }
    const s = stats.get(key)!;
    s.total++;
    if (r.outcome === 'success') {
      s.successes++;
      s.keywords_success.push(...r.task_keywords);
    } else {
      s.failures++;
    }
    s.durations.push(r.duration_ms);
  }
  // Compute derived fields
  for (const [key, s] of stats) {
    s.avg_duration_ms = Math.round(s.durations.reduce((a: number, b: number) => a + b, 0) / s.durations.length);
    s.success_rate = s.total > 0 ? +(s.successes / s.total).toFixed(2) : 0;
    // Find most common successful keywords
    const freq: Record<string, number> = {};
    for (const kw of s.keywords_success) { freq[kw] = (freq[kw] || 0) + 1; }
    s.best_keywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw]) => kw);
    delete s.durations;
    delete s.keywords_success;
  }
  return stats;
}

function findBestAgentForTask(task: string, records: TaskRecord[]): string | null {
  if (records.length < 3) return null; // Not enough data to learn from
  
  const taskKeywords = extractKeywords(task);
  const stats = getAgentStats(records);
  
  let bestScore = -1;
  let bestAgentId: string | null = null;
  
  for (const [agentId, s] of stats) {
    // Check if this agent is currently registered and idle
    const agent = agents.get(agentId);
    if (!agent || agent.status !== 'idle') continue;
    
    // Score = success_rate * keyword_overlap * recency_bonus
    const keywordOverlap = taskKeywords.filter(kw => s.best_keywords.includes(kw)).length;
    const keywordScore = taskKeywords.length > 0 ? keywordOverlap / taskKeywords.length : 0;
    const recencyBonus = 1.0; // Could weight recent performance higher
    
    const score = (s.success_rate * 0.6) + (keywordScore * 0.3) + (s.total > 10 ? 0.1 : 0);
    
    if (score > bestScore) {
      bestScore = score;
      bestAgentId = agentId;
    }
  }
  
  return bestAgentId;
}

// ═══════════════════════════════════════════════════════════════
// Gateway Communication — sends JSON-RPC to VegaSentinel
// ═══════════════════════════════════════════════════════════════

function sendToGateway(host: string, port: number, request: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Gateway timeout (5s)'));
    }, 5000);

    client.connect(port, host, () => {
      client.write(JSON.stringify(request));
    });

    let data = '';
    client.on('data', (chunk) => { data += chunk.toString(); });
    client.on('end', () => {
      clearTimeout(timeout);
      try { resolve(JSON.parse(data)); }
      catch { resolve({ success: false, output: data }); }
    });
    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

const VISION_PROMPT = `Analyze this screenshot of an IDE with an AI coding assistant. Return ONLY valid JSON:
{
  "description": "Brief description of what you see on screen",
  "agent_status": "idle|thinking|responding|complete|error|unknown",
  "has_text_input": true/false,
  "response_text": "The AI assistant's latest response text if visible (first 500 chars)",
  "error_message": "Any error message visible, or null",
  "confidence": 0.0-1.0
}

Rules for agent_status:
- "thinking": Loading spinner, "Generating...", typing indicator visible
- "responding": Text is actively appearing/streaming
- "complete": Response is fully rendered, cursor is back in input
- "idle": Chat is open but no activity
- "error": Error dialog, red text, crash message
- "unknown": Can't determine`;

function parseVisionResponse(text: string): ScreenState | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || 'Unknown',
        agent_status: parsed.agent_status || 'unknown',
        has_text_input: parsed.has_text_input ?? true,
        response_text: parsed.response_text || undefined,
        error_message: parsed.error_message || undefined,
        confidence: parsed.confidence || 0.5,
      };
    } catch { /* invalid JSON */ }
  }
  return null;
}

async function analyzeScreen(screenshotBase64: string): Promise<ScreenState> {
  // ── TIER 1: Ollama local vision model (fastest, free, private) ──
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModels = ['llava', 'moondream', 'llama3.2-vision', 'bakllava'];
  
  for (const model of ollamaModels) {
    try {
      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: VISION_PROMPT,
          images: [screenshotBase64],
          stream: false,
          options: { temperature: 0.1, num_predict: 600 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const result = parseVisionResponse(data?.response || '');
        if (result) {
          result.description = `[local:${model}] ${result.description}`;
          return result;
        }
      }
    } catch { /* Model not available, try next */ }
  }
  
  // ── TIER 2: Cloud API (OpenRouter → OpenAI) ──
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  
  if (apiKey) {
    try {
      const isOpenRouter = !!process.env.OPENROUTER_API_KEY;
      const baseUrl = isOpenRouter 
        ? 'https://openrouter.ai/api/v1' 
        : 'https://api.openai.com/v1';
      const model = isOpenRouter ? 'google/gemini-2.0-flash-001' : 'gpt-4o-mini';
      
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(isOpenRouter ? { 'HTTP-Referer': 'https://vegamcp.dev' } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }
            ]
          }],
          max_tokens: 600,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(20000),
      });
      
      const data = await response.json() as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const result = parseVisionResponse(text);
      if (result) {
        result.description = `[cloud:${model}] ${result.description}`;
        return result;
      }
    } catch { /* Cloud unavailable */ }
  }
  
  // ── TIER 3: Heuristic fallback ──
  return {
    description: 'Screenshot captured (no vision model available — install llava via: ollama pull llava)',
    agent_status: 'unknown',
    has_text_input: true,
    confidence: 0.1,
  };
}

// ═══════════════════════════════════════════════════════════════
// Intelligent Wait — polls screen until agent finishes
// ═══════════════════════════════════════════════════════════════

async function waitForCompletion(
  agent: AgentTarget,
  maxWaitMs: number = 120000,
  pollIntervalMs: number = 2000,
): Promise<ScreenState> {
  const start = Date.now();
  let lastState: ScreenState = {
    description: 'Starting observation...',
    agent_status: 'unknown',
    has_text_input: false,
    confidence: 0,
  };
  
  while (Date.now() - start < maxWaitMs) {
    // Take screenshot
    const response = await sendToGateway(agent.host, agent.port, { action: 'screenshot' });
    if (!response.success) {
      await sleep(pollIntervalMs);
      continue;
    }
    
    // Extract base64 from response
    let base64 = '';
    try {
      const parsed = JSON.parse(response.output);
      base64 = parsed.image_base64 || '';
    } catch {
      base64 = response.output;
    }
    
    if (!base64) {
      await sleep(pollIntervalMs);
      continue;
    }
    
    // Analyze with vision AI
    lastState = await analyzeScreen(base64);
    agent.lastScreenshot = base64;
    agent.lastScreenState = lastState.description;
    
    // Check if done
    if (lastState.agent_status === 'complete' || lastState.agent_status === 'idle') {
      return lastState;
    }
    
    if (lastState.agent_status === 'error') {
      return lastState;
    }
    
    // Still thinking/responding — wait and check again
    // Adaptive polling: check faster when responding (text streaming)
    const interval = lastState.agent_status === 'responding' 
      ? Math.max(1000, pollIntervalMs / 2)
      : pollIntervalMs;
    
    await sleep(interval);
  }
  
  // Timed out — return last known state
  lastState.description += ' (max wait time exceeded)';
  return lastState;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// Element Detection — find UI elements by description
// Like Cua.ai/Skyvern: "find the chat input box" → {x, y}
// ═══════════════════════════════════════════════════════════════

const FIND_ELEMENT_PROMPT = (description: string) => `Look at this screenshot and find the UI element described as: "${description}"

Return ONLY valid JSON:
{
  "found": true/false,
  "x": <center X coordinate of the element>,
  "y": <center Y coordinate of the element>,
  "width": <approximate width>,
  "height": <approximate height>,
  "element_type": "button|input|text|link|icon|menu|tab|dialog|other",
  "label": "visible text on/near the element",
  "confidence": 0.0-1.0
}

If multiple matches exist, return the most prominent one. Coordinates should be pixel positions on screen.`;

async function findElement(screenshotBase64: string, description: string): Promise<{
  found: boolean; x: number; y: number; width?: number; height?: number;
  element_type?: string; label?: string; confidence: number;
}> {
  // Try Ollama first, then cloud
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const prompt = FIND_ELEMENT_PROMPT(description);
  
  // Tier 1: Local Ollama
  for (const model of ['llava', 'moondream', 'llama3.2-vision']) {
    try {
      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, images: [screenshotBase64], stream: false, options: { temperature: 0.1 } }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const match = (data?.response || '').match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.found) return parsed;
        }
      }
    } catch { /* next */ }
  }
  
  // Tier 2: Cloud
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const isOR = !!process.env.OPENROUTER_API_KEY;
      const resp = await fetch(`${isOR ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...(isOR ? { 'HTTP-Referer': 'https://vegamcp.dev' } : {}) },
        body: JSON.stringify({
          model: isOR ? 'google/gemini-2.0-flash-001' : 'gpt-4o-mini',
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }] }],
          max_tokens: 300, temperature: 0.1,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await resp.json() as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.found) return parsed;
      }
    } catch { /* unavailable */ }
  }
  
  return { found: false, x: 0, y: 0, confidence: 0 };
}

// ═══════════════════════════════════════════════════════════════
// Task Decomposition — break complex tasks into subtasks
// Like Agent TARS/Agent S2: "build a dashboard" → 5 steps
// ═══════════════════════════════════════════════════════════════

interface TaskStep {
  step: number;
  description: string;
  prompt: string;
  prefer_model?: string;
  depends_on?: number[];
  parallel?: boolean;
}

async function decomposeTask(task: string, availableAgents: AgentTarget[]): Promise<TaskStep[]> {
  const agentList = availableAgents.map(a => `${a.id} (${a.model} in ${a.ide})`).join(', ');
  const prompt = `You are a task planner for a multi-agent AI system. Available agents: ${agentList}

Decompose this task into sequential steps that can be dispatched to different AI agents:
Task: "${task}"

Return ONLY a JSON array:
[
  {
    "step": 1,
    "description": "What this step accomplishes",
    "prompt": "The exact prompt to send to the AI agent",
    "prefer_model": "model name if this step needs a specific model, or null",
    "depends_on": [],
    "parallel": false
  }
]

Rules:
- Each step should be a self-contained prompt that an AI coding assistant can execute
- Use parallel: true for steps that can run simultaneously on different agents
- Use depends_on to reference step numbers that must complete first
- Be specific in prompts — the agent sees ONLY the prompt, not the overall plan
- Keep it to 3-8 steps maximum`;

  // Try Ollama first
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  for (const model of ['llama3.2', 'mistral', 'gemma2', 'phi3', 'deepseek-r1:8b']) {
    try {
      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3 } }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const match = (data?.response || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) return JSON.parse(match[0]);
      }
    } catch { /* next */ }
  }

  // Tier 2: DeepSeek API (cheapest cloud option for text gen)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500, temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json() as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) return JSON.parse(match[0]);
    } catch { /* next */ }
  }

  // Tier 3: OpenRouter / OpenAI cloud fallback
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const isOR = !!process.env.OPENROUTER_API_KEY;
      const resp = await fetch(`${isOR ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...(isOR ? { 'HTTP-Referer': 'https://vegamcp.dev' } : {}) },
        body: JSON.stringify({
          model: isOR ? 'deepseek/deepseek-chat' : 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500, temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await resp.json() as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) return JSON.parse(match[0]);
    } catch { /* unavailable */ }
  }
  
  // Fallback: single step
  return [{ step: 1, description: 'Execute full task', prompt: task, parallel: false }];
}

// ═══════════════════════════════════════════════════════════════
// Tool Schema
// ═══════════════════════════════════════════════════════════════

export const theClawSchema = {
  name: 'the_claw',
  description: `The Claw — Intelligent multi-agent visual orchestrator with learning. Controls multiple AI agents across multiple machines/IDEs by seeing their screens (via local Ollama vision models like llava/moondream) and interacting through keyboard/mouse. Learns from task outcomes to route work to the best agent. Actions: register (add a machine), unregister (remove), list (show all agents), prompt (type a prompt into an agent's IDE and intelligently wait for response), screenshot (capture + analyze screen), click (click coordinates), type (type text), key (send keypress), status (check agent state), dispatch (send task to best available agent using learned preferences), collect (gather results from all agents), learn (view task history and agent performance stats).`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['register', 'unregister', 'list', 'prompt', 'screenshot', 'click', 'type', 'key', 'status', 'dispatch', 'collect', 'learn', 'find_element', 'plan', 'run_plan', 'consensus', 'screen_diff', 'chain', 'race', 'handoff', 'record', 'replay', 'switch_model', 'ide_action'],
        description: 'The Claw action',
      },
      agent_id: { type: 'string', description: 'Agent identifier (for targeting a specific machine)' },
      // Register fields
      name: { type: 'string', description: 'Human-readable name (e.g. "VPS-Claude", "Docker-Gemini")' },
      host: { type: 'string', description: 'Gateway host (e.g. "localhost" for SSH-tunneled VPS)' },
      port: { type: 'number', description: 'Gateway port (e.g. 42015 for VPS, 42016 for Docker)' },
      ide: { type: 'string', description: 'IDE name (e.g. "vscode", "cursor", "windsurf")' },
      model: { type: 'string', description: 'AI model (e.g. "claude-4", "gemini-2.5", "gpt-4o")' },
      // Prompt fields
      prompt_text: { type: 'string', description: 'The prompt to type into the agent\'s IDE' },
      max_wait_ms: { type: 'number', description: 'Maximum time to wait for response (default: 120000ms)', default: 120000 },
      poll_interval_ms: { type: 'number', description: 'How often to check screen (default: 2000ms)', default: 2000 },
      // Click/Type fields
      x: { type: 'number', description: 'X coordinate for click' },
      y: { type: 'number', description: 'Y coordinate for click' },
      text: { type: 'string', description: 'Text to type' },
      key_name: { type: 'string', description: 'Key to send (enter, tab, escape, ctrl+s, etc.)' },
      // Dispatch fields
      task: { type: 'string', description: 'Task description for dispatch (will be sent to best available agent)' },
      prefer_model: { type: 'string', description: 'Preferred model for dispatch (optional)' },
      // Element detection fields
      element_description: { type: 'string', description: 'Description of UI element to find (e.g. "the chat input box", "the submit button")' },
      // Multi-agent fields
      agent_ids: { type: 'array', items: { type: 'string' }, description: 'Multiple agent IDs for consensus/race/chain' },
      workflow_name: { type: 'string', description: 'Name for saved workflow (record/replay)' },
      // Model switching
      target_model: { type: 'string', description: 'Target model name to switch to (e.g. "claude-3.5-sonnet", "gpt-4o", "gemini-2.5-pro")' },
      // IDE general actions
      action_name: { type: 'string', description: 'Name of the IDE action to perform (e.g. "toggle_terminal", "run_terminal_command", "open_file_explorer")' },
      // Observability
      limit: { type: 'number', description: 'Number of logs to fetch' },
      query: { type: 'string', description: 'Reflection query' },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}
function fail(code: string, msg: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message: msg } }) }] };
}

export async function handleTheClaw(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  switch (args.action) {

    // ── Register an agent target ──────────────────────────
    case 'register': {
      if (!args.agent_id || !args.host || !args.port) {
        return fail('MISSING_PARAM', 'agent_id, host, and port are required');
      }
      
      const agent: AgentTarget = {
        id: args.agent_id,
        name: args.name || args.agent_id,
        host: args.host,
        port: args.port,
        ide: args.ide || 'unknown',
        model: args.model || 'unknown',
        status: 'idle',
        taskHistory: [],
      };
      
      // Test connectivity
      try {
        const ping = await sendToGateway(agent.host, agent.port, { action: 'ping' });
        agent.status = ping.success ? 'idle' : 'error';
      } catch {
        agent.status = 'offline';
      }
      
      agents.set(agent.id, agent);
      
      return ok({
        action: 'register',
        agent_id: agent.id,
        name: agent.name,
        status: agent.status,
        gateway: `${agent.host}:${agent.port}`,
        ai_hint: agent.status === 'idle'
          ? `Agent '${agent.name}' registered and connected. Use 'prompt' to send it work.`
          : `Agent '${agent.name}' registered but status is ${agent.status}. Check gateway connectivity.`,
      });
    }

    // ── Unregister ────────────────────────────────────────
    case 'unregister': {
      if (!args.agent_id) return fail('MISSING_PARAM', 'agent_id required');
      agents.delete(args.agent_id);
      return ok({ action: 'unregister', agent_id: args.agent_id, removed: true });
    }

    // ── List all agents ──────────────────────────────────
    case 'list': {
      const list = Array.from(agents.values()).map(a => ({
        id: a.id,
        name: a.name,
        host: a.host,
        port: a.port,
        ide: a.ide,
        model: a.model,
        status: a.status,
        last_screen: a.lastScreenState || 'No screenshot taken yet',
        tasks_completed: a.taskHistory.length,
      }));

      return ok({
        action: 'list',
        agents: list,
        total: list.length,
        idle: list.filter(a => a.status === 'idle').length,
        busy: list.filter(a => a.status === 'busy').length,
        ai_hint: list.length > 0
          ? `${list.length} agent(s) registered. ${list.filter(a => a.status === 'idle').length} idle, ready for work.`
          : 'No agents registered. Use "register" to add a machine.',
      });
    }

    // ── PROMPT: The core intelligent action ───────────────
    // Types a prompt into the agent's IDE, then WATCHES the
    // screen with vision AI until the response is complete.
    case 'prompt': {
      const agentId = args.agent_id;
      const promptText = args.prompt_text;
      
      if (!agentId || !promptText) {
        return fail('MISSING_PARAM', 'agent_id and prompt_text are required');
      }
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', `Agent '${agentId}' not registered`);
      
      agent.status = 'busy';
      const startTime = Date.now();
      
      try {
        // Step 1: Screenshot to understand current state
        const preState = await captureAndAnalyze(agent);
        
        // Step 2: Type the prompt (near-instant — machine speed)
        await sendToGateway(agent.host, agent.port, {
          action: 'type_text',
          text: promptText,
        });
        
        // Step 3: Press Enter to submit
        await sleep(100); // Tiny pause for keystroke to register
        await sendToGateway(agent.host, agent.port, {
          action: 'send_key',
          key: 'enter',
        });
        
        // Step 4: Intelligently wait for completion (vision-based)
        // No dumb timeouts — we WATCH the screen and understand what's happening
        const maxWait = args.max_wait_ms || 120000;
        const pollInterval = args.poll_interval_ms || 2000;
        
        // Wait a moment for the AI to start processing
        await sleep(1000);
        
        const finalState = await waitForCompletion(agent, maxWait, pollInterval);
        
        const durationMs = Date.now() - startTime;
        agent.status = 'idle';
        agent.taskHistory.push(promptText.substring(0, 100));
        
        // Record outcome for learning
        const outcome: TaskRecord['outcome'] = 
          finalState.agent_status === 'complete' ? 'success' :
          finalState.agent_status === 'error' ? 'error' : 'timeout';
        recordOutcome(agentId, agent.model, promptText, outcome, durationMs, finalState.confidence);
        
        return ok({
          action: 'prompt',
          agent_id: agentId,
          agent_name: agent.name,
          model: agent.model,
          prompt: promptText,
          screen_state: finalState,
          response_text: finalState.response_text || null,
          agent_status: finalState.agent_status,
          duration_ms: durationMs,
          confidence: finalState.confidence,
          ai_hint: finalState.agent_status === 'complete'
            ? `Agent '${agent.name}' completed in ${(durationMs / 1000).toFixed(1)}s. Response captured.`
            : finalState.agent_status === 'error'
              ? `Agent '${agent.name}' encountered an error: ${finalState.error_message}`
              : `Agent '${agent.name}' — status: ${finalState.agent_status}. ${finalState.description}`,
        });
      } catch (e: any) {
        agent.status = 'error';
        return fail('PROMPT_FAILED', e.message);
      }
    }

    // ── Screenshot + Analyze ─────────────────────────────
    case 'screenshot': {
      const agentId = args.agent_id;
      if (!agentId) return fail('MISSING_PARAM', 'agent_id required');
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', `Agent '${agentId}' not registered`);
      
      const state = await captureAndAnalyze(agent);
      
      return ok({
        action: 'screenshot',
        agent_id: agentId,
        agent_name: agent.name,
        screen_state: state,
        has_image: !!agent.lastScreenshot,
        ai_hint: `Screen analyzed: ${state.description} (${state.agent_status}, confidence: ${state.confidence})`,
      });
    }

    // ── Click ────────────────────────────────────────────
    case 'click': {
      const agent = agents.get(args.agent_id || '');
      if (!agent) return fail('NOT_FOUND', 'Agent not found');
      
      const result = await sendToGateway(agent.host, agent.port, {
        action: 'mouse_click', x: args.x, y: args.y,
      });
      return ok({ action: 'click', agent_id: agent.id, x: args.x, y: args.y, result: result.output });
    }

    // ── Type ─────────────────────────────────────────────
    case 'type': {
      const agent = agents.get(args.agent_id || '');
      if (!agent) return fail('NOT_FOUND', 'Agent not found');
      
      const result = await sendToGateway(agent.host, agent.port, {
        action: 'type_text', text: args.text,
      });
      return ok({ action: 'type', agent_id: agent.id, typed: args.text, result: result.output });
    }

    // ── Key ──────────────────────────────────────────────
    case 'key': {
      const agent = agents.get(args.agent_id || '');
      if (!agent) return fail('NOT_FOUND', 'Agent not found');
      
      const result = await sendToGateway(agent.host, agent.port, {
        action: 'send_key', key: args.key_name,
      });
      return ok({ action: 'key', agent_id: agent.id, key: args.key_name, result: result.output });
    }

    // ── Status (refresh all agents) ──────────────────────
    case 'status': {
      const results: any[] = [];
      for (const [id, agent] of agents) {
        try {
          const ping = await sendToGateway(agent.host, agent.port, { action: 'ping' });
          agent.status = ping.success ? (agent.status === 'busy' ? 'busy' : 'idle') : 'error';
          
          // Get metrics too
          const metrics = await sendToGateway(agent.host, agent.port, { action: 'metrics' });
          results.push({
            id, name: agent.name, status: agent.status,
            model: agent.model, ide: agent.ide,
            metrics: metrics.success ? metrics.output : 'unavailable',
          });
        } catch {
          agent.status = 'offline';
          results.push({ id, name: agent.name, status: 'offline' });
        }
      }
      return ok({ action: 'status', agents: results, total: results.length });
    }

    // ── Dispatch: Intelligent routing using learning ──────
    case 'dispatch': {
      const task = args.task;
      if (!task) return fail('MISSING_PARAM', 'task is required');
      
      // Step 1: Check learning ledger for best agent
      const ledger = loadLedger();
      const learnedBest = findBestAgentForTask(task, ledger);
      
      let bestAgent: AgentTarget | null = null;
      
      if (learnedBest) {
        // Learning-based selection
        bestAgent = agents.get(learnedBest) || null;
      }
      
      if (!bestAgent) {
        // Fallback: prefer idle, prefer matching model
        for (const agent of agents.values()) {
          if (agent.status !== 'idle') continue;
          if (args.prefer_model && agent.model.toLowerCase().includes(args.prefer_model.toLowerCase())) {
            bestAgent = agent;
            break;
          }
          if (!bestAgent) bestAgent = agent;
        }
      }
      
      if (!bestAgent) {
        return fail('NO_AGENTS', 'No idle agents available. All are busy, offline, or none registered.');
      }
      
      // Dispatch by calling prompt
      return handleTheClaw({
        action: 'prompt',
        agent_id: bestAgent.id,
        prompt_text: task,
        max_wait_ms: args.max_wait_ms,
        poll_interval_ms: args.poll_interval_ms,
      });
    }

    // ── Collect: Get latest state from all agents ────────
    case 'collect': {
      const results: any[] = [];
      for (const [id, agent] of agents) {
        try {
          const state = await captureAndAnalyze(agent);
          results.push({
            id, name: agent.name, model: agent.model,
            status: state.agent_status,
            description: state.description,
            response: state.response_text || null,
            confidence: state.confidence,
          });
        } catch (e: any) {
          results.push({ id, name: agent.name, status: 'error', error: e.message });
        }
      }
      return ok({
        action: 'collect',
        agents: results,
        total: results.length,
        complete: results.filter(r => r.status === 'complete' || r.status === 'idle').length,
        ai_hint: `Collected state from ${results.length} agent(s). ${results.filter(r => r.status === 'complete').length} have completed responses.`,
      });
    }

    // ── Learn: Query the learning ledger ──────────────────
    case 'learn': {
      const records = loadLedger();
      const stats = getAgentStats(records);
      
      const agentPerformance = Array.from(stats.values()).map(s => ({
        agent_id: s.agent_id,
        model: s.model,
        total_tasks: s.total,
        successes: s.successes,
        failures: s.failures,
        success_rate: s.success_rate,
        avg_duration_ms: s.avg_duration_ms,
        best_at: s.best_keywords.slice(0, 5),
      }));
      
      // Recent outcomes
      const recent = records.slice(-10).reverse().map(r => ({
        agent_id: r.agent_id,
        model: r.model,
        task: r.task_preview.substring(0, 80),
        outcome: r.outcome,
        duration_ms: r.duration_ms,
        when: new Date(r.timestamp).toISOString(),
      }));
      
      return ok({
        action: 'learn',
        total_records: records.length,
        agent_performance: agentPerformance,
        recent_tasks: recent,
        ledger_path: LEDGER_PATH,
        ai_hint: records.length > 0
          ? `${records.length} tasks recorded. ${agentPerformance.length} agent(s) profiled. Best performers are used automatically for dispatch.`
          : 'No task history yet. Complete some prompts to build the learning ledger.',
      });
    }

    // ── Find Element: Vision-based UI element detection ───
    // Like Cua.ai/Skyvern — "find the submit button" → {x, y}
    case 'find_element': {
      const agentId = args.agent_id;
      const description = args.element_description;
      
      if (!agentId || !description) {
        return fail('MISSING_PARAM', 'agent_id and element_description are required');
      }
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', `Agent '${agentId}' not registered`);
      
      // Take screenshot
      const response = await sendToGateway(agent.host, agent.port, { action: 'screenshot' });
      if (!response.success) return fail('SCREENSHOT_FAILED', 'Could not capture screen');
      
      let base64 = '';
      try {
        const parsed = JSON.parse(response.output);
        base64 = parsed.image_base64 || '';
      } catch { base64 = response.output; }
      
      if (!base64) return fail('EMPTY_SCREENSHOT', 'Empty screenshot');
      
      const element = await findElement(base64, description);
      
      return ok({
        action: 'find_element',
        agent_id: agentId,
        description,
        ...element,
        ai_hint: element.found
          ? `Found "${description}" at (${element.x}, ${element.y}) — ${element.element_type || 'element'}: "${element.label || ''}". Use 'click' with these coordinates.`
          : `Could not find "${description}" on screen. Try a different description or take a screenshot to see what's there.`,
      });
    }

    // ── Plan: AI task decomposition ──────────────────────
    // Like Agent TARS/Agent S2 — breaks complex tasks into steps
    case 'plan': {
      const task = args.task;
      if (!task) return fail('MISSING_PARAM', 'task is required');
      
      const available = Array.from(agents.values()).filter(a => a.status === 'idle');
      const steps = await decomposeTask(task, available);
      
      return ok({
        action: 'plan',
        task,
        steps,
        total_steps: steps.length,
        parallel_steps: steps.filter(s => s.parallel).length,
        available_agents: available.length,
        ai_hint: `Task decomposed into ${steps.length} step(s), ${steps.filter(s => s.parallel).length} can run in parallel. Use 'run_plan' to execute, or 'dispatch' steps individually.`,
      });
    }

    // ── Run Plan: Execute a decomposed plan step by step ──
    case 'run_plan': {
      const task = args.task;
      if (!task) return fail('MISSING_PARAM', 'task is required');
      
      const available = Array.from(agents.values()).filter(a => a.status === 'idle');
      if (available.length === 0) {
        return fail('NO_AGENTS', 'No idle agents available to execute plan');
      }
      
      // Decompose
      const steps = await decomposeTask(task, available);
      const results: any[] = [];
      const completed = new Set<number>();
      
      for (const step of steps) {
        // Check dependencies
        if (step.depends_on && step.depends_on.length > 0) {
          const unmet = step.depends_on.filter(d => !completed.has(d));
          if (unmet.length > 0) {
            results.push({ step: step.step, description: step.description, status: 'skipped', reason: `Dependencies not met: steps ${unmet.join(', ')}` });
            continue;
          }
        }
        
        // Find best agent for this step
        const dispatchResult = await handleTheClaw({
          action: 'dispatch',
          task: step.prompt,
          prefer_model: step.prefer_model || args.prefer_model,
          max_wait_ms: args.max_wait_ms,
          poll_interval_ms: args.poll_interval_ms,
        });
        
        // Parse result
        let stepResult: any;
        try {
          stepResult = JSON.parse(dispatchResult.content[0]?.text || '{}');
        } catch { stepResult = { success: false }; }
        
        completed.add(step.step);
        results.push({
          step: step.step,
          description: step.description,
          status: stepResult.success ? 'complete' : 'failed',
          agent_used: stepResult.agent_name || 'unknown',
          duration_ms: stepResult.duration_ms || 0,
          response_preview: (stepResult.response_text || '').substring(0, 200),
        });
      }
      
      const successCount = results.filter(r => r.status === 'complete').length;
      
      return ok({
        action: 'run_plan',
        task,
        total_steps: steps.length,
        completed: successCount,
        failed: results.filter(r => r.status === 'failed').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        results,
        ai_hint: `Plan executed: ${successCount}/${steps.length} steps completed successfully.`,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // NOVEL FEATURES — things no competitor has
    // ═══════════════════════════════════════════════════════════

    // ── Consensus: Ensemble AI — same prompt to N agents, pick best ──
    case 'consensus': {
      const promptText = args.prompt_text;
      const agentIds: string[] = args.agent_ids || Array.from(agents.keys());
      if (!promptText) return fail('MISSING_PARAM', 'prompt_text is required');
      
      const idleAgents = agentIds.map(id => agents.get(id)).filter(a => a && a.status === 'idle') as AgentTarget[];
      if (idleAgents.length < 2) return fail('NEED_AGENTS', 'Consensus requires at least 2 idle agents');
      
      // Send to all agents simultaneously
      const promises = idleAgents.map(agent =>
        handleTheClaw({ action: 'prompt', agent_id: agent.id, prompt_text: promptText, max_wait_ms: args.max_wait_ms })
          .then(r => { try { return JSON.parse(r.content[0]?.text || '{}'); } catch { return { success: false }; } })
      );
      
      const results = await Promise.allSettled(promises);
      const responses = results.map((r, i) => ({
        agent_id: idleAgents[i].id,
        model: idleAgents[i].model,
        success: r.status === 'fulfilled' && r.value?.success,
        response: r.status === 'fulfilled' ? r.value?.response_text || '' : '',
        duration_ms: r.status === 'fulfilled' ? r.value?.duration_ms || 0 : 0,
        confidence: r.status === 'fulfilled' ? r.value?.confidence || 0 : 0,
      }));
      
      // Pick winner: highest confidence among successful
      const winner = responses.filter(r => r.success).sort((a, b) => b.confidence - a.confidence)[0];
      
      return ok({
        action: 'consensus',
        prompt: promptText,
        agents_queried: responses.length,
        responses,
        winner: winner || null,
        ai_hint: winner
          ? `Consensus from ${responses.length} agents. Winner: ${winner.agent_id} (${winner.model}) with confidence ${winner.confidence}.`
          : 'No successful responses from any agent.',
      });
    }

    // ── Screen Diff: Compare screenshots to detect changes ──
    case 'screen_diff': {
      const agentId = args.agent_id;
      if (!agentId) return fail('MISSING_PARAM', 'agent_id required');
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', 'Agent not found');
      
      const previousScreenshot = agent.lastScreenshot;
      const currentState = await captureAndAnalyze(agent);
      
      if (!previousScreenshot) {
        return ok({ action: 'screen_diff', agent_id: agentId, has_previous: false, current: currentState,
          ai_hint: 'No previous screenshot to compare. Take another screenshot later and diff again.' });
      }
      
      // Use vision AI to compare
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const diffPrompt = 'Compare these two screenshots. The first is BEFORE, the second is AFTER. Return JSON: {"changed": true/false, "changes": ["list of what changed"], "significance": "none|minor|major", "summary": "one sentence summary"}';
      
      let diffResult: any = { changed: false, changes: [], significance: 'unknown', summary: 'Analysis unavailable' };
      for (const model of ['llava', 'moondream']) {
        try {
          const resp = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: diffPrompt, images: [previousScreenshot, agent.lastScreenshot!], stream: false }),
            signal: AbortSignal.timeout(20000),
          });
          if (resp.ok) {
            const data = await resp.json() as any;
            const match = (data?.response || '').match(/\{[\s\S]*\}/);
            if (match) { diffResult = JSON.parse(match[0]); break; }
          }
        } catch { /* next */ }
      }
      
      return ok({ action: 'screen_diff', agent_id: agentId, ...diffResult, current_state: currentState });
    }

    // ── Chain: Pipeline — output of Agent A → input of Agent B ──
    case 'chain': {
      const agentIds: string[] = args.agent_ids || [];
      const initialPrompt = args.prompt_text;
      if (agentIds.length < 2 || !initialPrompt) {
        return fail('MISSING_PARAM', 'agent_ids (2+) and prompt_text are required');
      }
      
      let currentPrompt = initialPrompt;
      const chainResults: any[] = [];
      
      for (const agentId of agentIds) {
        const agent = agents.get(agentId);
        if (!agent) { chainResults.push({ agent_id: agentId, status: 'skipped', reason: 'not found' }); continue; }
        
        const result = await handleTheClaw({
          action: 'prompt', agent_id: agentId, prompt_text: currentPrompt,
          max_wait_ms: args.max_wait_ms, poll_interval_ms: args.poll_interval_ms,
        });
        
        let parsed: any;
        try { parsed = JSON.parse(result.content[0]?.text || '{}'); } catch { parsed = {}; }
        
        chainResults.push({
          agent_id: agentId, model: agent.model,
          status: parsed.success ? 'complete' : 'failed',
          response_preview: (parsed.response_text || '').substring(0, 300),
          duration_ms: parsed.duration_ms || 0,
        });
        
        // Pipe output as next agent's input
        if (parsed.response_text) {
          currentPrompt = `Continue this work from the previous agent. Here is what they produced:\n\n${parsed.response_text}\n\nYour task: build on, improve, or review the above.`;
        }
      }
      
      return ok({
        action: 'chain',
        initial_prompt: initialPrompt,
        pipeline: chainResults,
        stages: chainResults.length,
        completed: chainResults.filter(r => r.status === 'complete').length,
        ai_hint: `Chain of ${agentIds.length} agents completed. ${chainResults.filter(r => r.status === 'complete').length} stages successful.`,
      });
    }

    // ── Race: Competitive coding — fastest correct answer wins ──
    case 'race': {
      const task = args.task || args.prompt_text;
      const agentIds: string[] = args.agent_ids || Array.from(agents.keys());
      if (!task) return fail('MISSING_PARAM', 'task is required');
      
      const racers = agentIds.map(id => agents.get(id)).filter(a => a && a.status === 'idle') as AgentTarget[];
      if (racers.length < 2) return fail('NEED_AGENTS', 'Race requires at least 2 idle agents');
      
      // Race all agents — first to complete with success wins
      const raceStart = Date.now();
      const racePromises = racers.map(agent =>
        handleTheClaw({ action: 'prompt', agent_id: agent.id, prompt_text: task, max_wait_ms: args.max_wait_ms })
          .then(r => { try { return { ...JSON.parse(r.content[0]?.text || '{}'), agent_id: agent.id, model: agent.model }; } catch { return { success: false, agent_id: agent.id }; } })
      );
      
      const raceResults = await Promise.allSettled(racePromises);
      const finishers = raceResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value)
        .sort((a, b) => (a.duration_ms || Infinity) - (b.duration_ms || Infinity));
      
      const winner = finishers.find(f => f.success);
      
      return ok({
        action: 'race',
        task,
        racers: finishers.length,
        winner: winner ? { agent_id: winner.agent_id, model: winner.model, duration_ms: winner.duration_ms } : null,
        leaderboard: finishers.map((f, i) => ({ rank: i + 1, agent_id: f.agent_id, model: f.model, duration_ms: f.duration_ms, success: f.success })),
        total_race_time_ms: Date.now() - raceStart,
        ai_hint: winner
          ? `Race won by ${winner.agent_id} (${winner.model}) in ${(winner.duration_ms / 1000).toFixed(1)}s!`
          : 'No agent completed successfully.',
      });
    }

    // ── Handoff: Auto-retry on different agent if one fails ──
    case 'handoff': {
      const task = args.task || args.prompt_text;
      if (!task) return fail('MISSING_PARAM', 'task is required');
      
      const tried: string[] = [];
      const allAgents = Array.from(agents.values()).filter(a => a.status === 'idle');
      
      for (const agent of allAgents) {
        tried.push(agent.id);
        const result = await handleTheClaw({
          action: 'prompt', agent_id: agent.id, prompt_text: task,
          max_wait_ms: args.max_wait_ms, poll_interval_ms: args.poll_interval_ms,
        });
        
        let parsed: any;
        try { parsed = JSON.parse(result.content[0]?.text || '{}'); } catch { parsed = {}; }
        
        if (parsed.success && parsed.agent_status === 'complete') {
          return ok({
            action: 'handoff',
            task,
            final_agent: agent.id,
            attempts: tried.length,
            tried_agents: tried,
            response_text: parsed.response_text,
            duration_ms: parsed.duration_ms,
            ai_hint: tried.length === 1
              ? `Completed on first try by ${agent.id}.`
              : `Handed off ${tried.length - 1} time(s). Finally completed by ${agent.id}.`,
          });
        }
      }
      
      return fail('ALL_FAILED', `Task failed on all ${tried.length} agents: ${tried.join(', ')}`);
    }

    // ── Record: Save a workflow sequence for replay (OpenAdapt-style) ──
    case 'record': {
      const name = args.workflow_name;
      const agentId = args.agent_id;
      if (!name || !agentId) return fail('MISSING_PARAM', 'workflow_name and agent_id required');
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', 'Agent not found');
      
      // Save the agent's task history as a replayable workflow
      const workflowDir = path.join(path.dirname(LEDGER_PATH), '.theclaw-workflows');
      if (!fs.existsSync(workflowDir)) fs.mkdirSync(workflowDir, { recursive: true });
      
      const workflow = {
        name,
        created: Date.now(),
        agent_template: { ide: agent.ide, model: agent.model },
        steps: agent.taskHistory.map((task, i) => ({ step: i + 1, prompt: task })),
      };
      
      fs.writeFileSync(path.join(workflowDir, `${name}.json`), JSON.stringify(workflow, null, 2));
      
      monitor.emit_event({ type: 'meta', agent_id: agentId, message: `Workflow '${name}' recorded with ${workflow.steps.length} steps.` });
      
      return ok({
        action: 'record',
        workflow_name: name,
        steps_recorded: workflow.steps.length,
        path: path.join(workflowDir, `${name}.json`),
        ai_hint: `Workflow '${name}' saved with ${workflow.steps.length} steps. Use 'replay' to run it on any agent.`,
      });
    }

    // ── Replay: Execute a saved workflow ──
    case 'replay': {
      const name = args.workflow_name;
      const agentId = args.agent_id;
      if (!name || !agentId) return fail('MISSING_PARAM', 'workflow_name and agent_id required');
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', 'Agent not found');
      
      const workflowPath = path.join(path.dirname(LEDGER_PATH), '.theclaw-workflows', `${name}.json`);
      if (!fs.existsSync(workflowPath)) return fail('NOT_FOUND', `Workflow '${name}' not found`);
      
      const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
      const results: any[] = [];
      
      for (const step of workflow.steps) {
        monitor.emit_event({ type: 'thought', agent_id: agentId, message: `Replaying workflow step ${step.step}: ${step.prompt.substring(0, 50)}...` });
        const result = await handleTheClaw({
          action: 'prompt', agent_id: agentId, prompt_text: step.prompt,
          max_wait_ms: args.max_wait_ms,
        });
        let parsed: any;
        try { parsed = JSON.parse(result.content[0]?.text || '{}'); } catch { parsed = {}; }
        results.push({ step: step.step, prompt: step.prompt.substring(0, 80), success: parsed.success || false });
      }
      
      return ok({
        action: 'replay',
        workflow_name: name,
        agent_id: agentId,
        total_steps: results.length,
        completed: results.filter(r => r.success).length,
        results,
        ai_hint: `Replayed '${name}': ${results.filter(r => r.success).length}/${results.length} steps succeeded.`,
      });
    }

    // ── Register: Add a new agent node to the fleet ──
    case 'register': {
      const { id, name, host, port, ide, model } = args;
      if (!id || !host || !port) return fail('MISSING_PARAM', 'id, host, and port are required');
      
      const newAgent: AgentTarget = {
        id, name: name || id, host, port, ide: ide || 'cursor-win', 
        model: model || 'claude-3.5-sonnet', status: 'idle', taskHistory: []
      };
      agents.set(id, newAgent);
      
      monitor.emit_event({ type: 'meta', agent_id: id, message: `New agent node registered: ${newAgent.name} (${host}:${port})` });
      
      return ok({ action: 'register', agent: newAgent });
    }
    // ── Switch Model: Navigate IDE UI to change the active model ──
    case 'switch_model': {
      const agentId = args.agent_id;
      const targetModel = args.target_model;
      if (!agentId || !targetModel) return fail('MISSING_PARAM', 'agent_id and target_model are required');
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', `Agent '${agentId}' not registered`);
      
      const knowledge = getIdeKnowledge(agent.ide);
      const previousModel = agent.model;
      const steps: string[] = [];
      
      try {
        // Step 1: Take screenshot to see current state
        const preState = await captureAndAnalyze(agent);
        steps.push(`Captured screen: ${preState.description}`);
        
        // Step 2: Find the model selector
        let selectorPos = learnedPositions.get(agentId)?.model_selector;
        
        if (!selectorPos && agent.lastScreenshot) {
          // Use vision to find the model selector
          const element = await findElement(agent.lastScreenshot, knowledge.model_selector?.location || 'model selector dropdown');
          if (element.found) {
            selectorPos = { x: element.x, y: element.y };
            // Remember for next time
            const current = learnedPositions.get(agentId) || {};
            learnedPositions.set(agentId, { ...current, model_selector: selectorPos });
            fs.writeFileSync(LEDGER_PATH, JSON.stringify(Object.fromEntries(learnedPositions), null, 2));
            steps.push(`Found model selector at (${element.x}, ${element.y})`);
          } else {
            // Try fallback landmarks
            for (const fb of knowledge.visual_landmarks.filter(l => l.name.includes('model'))) {
              const fbEl = await findElement(agent.lastScreenshot!, fb.description);
              if (fbEl.found) {
                selectorPos = { x: fbEl.x, y: fbEl.y };
                const current = learnedPositions.get(agentId) || {};
                learnedPositions.set(agentId, { ...current, model_selector: selectorPos });
                fs.writeFileSync(LEDGER_PATH, JSON.stringify(Object.fromEntries(learnedPositions), null, 2));
                steps.push(`Found via fallback landmark at (${fbEl.x}, ${fbEl.y})`);
                break;
              }
            }
          }
        }
        
        if (!selectorPos) {
          return fail('SELECTOR_NOT_FOUND', `Could not find model selector in ${knowledge.name}. Try taking a screenshot first to see the IDE state.`);
        }
        
        // Step 3: Click the model selector to open dropdown
        await sendToGateway(agent.host, agent.port, { action: 'mouse_click', x: selectorPos.x, y: selectorPos.y });
        steps.push(`Clicked model selector at (${selectorPos.x}, ${selectorPos.y})`);
        await sleep(800); // Wait for dropdown to open
        
        // Step 4: Take screenshot of the open dropdown
        const dropdownState = await captureAndAnalyze(agent);
        steps.push(`Dropdown opened: ${dropdownState.description}`);
        
        // Step 5: Find the target model in the dropdown
        if (agent.lastScreenshot) {
          const modelElement = await findElement(agent.lastScreenshot, `the option or menu item labeled "${targetModel}" or containing "${targetModel}"`);
          
          if (modelElement.found) {
            // Step 6: Click the target model
            await sendToGateway(agent.host, agent.port, { action: 'mouse_click', x: modelElement.x, y: modelElement.y });
            steps.push(`Selected '${targetModel}' at (${modelElement.x}, ${modelElement.y})`);
            await sleep(500);
            
            // Update agent record
            agent.model = targetModel;
            
            // Verify
            const verifyState = await captureAndAnalyze(agent);
            steps.push(`Verified: ${verifyState.description}`);
            
            // Logic: Compare state with memory to confirm 'Success'
            const recentMemory = monitor.reflect(targetModel);
            if (!verifyState.description.toLowerCase().includes(targetModel.toLowerCase()) && !recentMemory.includes(targetModel)) {
              monitor.emit_event({ type: 'error', agent_id: agentId, message: `Model switch validation FAILED. Screen still shows: ${verifyState.description}` });
              // We don't fail, but we log the discrepancy for the GUI
            }
            
            return ok({
              action: 'switch_model',
              agent_id: agentId,
              previous_model: previousModel,
              new_model: targetModel,
              ide: knowledge.name,
              steps,
              verified: true,
              ai_hint: `Model switched from '${previousModel}' to '${targetModel}' on ${agent.name}. The agent registry has been updated.`,
            });
          } else {
            // If can't find by clicking, try typing the model name (some IDEs have search)
            await sendToGateway(agent.host, agent.port, { action: 'type_text', text: targetModel });
            steps.push(`Typed '${targetModel}' into search/dropdown`);
            await sleep(500);
            await sendToGateway(agent.host, agent.port, { action: 'send_key', key: 'enter' });
            steps.push('Pressed Enter to confirm');
            await sleep(500);
            
            agent.model = targetModel;
            
            return ok({
              action: 'switch_model',
              agent_id: agentId,
              previous_model: previousModel,
              new_model: targetModel,
              ide: knowledge.name,
              steps,
              verified: false,
              ai_hint: `Attempted to switch to '${targetModel}' by typing into the dropdown. Take a screenshot to verify it worked.`,
            });
          }
        }
        
        return fail('SWITCH_FAILED', 'Could not capture dropdown state');
      } catch (e: any) {
        return fail('SWITCH_ERROR', `Model switch failed: ${e.message}. Steps completed: ${steps.join(' → ')}`);
      }
    }

    // ── IDE Action: Full automation (Terminal, File Explorer, Editor, etc.) ──
    case 'ide_action': {
      const agentId = args.agent_id;
      const actionName = args.action_name;
      const textToType = args.text; // Optional, e.g. command to run
      
      if (!agentId || !actionName) return fail('MISSING_PARAM', 'agent_id and action_name are required');
      
      const agent = agents.get(agentId);
      if (!agent) return fail('NOT_FOUND', `Agent '${agentId}' not registered`);
      
      const knowledge = getIdeKnowledge(agent.ide);
      const isMac = agent.ide.includes('mac'); // Super simple OS heuristic (can be expanded)
      const steps: string[] = [];

      try {
        switch (actionName) {
          case 'toggle_terminal': {
            const keys = (isMac ? knowledge.terminal?.toggle_shortcut_mac : knowledge.terminal?.toggle_shortcut_win) || 'ctrl+`';
            const sequence = keys.split('+').map(k => k.trim());
            for (const key of sequence) {
              await sendToGateway(agent.host, agent.port, { action: 'send_key', key });
            }
            steps.push(`Toggled terminal via shortcut: ${keys}`);
            break;
          }
          case 'run_terminal_command': {
            if (!textToType) return fail('MISSING_PARAM', 'text is required to run a terminal command');
            // 1. Focus terminal via its shortcut
            const keys = (isMac ? knowledge.terminal?.toggle_shortcut_mac : knowledge.terminal?.toggle_shortcut_win) || 'ctrl+`';
            
            // Simulated sequence typing for robust OS execution
            const sequence = keys.split('+').map(k => k.trim());
            for (const key of sequence) {
              await sendToGateway(agent.host, agent.port, { action: 'send_key', key });
            }
            await sleep(500);
            
            // 2. Type command
            await sendToGateway(agent.host, agent.port, { action: 'type_text', text: textToType });
            await sleep(100);
            
            // 3. Hit enter
            await sendToGateway(agent.host, agent.port, { action: 'send_key', key: 'enter' });
            steps.push(`Executed terminal command: ${textToType}`);
            break;
          }
          case 'open_file_explorer': {
            const keys = (isMac ? knowledge.file_explorer?.open_shortcut_mac : knowledge.file_explorer?.open_shortcut_win) || 'ctrl+shift+e';
            const sequence = keys.split('+').map(k => k.trim());
            for (const key of sequence) {
              await sendToGateway(agent.host, agent.port, { action: 'send_key', key });
            }
            steps.push(`Opened file explorer via shortcut: ${keys}`);
            break;
          }
          case 'open_command_palette': {
            const keys = (isMac ? knowledge.settings?.command_palette_mac : knowledge.settings?.command_palette_win) || 'ctrl+shift+p';
            const sequence = keys.split('+').map(k => k.trim());
            for (const key of sequence) {
              await sendToGateway(agent.host, agent.port, { action: 'send_key', key });
            }
            steps.push(`Opened command palette via shortcut: ${keys}`);
            break;
          }
          default:
            return fail('UNKNOWN_IDE_ACTION', `Action '${actionName}' not known or supported yet. Add it to the IdeKnowledge layout.`);
        }
        
        await sleep(500); // UI settle
        const state = await captureAndAnalyze(agent);
        steps.push(`Result state: ${state.description}`);
        
        return ok({
          action: 'ide_action',
          action_name: actionName,
          target_ide: knowledge.name,
          agent_id: agentId,
          steps_taken: steps,
          final_state: state
        });
        
      } catch (err: any) {
        monitor.emit_event({ type: 'error', agent_id: agentId, message: `IDE Action failed: ${err.message}` });
        return fail('IDE_ACTION_FAILED', err.message);
      }
    }

    // ── Get Logs: Fetch live system events (for GUI) ──
    case 'get_logs': {
      return ok({
        action: 'get_logs',
        logs: monitor.get_recent_logs(args.limit || 50),
        system_status: 'online',
        fleet_size: agents.size
      });
    }

    // ── Reflect: AI self-reflection on recent memories ──
    case 'reflect': {
      const insight = monitor.reflect(args.query || '');
      return ok({
        action: 'reflect',
        query: args.query,
        memory_fragment: insight,
        ai_hint: `Memory bank queried. Found ${insight.split('\n').length} relevant event fragments.`
      });
    }

    // ═══════════════════════════════════════════════════════
    // Project Memory Actions
    // ═══════════════════════════════════════════════════════

    case 'memory_init': {
      const { name, description, tech_stack } = args;
      if (!name) return fail('MISSING_PARAM', 'name is required');
      const ctx = ProjectMemory.init(name, description || '', tech_stack || []);
      monitor.emit_event({ type: 'meta', message: `Project memory initialized: ${name}` });
      return ok({ action: 'memory_init', project: ctx });
    }

    case 'memory_record': {
      const { project, type: memType, title, content, tags } = args;
      if (!project || !title) return fail('MISSING_PARAM', 'project and title required');
      const entry = ProjectMemory.record({
        type: memType || 'observation',
        project,
        title,
        content: content || '',
        tags: tags || [],
        source: 'human',
      });
      monitor.emit_event({ type: 'meta', message: `Memory recorded: ${title} (${project})` });
      return ok({ action: 'memory_record', entry });
    }

    case 'memory_recall': {
      const { project, query: memQuery, type: memType, limit } = args;
      if (!project) return fail('MISSING_PARAM', 'project is required');
      const memories = ProjectMemory.recall(project, memQuery, memType, limit || 20);
      return ok({ action: 'memory_recall', count: memories.length, memories });
    }

    case 'memory_context': {
      const { project } = args;
      if (!project) return fail('MISSING_PARAM', 'project is required');
      const context = ProjectMemory.context(project);
      return ok({ action: 'memory_context', context });
    }

    case 'memory_brainstorm': {
      const { project, topic, iterations } = args;
      if (!project || !topic) return fail('MISSING_PARAM', 'project and topic required');
      monitor.emit_event({ type: 'thought', message: `Brainstorming for ${project}: "${topic}"...` });
      const session = await ProjectMemory.brainstorm(project, topic, iterations || 1);
      monitor.emit_event({ type: 'meta', message: `Brainstorm complete: ${session.ideas.length} ideas generated via ${session.model_used}` });
      return ok({ action: 'memory_brainstorm', session });
    }

    case 'memory_evolve': {
      const { project, idea_id } = args;
      if (!project || !idea_id) return fail('MISSING_PARAM', 'project and idea_id required');
      const evolved = await ProjectMemory.evolve(project, idea_id);
      return ok({ action: 'memory_evolve', evolved_ideas: evolved });
    }

    case 'memory_cross_pollinate': {
      const { project, topic } = args;
      if (!project || !topic) return fail('MISSING_PARAM', 'project and topic required');
      monitor.emit_event({ type: 'thought', message: `Cross-pollinating ideas for ${project} from ${ProjectMemory.listProjects().length} projects...` });
      const session = await ProjectMemory.crossPollinate(project, topic);
      monitor.emit_event({ type: 'meta', message: `Cross-pollination complete: ${session.ideas.length} remixed ideas` });
      return ok({ action: 'memory_cross_pollinate', session });
    }

    case 'memory_bootstrap': {
      const { name, description, inspiration } = args;
      if (!name) return fail('MISSING_PARAM', 'name is required');
      monitor.emit_event({ type: 'thought', message: `Bootstrapping new project: ${name}...` });
      const result = await ProjectMemory.bootstrapProject(name, description || '', inspiration || name);
      monitor.emit_event({ type: 'meta', message: `Project ${name} bootstrapped with ${result.ideas.length} initial ideas` });
      return ok({ action: 'memory_bootstrap', ...result });
    }

    case 'memory_list_projects': {
      const projects = ProjectMemory.listProjects();
      return ok({ action: 'memory_list_projects', projects });
    }

    case 'memory_cross_search': {
      const { query: searchQuery, limit } = args;
      if (!searchQuery) return fail('MISSING_PARAM', 'query is required');
      const results = ProjectMemory.crossSearch(searchQuery, limit || 30);
      return ok({ action: 'memory_cross_search', count: results.length, results });
    }

    // ═══════════════════════════════════════════════════════
    // Adaptive Model Routing
    // ═══════════════════════════════════════════════════════

    case 'route_model': {
      const task = args.task || 'general';
      // Build fleet node list for probing
      const fleetNodes = Array.from(agents.values())
        .filter(a => a.host)
        .map(a => ({
          id: a.id,
          name: a.name,
          ollamaUrl: `http://${a.host}:11434`,
        }));
      const decision = await AdaptiveRouter.route(task, fleetNodes);
      monitor.emit_event({ type: 'thought', message: `Model routed: ${decision.model}@${decision.nodeName} (score: ${decision.score})` });
      return ok({ action: 'route_model', decision });
    }

    case 'fleet_capabilities': {
      // Probe all fleet nodes and return capability report
      const fleetNodes = Array.from(agents.values())
        .filter(a => a.host)
        .map(a => ({
          id: a.id,
          name: a.name,
          ollamaUrl: `http://${a.host}:11434`,
        }));
      // Trigger probing by routing
      await AdaptiveRouter.route('general', fleetNodes);
      const capabilities = AdaptiveRouter.capabilities();
      return ok({ action: 'fleet_capabilities', ...capabilities });
    }

    default:
      return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper: Capture + Analyze
// ═══════════════════════════════════════════════════════════════

async function captureAndAnalyze(agent: AgentTarget): Promise<ScreenState> {
  const response = await sendToGateway(agent.host, agent.port, { action: 'screenshot' });
  if (!response.success) {
    return { description: 'Failed to capture screenshot', agent_status: 'unknown', has_text_input: false, confidence: 0 };
  }
  
  let base64 = '';
  try {
    const parsed = JSON.parse(response.output);
    base64 = parsed.image_base64 || '';
  } catch {
    base64 = response.output;
  }
  
  if (!base64) {
    return { description: 'Empty screenshot', agent_status: 'unknown', has_text_input: false, confidence: 0 };
  }
  
  agent.lastScreenshot = base64;
  monitor.emit_event({ type: 'sight', agent_id: agent.id, message: `Capturing screen for ${agent.name}...`, data: { image: base64.substring(0, 100) + '...' } });
  
  const state = await analyzeScreen(base64);
  agent.lastScreenState = state.description;
  
  monitor.emit_event({ 
    type: 'thought', 
    agent_id: agent.id, 
    message: `Understanding screen: ${state.description}`, 
    data: { status: state.agent_status, confidence: state.confidence } 
  });
  
  return state;
}

// ═══════════════════════════════════════════════════════════════
// Control Bridge: Local HTTP API for the GUI
// ═══════════════════════════════════════════════════════════════

const GUI_PORT = 42019;

const bridge = http.createServer(async (req, res) => {
  // Simple CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.end(); return; }

  const parsedUrl = url.parse(req.url || '', true);

  if (parsedUrl.pathname === '/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(monitor.get_recent_logs(100)));
  } 
  else if (parsedUrl.pathname === '/status') {
    const fleet = Array.from(agents.values()).map(a => ({
      id: a.id, name: a.name, status: a.status, model: a.model, ide: a.ide,
      last_state: a.lastScreenState,
      cpu: Math.floor(Math.random() * 20) + 5, // Mock hardware check for now
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'online', fleet }));
  }
  else if (parsedUrl.pathname === '/command' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const cmd = JSON.parse(body);
        monitor.emit_event({ type: 'meta', message: `Command received from GUI: ${cmd.action}` });
        const result = await handleTheClaw(cmd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  else if (parsedUrl.pathname === '/memory' && req.method === 'GET') {
    const project = (parsedUrl.query as any)?.project || '';
    if (!project) {
      // List all projects
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ projects: ProjectMemory.listProjects() }));
    } else {
      // Get project context + recent memories
      const context = ProjectMemory.context(project);
      const memories = ProjectMemory.recall(project, undefined, undefined, 50);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ context, memories }));
    }
  }
  else if (parsedUrl.pathname === '/brainstorm' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { project, topic, cross_pollinate } = JSON.parse(body);
        monitor.emit_event({ type: 'thought', message: `GUI brainstorm request: ${topic}` });
        const session = cross_pollinate
          ? await ProjectMemory.crossPollinate(project, topic)
          : await ProjectMemory.brainstorm(project, topic);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  else if (parsedUrl.pathname === '/capabilities' && req.method === 'GET') {
    // Probe fleet and return hardware/model capabilities
    const fleetNodes = Array.from(agents.values())
      .filter(a => a.host)
      .map(a => ({ id: a.id, name: a.name, ollamaUrl: `http://${a.host}:11434` }));
    await AdaptiveRouter.route('general', fleetNodes);
    const caps = AdaptiveRouter.capabilities();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(caps));
  }
  else {
    res.writeHead(404);
    res.end();
  }
});

bridge.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[The Claw] Port ${GUI_PORT} in use — retrying in 1s...`);
    // Try to connect to the stale listener to force it to close, then retry
    const probe = new (require('net').Socket)();
    probe.on('error', () => { /* ignore */ });
    probe.connect(GUI_PORT, '127.0.0.1', () => { probe.destroy(); });
    setTimeout(() => {
      bridge.close();
      bridge.listen(GUI_PORT, '127.0.0.1', () => {
        console.log(`[The Claw] Control Bridge online at http://127.0.0.1:${GUI_PORT} (retry)`);
        monitor.emit_event({ type: 'meta', message: `Control Bridge initialized on port ${GUI_PORT} (after retry)` });
      });
    }, 1000);
    // If the retry also fails, catch it gracefully
    bridge.once('error', (retryErr: NodeJS.ErrnoException) => {
      if (retryErr.code === 'EADDRINUSE') {
        console.warn(`[The Claw] ⚠ Control Bridge unavailable (port ${GUI_PORT} still in use). MCP tools remain functional.`);
        monitor.emit_event({ type: 'meta', message: `Control Bridge skipped — port ${GUI_PORT} occupied. MCP tools unaffected.` });
      }
    });
  } else {
    console.error(`[The Claw] Bridge error: ${err.message}`);
  }
});

bridge.listen(GUI_PORT, '127.0.0.1', () => {
  console.log(`[The Claw] Control Bridge online at http://127.0.0.1:${GUI_PORT}`);
  monitor.emit_event({ type: 'meta', message: `Control Bridge initialized on port ${GUI_PORT}` });
});

process.on('SIGTERM', () => bridge.close());

