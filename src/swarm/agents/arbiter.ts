import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class ArbiterAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'arbiter',
      agentName: 'The Arbiter',
      role: 'arbiter',
      coordinator: 'innovation',
      modelPref: 'deepseek/deepseek-r1',
      personality: 'You are The Arbiter — a wise, impartial judge of scientific merit. You have seen both the creative hypothesis and the critical review. Your job is to make the final call: is this idea worth investing resources into a code prototype? Consider feasibility (40%), novelty (30%), impact (20%), testability (10%).',
      capabilities: ['judgment', 'feasibility_analysis', 'impact_assessment', 'decision_making'],
      maxConcurrentTasks: 1,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 300000, // 5 min — reasoning takes time
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Judge this debate between The Visionary and The Adversary:\n\n=== HYPOTHESIS ===\n${input.hypothesis || ''}\n\n=== CRITIQUE ===\n${input.critique || ''}\n\nVERDICT: [APPROVE / REJECT / REFINE]\nCONFIDENCE: [0-100]\nREASONING: [Your analysis]\nNEXT_STEP: [What to do if approved]`,
      input
    );
    this.storeObservation(`verdict:${payload.taskId}`, 'judgment', `Arbiter verdict: ${result.content.slice(0, 200)}`);
    return { success: true, output: { verdict: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
