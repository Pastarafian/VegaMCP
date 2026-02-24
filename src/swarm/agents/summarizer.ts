import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class SummarizerAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'summarizer',
      agentName: 'Summarizer',
      role: 'summarizer',
      coordinator: 'operations',
      modelPref: 'openai/gpt-4o',
      personality: 'You are an expert at synthesis and summarization. Distill complex information into clear, concise summaries. Highlight key takeaways, create executive summaries, and generate actionable reports.',
      capabilities: ['summarize', 'synthesis', 'generate_report', 'executive_summary', 'distillation'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Summarize and synthesize the following information into a clear report:\n${JSON.stringify(input)}`,
      input
    );
    return { success: true, output: { summary: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
