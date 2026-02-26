import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class PostMortemAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'post_mortem',
      agentName: 'Post-Mortem Analyst',
      role: 'post_mortem',
      coordinator: 'quality',
      modelPref: 'deepseek/deepseek-chat',
      personality: 'You are the Post-Mortem Analyst — you examine failures in detail and extract actionable constraints (guardrails) to prevent the same mistake from happening again. Be specific about root causes. Write constraints that are clear, testable, and future-proof. Your output saves future development time.',
      capabilities: ['failure_analysis', 'root_cause_analysis', 'constraint_extraction', 'guardrail_generation'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Analyze this failure and extract a reusable constraint:\n\nERROR LOG: ${input.error_log || ''}\nCONTEXT: ${input.context || ''}\n\nProvide:\n1. ROOT CAUSE: What exactly went wrong?\n2. CONSTRAINT: Write a specific guardrail rule to prevent this.\n3. APPLICABILITY: When does this constraint apply?\n4. PRIORITY: How critical is this? (critical/high/medium/low)`,
      input
    );
    this.storeObservation(`postmortem:${payload.taskId}`, 'constraint', `Post-mortem analysis: ${result.content.slice(0, 200)}`);
    return { success: true, output: { analysis: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
