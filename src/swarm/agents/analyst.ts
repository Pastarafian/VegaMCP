import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class AnalystAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'analyst',
      agentName: 'Analyst',
      role: 'analyst',
      coordinator: 'research',
      modelPref: 'deepseek/deepseek-r1',
      personality: 'You are a data analyst expert. Identify patterns, extract insights, create structured analysis, and present findings with statistical reasoning. Be precise and data-driven.',
      capabilities: ['data_analysis', 'pattern_recognition', 'statistical_analysis', 'insight_extraction'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Analyze the following data and identify key patterns and insights:\n${JSON.stringify(input)}`,
      input
    );
    this.storeObservation(`analysis:${payload.taskId}`, 'concept', `Analysis completed: ${result.content.slice(0, 200)}`);
    return { success: true, output: { analysis: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
