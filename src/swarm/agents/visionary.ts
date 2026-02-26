import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class VisionaryAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'visionary',
      agentName: 'The Visionary',
      role: 'visionary',
      coordinator: 'innovation',
      modelPref: 'openai/o3-mini',
      personality: 'You are The Visionary — a bold, creative research scientist who generates novel hypotheses by combining disparate concepts. You see patterns others miss. You propose specific, testable ideas with clear mechanisms. Be surprising. Be specific. Be bold.',
      capabilities: ['hypothesis_generation', 'creative_combination', 'lateral_thinking', 'seed_analysis'],
      maxConcurrentTasks: 2,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 180000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Generate a novel, specific, testable hypothesis about:\n${JSON.stringify(input)}\n\nFormat:\nHYPOTHESIS: [title]\nMECHANISM: [how it works]\nTESTABLE: [how to verify]\nNOVELTY: [why this hasn't been tried]`,
      input
    );
    this.storeObservation(`hypothesis:${payload.taskId}`, 'hypothesis', `Visionary proposal: ${result.content.slice(0, 200)}`);
    return { success: true, output: { hypothesis: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
