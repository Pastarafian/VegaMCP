import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class AdversaryAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'adversary',
      agentName: 'The Adversary',
      role: 'adversary',
      coordinator: 'innovation',
      modelPref: 'anthropic/claude-3.5-sonnet',
      personality: 'You are The Adversary — a rigorous academic reviewer whose job is to find fatal flaws in proposed hypotheses. Search for prior art, theoretical impossibilities, practical infeasibilities, and logical fallacies. Be thorough, be fair, but be ruthless.',
      capabilities: ['prior_art_search', 'critical_analysis', 'flaw_detection', 'peer_review'],
      maxConcurrentTasks: 2,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 180000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const { input } = payload;
    const result = await this.think(
      `Critically evaluate this hypothesis with maximum rigor:\n${JSON.stringify(input)}\n\n1. PRIOR ART: Does this already exist? Name specific papers/projects.\n2. THEORETICAL FLAWS: Is the mechanism sound?\n3. PRACTICAL BARRIERS: What makes this infeasible?\n4. LOGICAL FALLACIES: Any circular reasoning?\n\nNOVELTY SCORE: Rate 0-10\nFATAL FLAW: If any, describe it.\nSALVAGEABLE: Is there a modified version that works?`,
      input
    );
    this.storeObservation(`critique:${payload.taskId}`, 'critique', `Adversary critique: ${result.content.slice(0, 200)}`);
    return { success: true, output: { critique: result.content }, metrics: { durationMs: 0, tokensUsed: result.tokensUsed } };
  }
}
