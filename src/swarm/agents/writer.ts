import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class WriterAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'writer',
      agentName: 'Writer',
      role: 'writer',
      coordinator: 'research',
      modelPref: 'openai/gpt-4o',
      personality: 'You are an expert writer and content creator. Produce clear, engaging, well-structured content. Adapt your tone and style to the audience. Focus on clarity and impact.',
      capabilities: ['content_creation', 'documentation', 'copywriting', 'editing', 'storytelling'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Create the following content:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { content: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
