/**
 * VegaMCP — A2A Protocol (Agent-to-Agent)
 * Google's A2A standard for inter-agent communication.
 * Enables VegaMCP agents to collaborate with external AI agents.
 */

import { requestSampling, isSamplingAvailable } from '../mcp-extensions.js';

// ── Agent Card (/.well-known/agent.json) ──

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: string[];
  skills: AgentSkill[];
  authentication: { type: string; required: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
  tags: string[];
}

export type A2ATaskStatus = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

export interface A2ATask {
  id: string;
  status: A2ATaskStatus;
  messages: A2AMessage[];
  artifacts: A2AArtifact[];
  createdAt: string;
  updatedAt: string;
}

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
  timestamp: string;
}

export interface A2APart {
  type: 'text' | 'data' | 'file';
  text?: string;
  data?: Record<string, any>;
  mimeType?: string;
  fileName?: string;
}

export interface A2AArtifact {
  name: string;
  description?: string;
  parts: A2APart[];
}

// In-memory task store
const a2aTasks = new Map<string, A2ATask>();
const externalAgents = new Map<string, AgentCard>();

function genTaskId(): string {
  return `a2a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate VegaMCP's Agent Card */
export function getAgentCard(): AgentCard {
  return {
    name: 'VegaMCP',
    description: 'AI-native MCP server providing memory, browser automation, swarm orchestration, research tools, GraphRAG, multi-LLM routing, and agentic RAG.',
    url: process.env.VEGAMCP_URL || 'http://localhost:3100',
    version: '5.0.0',
    capabilities: ['text', 'data', 'file', 'streaming'],
    skills: [
      { id: 'research', name: 'Research', description: 'Deep research using GraphRAG, web search, and knowledge graph', inputModes: ['text'], outputModes: ['text', 'data'], tags: ['research', 'rag', 'search'] },
      { id: 'memory', name: 'Memory Management', description: 'Knowledge graph entity/relation/observation management', inputModes: ['text', 'data'], outputModes: ['text', 'data'], tags: ['memory', 'knowledge', 'graph'] },
      { id: 'analysis', name: 'Code Analysis', description: 'Multi-language code analysis and security scanning', inputModes: ['text', 'file'], outputModes: ['text', 'data'], tags: ['code', 'analysis', 'security'] },
      { id: 'routing', name: 'LLM Routing', description: 'Intelligent multi-LLM model selection and routing', inputModes: ['text'], outputModes: ['text', 'data'], tags: ['llm', 'routing', 'ai'] },
      { id: 'orchestration', name: 'Swarm Orchestration', description: 'Multi-agent task orchestration and pipeline execution', inputModes: ['text', 'data'], outputModes: ['text', 'data'], tags: ['swarm', 'agents', 'orchestration'] },
    ],
    authentication: { type: 'bearer', required: false },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text', 'data'],
  };
}

/** Register an external agent for delegation */
export function registerExternalAgent(agentCard: AgentCard): void {
  externalAgents.set(agentCard.name, agentCard);
}

/** Discover external agents by capability */
export function discoverAgents(capability: string): AgentCard[] {
  const results: AgentCard[] = [];
  for (const agent of externalAgents.values()) {
    const hasSkill = agent.skills.some(s =>
      s.tags.includes(capability) || s.name.toLowerCase().includes(capability.toLowerCase())
    );
    if (hasSkill) results.push(agent);
  }
  return results;
}

/** Create an A2A task (received from external agent) */
export function createA2ATask(message: string, senderId?: string): A2ATask {
  const task: A2ATask = {
    id: genTaskId(),
    status: 'submitted',
    messages: [{
      role: 'user',
      parts: [{ type: 'text', text: message }],
      timestamp: new Date().toISOString(),
    }],
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  a2aTasks.set(task.id, task);
  return task;
}

/** Process an A2A task (execute using sampling/tools) */
export async function processA2ATask(taskId: string): Promise<A2ATask> {
  const task = a2aTasks.get(taskId);
  if (!task) throw new Error('Task not found');

  task.status = 'working';
  task.updatedAt = new Date().toISOString();

  try {
    // Extract the user's request
    const userMessages = task.messages.filter(m => m.role === 'user');
    const lastMessage = userMessages[userMessages.length - 1];
    const request = lastMessage?.parts.map(p => p.text || JSON.stringify(p.data)).join('\n') || '';

    // Use MCP Sampling to process (if available)
    let responseText = '';
    if (isSamplingAvailable()) {
      const result = await requestSampling(
        `You are VegaMCP, an AI agent processing a task from another agent via A2A protocol.\n\nTask: ${request}\n\nProvide a helpful response.`,
        { maxTokens: 2000 }
      );
      responseText = typeof result === 'string' ? result : JSON.stringify(result);
    } else {
      responseText = `Task received: "${request}". MCP Sampling unavailable — task recorded for manual processing.`;
    }

    // Add agent response
    task.messages.push({
      role: 'agent',
      parts: [{ type: 'text', text: responseText }],
      timestamp: new Date().toISOString(),
    });

    // Create artifact from response
    task.artifacts.push({
      name: 'response',
      description: 'Agent response to task',
      parts: [{ type: 'text', text: responseText }],
    });

    task.status = 'completed';
  } catch (err: any) {
    task.status = 'failed';
    task.messages.push({
      role: 'agent',
      parts: [{ type: 'text', text: `Error: ${err.message}` }],
      timestamp: new Date().toISOString(),
    });
  }

  task.updatedAt = new Date().toISOString();
  return task;
}

/** Send a task to an external agent (delegation) */
export async function delegateToAgent(agentUrl: string, message: string): Promise<any> {
  try {
    const response = await fetch(`${agentUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          message: { role: 'user', parts: [{ type: 'text', text: message }] },
        },
        id: genTaskId(),
      }),
      signal: AbortSignal.timeout(30000),
    });
    return await response.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

// ── Tool Schema & Handler ──

export const a2aProtocolSchema = {
  name: 'a2a_protocol',
  description: 'Agent-to-Agent (A2A) protocol for inter-agent communication. Create tasks, process requests, discover agents, delegate work, and serve VegaMCP\'s Agent Card.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['agent_card', 'create_task', 'process_task', 'task_status', 'delegate', 'discover', 'register_agent', 'list_agents'] },
      message: { type: 'string', description: 'Task message (for create_task/delegate)' },
      task_id: { type: 'string', description: 'Task ID (for process_task/task_status)' },
      agent_url: { type: 'string', description: 'Agent URL (for delegate)' },
      capability: { type: 'string', description: 'Capability to search for (for discover)' },
      agent_card: { type: 'object', description: 'Agent Card JSON (for register_agent)' },
    },
    required: ['action'],
  },
};

export async function handleA2AProtocol(args: any): Promise<any> {
  try {
    switch (args.action) {
      case 'agent_card':
        return { content: [{ type: 'text', text: JSON.stringify(getAgentCard(), null, 2) }] };

      case 'create_task': {
        if (!args.message) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'message required' }) }] };
        const task = createA2ATask(args.message);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, taskId: task.id, status: task.status }) }] };
      }

      case 'process_task': {
        if (!args.task_id) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'task_id required' }) }] };
        const result = await processA2ATask(args.task_id);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, task: { id: result.id, status: result.status, messages: result.messages.length, artifacts: result.artifacts.length } }) }] };
      }

      case 'task_status': {
        if (!args.task_id) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'task_id required' }) }] };
        const task = a2aTasks.get(args.task_id);
        if (!task) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Task not found' }) }] };
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, task }) }] };
      }

      case 'delegate': {
        if (!args.agent_url || !args.message) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'agent_url and message required' }) }] };
        const result = await delegateToAgent(args.agent_url, args.message);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }] };
      }

      case 'discover': {
        const agents = discoverAgents(args.capability || '');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, agents: agents.map(a => ({ name: a.name, url: a.url, skills: a.skills.map(s => s.name) })), count: agents.length }) }] };
      }

      case 'register_agent': {
        if (!args.agent_card) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'agent_card required' }) }] };
        registerExternalAgent(args.agent_card as AgentCard);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Registered agent: ${(args.agent_card as any).name}` }) }] };
      }

      case 'list_agents': {
        const all = Array.from(externalAgents.values());
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, agents: all.map(a => ({ name: a.name, url: a.url, capabilities: a.capabilities })), count: all.length }) }] };
      }

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${args.action}` }) }] };
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}
