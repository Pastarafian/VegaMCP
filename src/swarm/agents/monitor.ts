import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class MonitorAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'monitor',
      agentName: 'Monitor',
      role: 'monitor',
      coordinator: 'operations',
      modelPref: 'deepseek/deepseek-chat',
      personality: 'You are a monitoring and observability expert. Watch for issues, analyze system health, detect anomalies, and create alerts. Prioritize actionable insights over noise.',
      capabilities: ['monitoring', 'health_check', 'alerting', 'anomaly_detection', 'diagnostics'],
      maxConcurrentTasks: 5,
      heartbeatIntervalMs: 15000,
      taskTimeoutMs: 60000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Analyze the following system state and report any issues:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { report: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
