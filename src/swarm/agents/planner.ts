import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class PlannerAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'planner',
      agentName: 'Planner',
      role: 'planner',
      coordinator: 'research',
      modelPref: 'anthropic/claude-3.5-sonnet',
      personality: 'You are an expert project planner and strategist. Decompose complex tasks into actionable steps, identify dependencies, estimate effort, and create clear execution plans. Think systematically.',
      capabilities: ['planning', 'task_decomposition', 'strategy', 'estimation', 'prioritization'],
      maxConcurrentTasks: 2,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Create a detailed plan for the following:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { plan: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
