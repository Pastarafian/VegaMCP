import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class CoderAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'coder',
      agentName: 'Coder',
      role: 'coder',
      coordinator: 'research',
      modelPref: 'deepseek/deepseek-chat',
      personality: 'You are an expert software engineer. Write clean, efficient, well-documented code. Follow best practices, handle edge cases, and explain your design decisions. You excel at debugging and code review.',
      capabilities: ['code_generation', 'debugging', 'code_review', 'refactoring', 'architecture'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Complete the following coding task:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { code: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
