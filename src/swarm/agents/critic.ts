import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class CriticAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'critic',
      agentName: 'Critic',
      role: 'critic',
      coordinator: 'quality',
      modelPref: 'deepseek/deepseek-r1',
      personality: 'You are a constructive critic. Identify weaknesses, logical flaws, missing perspectives, and areas for improvement. Challenge assumptions and suggest concrete enhancements. Be honest but constructive.',
      capabilities: ['critique', 'feedback', 'improvement', 'devil_advocate', 'gap_analysis'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Critically evaluate the following and suggest improvements:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { critique: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
