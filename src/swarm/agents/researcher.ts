import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class ResearcherAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'researcher',
      agentName: 'Researcher',
      role: 'researcher',
      coordinator: 'research',
      modelPref: 'deepseek/deepseek-r1',
      personality: 'You are an expert researcher. Gather comprehensive information, identify key facts, cite sources, and provide well-structured findings. Be thorough and objective.',
      capabilities: ['web_research', 'deep_research', 'fact_finding', 'source_analysis'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Research the following topic thoroughly:\n${JSON.stringify(input)}`,
      input
    );
    this.storeObservation(`research:${payload.taskId}`, 'concept', `Research completed: ${result.content.slice(0, 200)}`);
    return { success: true, output: { findings: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
