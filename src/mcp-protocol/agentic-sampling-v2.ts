/**
 * VegaMCP — Agentic Sampling v2 (Server-Side Orchestration)
 * Extended MCP Sampling with multi-turn conversations, tool composition,
 * server-side agent loops, and budget tracking.
 */

import { requestSampling, isSamplingAvailable } from '../mcp-extensions.js';

export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentLoop {
  id: string;
  goal: string;
  messages: SamplingMessage[];
  steps: AgentStep[];
  status: 'running' | 'completed' | 'failed' | 'budget_exceeded';
  maxSteps: number;
  maxTokens: number;
  tokensUsed: number;
  createdAt: string;
}

export interface AgentStep {
  stepNum: number;
  type: 'think' | 'execute' | 'evaluate' | 'refine';
  input: string;
  output: string;
  tokensUsed: number;
  timestamp: string;
}

const agentLoops = new Map<string, AgentLoop>();

function genId(): string {
  return `loop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Multi-turn sampling — maintains message history for context
 */
export async function multiTurnSample(
  messages: SamplingMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  if (!isSamplingAvailable()) {
    return '[Sampling unavailable — falling back to echo mode]';
  }

  // Build multi-turn prompt
  const prompt = messages
    .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const result = await requestSampling(prompt, {
    maxTokens: options?.maxTokens || 1000,
    temperature: options?.temperature || 0.7,
  });

  return typeof result === 'string' ? result : JSON.stringify(result);
}

/**
 * Server-side agent loop: Plan → Execute → Evaluate → Refine
 * The server autonomously drives the LLM through multi-step reasoning.
 */
export async function runAgentLoop(
  goal: string,
  context: string = '',
  maxSteps: number = 5,
  maxTokenBudget: number = 10000,
  toolExecutor?: (toolName: string, args: any) => Promise<string>
): Promise<AgentLoop> {
  const loop: AgentLoop = {
    id: genId(),
    goal,
    messages: [],
    steps: [],
    status: 'running',
    maxSteps,
    maxTokens: maxTokenBudget,
    tokensUsed: 0,
    createdAt: new Date().toISOString(),
  };
  agentLoops.set(loop.id, loop);

  try {
    // Step 1: Plan
    const planPrompt = `You are an autonomous AI agent. Your goal is: "${goal}"

${context ? `Context:\n${context}\n\n` : ''}Available tools: search_graph, graph_rag, llm_router, code_analysis, web_search, hypothesis_gen

Create a step-by-step plan to achieve this goal. For each step, specify:
1. What to do
2. Which tool to use (if any)
3. What information is needed

Respond with a JSON array of steps: [{"action": "...", "tool": "...", "reasoning": "..."}]`;

    loop.messages.push({ role: 'user', content: planPrompt });
    const planResult = await multiTurnSample(loop.messages, { maxTokens: 1500 });
    loop.messages.push({ role: 'assistant', content: planResult });
    const planTokens = Math.ceil(planResult.length / 4);  // Approximate
    loop.tokensUsed += planTokens;

    loop.steps.push({
      stepNum: 1, type: 'think', input: goal,
      output: planResult, tokensUsed: planTokens, timestamp: new Date().toISOString(),
    });

    // Steps 2-N: Execute plan steps
    let stepNum = 2;
    while (stepNum <= maxSteps && loop.tokensUsed < maxTokenBudget) {
      // Evaluate progress
      loop.messages.push({
        role: 'user',
        content: `You've completed step ${stepNum - 1}. Evaluate your progress toward the goal: "${goal}"\n\nAre you done? If yes, summarize findings. If no, what's the next action?\n\nRespond with JSON: {"done": true/false, "summary": "...", "nextAction": "...", "confidence": 0-100}`,
      });

      const evalResult = await multiTurnSample(loop.messages, { maxTokens: 800 });
      loop.messages.push({ role: 'assistant', content: evalResult });
      const evalTokens = Math.ceil(evalResult.length / 4);
      loop.tokensUsed += evalTokens;

      loop.steps.push({
        stepNum, type: 'evaluate', input: `Evaluate step ${stepNum - 1}`,
        output: evalResult, tokensUsed: evalTokens, timestamp: new Date().toISOString(),
      });

      // Check if done
      try {
        const evalJson = JSON.parse(evalResult.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (evalJson.done) {
          loop.status = 'completed';
          break;
        }

        // Execute next action if tool executor provided
        if (toolExecutor && evalJson.nextAction) {
          try {
            const toolResult = await toolExecutor(evalJson.tool || 'search_graph', { query: evalJson.nextAction });
            loop.messages.push({ role: 'user', content: `Tool result:\n${toolResult}` });
            loop.steps.push({
              stepNum: stepNum + 0.5, type: 'execute', input: evalJson.nextAction,
              output: toolResult, tokensUsed: 0, timestamp: new Date().toISOString(),
            });
          } catch { /* Tool execution optional */ }
        }
      } catch {
        // JSON parse failed; continue anyway
      }

      stepNum++;
    }

    if (loop.tokensUsed >= maxTokenBudget) {
      loop.status = 'budget_exceeded';
    } else if (loop.status !== 'completed') {
      loop.status = 'completed';
    }

    // Final synthesis
    loop.messages.push({
      role: 'user',
      content: `Synthesize all your work into a final comprehensive answer for the goal: "${goal}"`,
    });
    const synthesis = await multiTurnSample(loop.messages, { maxTokens: 2000 });
    loop.messages.push({ role: 'assistant', content: synthesis });
    loop.tokensUsed += Math.ceil(synthesis.length / 4);

    loop.steps.push({
      stepNum: stepNum + 1, type: 'refine', input: 'Final synthesis',
      output: synthesis, tokensUsed: Math.ceil(synthesis.length / 4), timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    loop.status = 'failed';
    loop.steps.push({
      stepNum: loop.steps.length + 1, type: 'evaluate',
      input: 'Error', output: err.message, tokensUsed: 0, timestamp: new Date().toISOString(),
    });
  }

  return loop;
}

// ── Tool Schema & Handler ──

export const agenticSamplingSchema = {
  name: 'agentic_sampling_v2',
  description: 'Advanced server-side agent loops via MCP Sampling. Supports multi-turn conversations, autonomous Plan→Execute→Evaluate→Refine cycles, tool composition, and token budget tracking. The server drives the LLM through multi-step reasoning.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['run_loop', 'multi_turn', 'status', 'list'] },
      goal: { type: 'string', description: 'Goal for the agent loop (for run_loop)' },
      context: { type: 'string', description: 'Additional context' },
      messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } }, description: 'Message history (for multi_turn)' },
      max_steps: { type: 'number', description: 'Max reasoning steps (default: 5)' },
      max_tokens: { type: 'number', description: 'Token budget (default: 10000)' },
      loop_id: { type: 'string', description: 'Loop ID (for status)' },
    },
    required: ['action'],
  },
};

export async function handleAgenticSampling(args: any): Promise<any> {
  try {
    switch (args.action) {
      case 'run_loop': {
        if (!args.goal) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'goal required' }) }] };
        const loop = await runAgentLoop(args.goal, args.context, args.max_steps || 5, args.max_tokens || 10000);
        return { content: [{ type: 'text', text: JSON.stringify({
          success: true,
          loopId: loop.id,
          status: loop.status,
          stepsCompleted: loop.steps.length,
          tokensUsed: loop.tokensUsed,
          finalAnswer: loop.steps[loop.steps.length - 1]?.output,
        }) }] };
      }
      case 'multi_turn': {
        if (!args.messages?.length) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'messages required' }) }] };
        const result = await multiTurnSample(args.messages as SamplingMessage[], { maxTokens: args.max_tokens });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, response: result }) }] };
      }
      case 'status': {
        if (!args.loop_id) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'loop_id required' }) }] };
        const loop = agentLoops.get(args.loop_id);
        if (!loop) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Loop not found' }) }] };
        return { content: [{ type: 'text', text: JSON.stringify({
          success: true, id: loop.id, status: loop.status,
          steps: loop.steps.map(s => ({ step: s.stepNum, type: s.type, tokens: s.tokensUsed })),
          tokensUsed: loop.tokensUsed, maxTokens: loop.maxTokens,
        }) }] };
      }
      case 'list': {
        const all = Array.from(agentLoops.values());
        return { content: [{ type: 'text', text: JSON.stringify({
          success: true,
          loops: all.map(l => ({ id: l.id, goal: l.goal.slice(0, 80), status: l.status, steps: l.steps.length })),
        }) }] };
      }
      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${args.action}` }) }] };
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}
