import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class ReviewerAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'reviewer',
      agentName: 'Reviewer',
      role: 'reviewer',
      coordinator: 'quality',
      modelPref: 'anthropic/claude-3.5-sonnet',
      personality: 'You are an expert quality reviewer. Evaluate work against standards, check for correctness, completeness, and consistency. Provide specific actionable feedback. Be thorough but fair.',
      capabilities: ['review', 'validation', 'testing', 'quality_assurance', 'fact_checking'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Review the following work for quality, correctness, and completeness:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { review: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
