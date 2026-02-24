/**
 * VegaMCP — Swarm Agent Base Class
 * Abstract base for all swarm agents. Provides model routing,
 * Memory Graph access, heartbeat reporting, and task lifecycle.
 */

import type { AgentConfig, TaskPayload, TaskResult, ModelId } from './types.js';
import {
  updateAgentState,
  recordHeartbeat,
  recordMetric,
  sendMessage,
  getUnreadMessages,
  markMessageRead,
} from '../db/swarm-store.js';
import { searchEntities, createEntity, addObservation } from '../db/graph-store.js';

// ═══════════════════════════════════════════════
// MODEL ROUTER  
// ═══════════════════════════════════════════════

interface ModelRouterConfig {
  primary: ModelId;
  fallback: ModelId[];
}

async function queryModel(
  model: ModelId,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096,
  temperature: number = 0.2
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { content: '[Model unavailable — no API key configured]', tokensUsed: 0, model };
  }

  const isOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const url = isOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

  let apiModel: string = model;
  if (!isOpenRouter) {
    if (model === 'deepseek/deepseek-r1') apiModel = 'deepseek-reasoner';
    else if (model === 'deepseek/deepseek-chat') apiModel = 'deepseek-chat';
    else return { content: `[Model ${model} requires OpenRouter]`, tokensUsed: 0, model };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (isOpenRouter) {
    headers['HTTP-Referer'] = 'https://vegamcp.local';
    headers['X-Title'] = 'VegaMCP Swarm Agent';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

    return { content, tokensUsed, model };
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

// ═══════════════════════════════════════════════
// SWARM AGENT BASE CLASS
// ═══════════════════════════════════════════════

export abstract class SwarmAgent {
  readonly config: AgentConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    this.startTime = Date.now();
    updateAgentState(this.config.agentId, {
      status: 'idle',
      last_error: null,
    });
    this.startHeartbeat();
    console.error(`[Swarm] Agent ${this.config.agentName} started`);
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    updateAgentState(this.config.agentId, {
      status: 'terminated',
      current_task_id: null,
    });
    console.error(`[Swarm] Agent ${this.config.agentName} stopped`);
  }

  async pause(): Promise<void> {
    this.stopHeartbeat();
    updateAgentState(this.config.agentId, { status: 'paused' });
  }

  async resume(): Promise<void> {
    updateAgentState(this.config.agentId, { status: 'idle' });
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      recordHeartbeat(this.config.agentId);
      updateAgentState(this.config.agentId, { uptime_seconds: uptimeSeconds });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // --- Task Execution ---

  async executeTask(payload: TaskPayload): Promise<TaskResult> {
    const start = Date.now();

    updateAgentState(this.config.agentId, {
      status: 'processing',
      current_task_id: payload.taskId,
    });

    try {
      const result = await this.processTask(payload);
      const durationMs = Date.now() - start;

      // Record metrics
      recordMetric(this.config.agentId, 'task_latency_ms', durationMs);
      if (result.metrics?.tokensUsed) {
        recordMetric(this.config.agentId, 'llm_tokens_used', result.metrics.tokensUsed);
      }

      // Update state
      updateAgentState(this.config.agentId, {
        status: 'idle',
        current_task_id: null,
        tasks_completed: undefined, // Will be incremented in orchestrator
      });

      return { ...result, metrics: { ...result.metrics, durationMs } };
    } catch (err: any) {
      const durationMs = Date.now() - start;

      recordMetric(this.config.agentId, 'task_error', 1,
        JSON.stringify({ error: err.message, taskId: payload.taskId }));

      updateAgentState(this.config.agentId, {
        status: 'error',
        current_task_id: null,
        last_error: err.message,
      });

      return {
        success: false,
        output: {},
        error: { code: 'AGENT_ERROR', message: err.message },
        metrics: { durationMs },
      };
    }
  }

  // --- Abstract Method —- Every agent implements this ---

  abstract processTask(payload: TaskPayload): Promise<TaskResult>;

  // --- AI Thinking ---

  protected async think(
    prompt: string,
    context?: Record<string, any>,
    model?: ModelId
  ): Promise<{ content: string; tokensUsed: number }> {
    const useModel = model || this.config.modelPref as ModelId;

    // Build context-enriched prompt
    let enrichedPrompt = prompt;
    if (context) {
      const contextStr = Object.entries(context)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');
      enrichedPrompt = `--- CONTEXT ---\n${contextStr}\n--- END CONTEXT ---\n\n${prompt}`;
    }

    // Inject memory context
    const memoryContext = this.getMemoryContext(prompt);
    if (memoryContext.length > 0) {
      enrichedPrompt = `--- MEMORY CONTEXT ---\n${memoryContext.join('\n')}\n--- END MEMORY ---\n\n${enrichedPrompt}`;
    }

    const result = await queryModel(
      useModel,
      this.config.personality,
      enrichedPrompt
    );

    return { content: result.content, tokensUsed: result.tokensUsed };
  }

  protected getMemoryContext(query: string): string[] {
    try {
      const keywords = query.split(/\s+/).filter(w => w.length > 4).slice(0, 5).join(' ');
      if (!keywords) return [];
      const results = searchEntities(keywords, undefined, undefined, 5);
      return results.flatMap(entity =>
        entity.observations.map(obs => `• [${entity.name}]: ${obs}`)
      ).slice(0, 10);
    } catch {
      return [];
    }
  }

  // --- Memory Graph Access ---

  protected storeObservation(entityName: string, entityType: string, observation: string): void {
    try {
      const entity = createEntity(entityName, entityType, 'swarm-data', `agent:${this.config.agentId}`);
      if (entity) {
        addObservation(entity.id, observation);
      }
    } catch {
      // Non-critical — don't fail the task
    }
  }

  protected queryMemory(query: string, limit: number = 10) {
    return searchEntities(query, undefined, undefined, limit);
  }

  // --- Inter-Agent Communication ---

  protected sendMessageToAgent(
    recipient: string,
    messageType: 'request' | 'response' | 'alert' | 'observation' | 'coordination',
    content: Record<string, any>,
    priority: number = 2
  ): void {
    sendMessage({
      sender_agent: this.config.agentId,
      recipient,
      message_type: messageType,
      content: JSON.stringify(content),
      priority,
      expires_at: null,
    });
  }

  protected readMessages(): Array<{ id: string; from: string; type: string; content: any }> {
    const messages = getUnreadMessages(this.config.agentId);
    return messages.map(msg => {
      markMessageRead(msg.message_id);
      let content: any;
      try { content = JSON.parse(msg.content); } catch { content = msg.content; }
      return { id: msg.message_id, from: msg.sender_agent, type: msg.message_type, content };
    });
  }

  protected broadcast(
    content: Record<string, any>,
    messageType: 'alert' | 'observation' | 'coordination' = 'observation'
  ): void {
    sendMessage({
      sender_agent: this.config.agentId,
      recipient: 'broadcast',
      message_type: messageType,
      content: JSON.stringify(content),
      priority: 1,
      expires_at: null,
    });
  }
}
