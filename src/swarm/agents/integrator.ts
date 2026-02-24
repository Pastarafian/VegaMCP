import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class IntegratorAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'integrator',
      agentName: 'Integrator',
      role: 'integrator',
      coordinator: 'operations',
      modelPref: 'deepseek/deepseek-chat',
      personality: 'You are a systems integration expert. Coordinate between different systems, design data flows, manage API integrations, and ensure smooth interoperability. Focus on reliability and error handling.',
      capabilities: ['integration', 'api_coordination', 'data_pipeline', 'system_design', 'orchestration'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Design an integration solution for:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { integration: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
