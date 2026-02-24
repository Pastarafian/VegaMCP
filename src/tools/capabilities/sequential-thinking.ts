/**
 * Sequential Thinking — Dynamic chain-of-thought with branching and revision
 * Inspired by the official Anthropic MCP sequential thinking reference server
 */

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

interface ThoughtStep {
  id: string;
  stepNumber: number;
  thought: string;
  reasoning: string;
  confidence: number;  // 0-1
  isRevision: boolean;
  revisesStep?: number;
  branchId?: string;
  timestamp: string;
}

interface ThinkingSession {
  sessionId: string;
  title: string;
  steps: ThoughtStep[];
  branches: Map<string, ThoughtStep[]>;
  status: 'active' | 'completed' | 'abandoned';
  created: string;
  totalRevisions: number;
}

const sessions = new Map<string, ThinkingSession>();
let sessionCounter = 0;

export const sequentialThinkingSchema = {
  name: 'vegamcp_sequential_thinking',
  description: 'Dynamic chain-of-thought reasoning with branching and revision. Break complex problems into sequential thought steps, revise earlier thinking, and explore alternative branches. Actions: start, think, revise, branch, summarize, list_sessions, get_session.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['start', 'think', 'revise', 'branch', 'summarize', 'list_sessions', 'get_session'] as const,
        description: 'Action to perform',
      },
      session_id: { type: 'string' as const, description: 'Session ID (auto-generated on start)' },
      title: { type: 'string' as const, description: 'Problem title (for start)' },
      thought: { type: 'string' as const, description: 'The thought content (for think, revise, branch)' },
      reasoning: { type: 'string' as const, description: 'Why this thought follows from the previous (for think, revise)' },
      confidence: { type: 'number' as const, description: 'Confidence in this thought 0.0-1.0 (for think, revise)' },
      revises_step: { type: 'number' as const, description: 'Step number being revised (for revise)' },
      branch_name: { type: 'string' as const, description: 'Name for the alternative branch (for branch)' },
      next_step_needed: { type: 'boolean' as const, description: 'Whether more thinking is needed (for think). Set false to indicate conclusion.' },
    },
    required: ['action'] as const,
  },
};

export async function handleSequentialThinking(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (args.action) {

      case 'start': {
        const id = `think-${++sessionCounter}-${Date.now().toString(36)}`;
        const session: ThinkingSession = {
          sessionId: id,
          title: args.title || 'Untitled Problem',
          steps: [],
          branches: new Map(),
          status: 'active',
          created: new Date().toISOString(),
          totalRevisions: 0,
        };
        sessions.set(id, session);
        return result({
          success: true,
          sessionId: id,
          title: session.title,
          message: 'Thinking session started. Use "think" to add sequential thought steps.',
          guidance: 'For each step: provide thought (WHAT you think), reasoning (WHY), and confidence (HOW sure 0-1). Set next_step_needed=false when you reach a conclusion.',
        });
      }

      case 'think': {
        const session = getSession(args.session_id);
        if (!args.thought) throw new Error('thought is required');
        const stepNum = session.steps.length + 1;
        const step: ThoughtStep = {
          id: `step-${stepNum}`,
          stepNumber: stepNum,
          thought: args.thought,
          reasoning: args.reasoning || '',
          confidence: Math.max(0, Math.min(1, args.confidence ?? 0.7)),
          isRevision: false,
          timestamp: new Date().toISOString(),
        };
        session.steps.push(step);

        if (args.next_step_needed === false) {
          session.status = 'completed';
        }

        const avgConfidence = session.steps.reduce((s, st) => s + st.confidence, 0) / session.steps.length;

        return result({
          success: true,
          sessionId: session.sessionId,
          step: stepNum,
          totalSteps: session.steps.length,
          averageConfidence: Math.round(avgConfidence * 100) / 100,
          status: session.status,
          nextStepNeeded: args.next_step_needed !== false,
          guidance: args.next_step_needed === false
            ? 'Thinking complete. Use "summarize" to get the full chain of thought.'
            : step.confidence < 0.5
              ? '⚠️ Low confidence — consider using "revise" to reconsider or "branch" to explore alternatives.'
              : 'Continue with the next thought step.',
        });
      }

      case 'revise': {
        const session = getSession(args.session_id);
        if (!args.thought) throw new Error('thought is required');
        if (args.revises_step === undefined) throw new Error('revises_step is required');

        const targetStep = args.revises_step;
        if (targetStep < 1 || targetStep > session.steps.length) {
          throw new Error(`Invalid step ${targetStep}. Valid range: 1-${session.steps.length}`);
        }

        const stepNum = session.steps.length + 1;
        const step: ThoughtStep = {
          id: `step-${stepNum}`,
          stepNumber: stepNum,
          thought: args.thought,
          reasoning: args.reasoning || `Revision of step ${targetStep}`,
          confidence: Math.max(0, Math.min(1, args.confidence ?? 0.8)),
          isRevision: true,
          revisesStep: targetStep,
          timestamp: new Date().toISOString(),
        };
        session.steps.push(step);
        session.totalRevisions++;

        return result({
          success: true,
          sessionId: session.sessionId,
          step: stepNum,
          revises: targetStep,
          originalThought: session.steps[targetStep - 1].thought.slice(0, 100),
          totalRevisions: session.totalRevisions,
          message: `Revised step ${targetStep}. The chain now reflects updated thinking.`,
        });
      }

      case 'branch': {
        const session = getSession(args.session_id);
        if (!args.thought) throw new Error('thought is required');
        const branchName = args.branch_name || `branch-${session.branches.size + 1}`;

        const branchStep: ThoughtStep = {
          id: `${branchName}-step-1`,
          stepNumber: 1,
          thought: args.thought,
          reasoning: args.reasoning || 'Alternative approach',
          confidence: Math.max(0, Math.min(1, args.confidence ?? 0.6)),
          isRevision: false,
          branchId: branchName,
          timestamp: new Date().toISOString(),
        };

        if (!session.branches.has(branchName)) {
          session.branches.set(branchName, []);
        }
        session.branches.get(branchName)!.push(branchStep);

        return result({
          success: true,
          sessionId: session.sessionId,
          branch: branchName,
          branchSteps: session.branches.get(branchName)!.length,
          totalBranches: session.branches.size,
          message: `Branch "${branchName}" created. Continue main chain with "think" or add to branch with another "branch" call.`,
        });
      }

      case 'summarize': {
        const session = getSession(args.session_id);
        const avgConf = session.steps.reduce((s, st) => s + st.confidence, 0) / Math.max(session.steps.length, 1);
        const revisionSteps = session.steps.filter(s => s.isRevision);

        const chainOfThought = session.steps.map(s => {
          let line = `**Step ${s.stepNumber}** (confidence: ${Math.round(s.confidence * 100)}%)`;
          if (s.isRevision) line += ` [REVISES step ${s.revisesStep}]`;
          line += `\n${s.thought}`;
          if (s.reasoning) line += `\n_Reasoning: ${s.reasoning}_`;
          return line;
        }).join('\n\n');

        const branchSummaries: any[] = [];
        for (const [name, steps] of session.branches) {
          branchSummaries.push({
            name,
            steps: steps.length,
            thoughts: steps.map(s => s.thought.slice(0, 100)),
          });
        }

        return result({
          success: true,
          sessionId: session.sessionId,
          title: session.title,
          status: session.status,
          totalSteps: session.steps.length,
          totalRevisions: session.totalRevisions,
          totalBranches: session.branches.size,
          averageConfidence: Math.round(avgConf * 100) / 100,
          chainOfThought,
          branches: branchSummaries,
          conclusion: session.status === 'completed'
            ? session.steps[session.steps.length - 1]?.thought || '(no conclusion)'
            : '(thinking still in progress)',
        });
      }

      case 'list_sessions': {
        const list = Array.from(sessions.values()).map(s => ({
          sessionId: s.sessionId,
          title: s.title,
          status: s.status,
          steps: s.steps.length,
          branches: s.branches.size,
          created: s.created,
        }));
        return result({ success: true, sessions: list, count: list.length });
      }

      case 'get_session': {
        const session = getSession(args.session_id);
        return result({
          success: true,
          sessionId: session.sessionId,
          title: session.title,
          status: session.status,
          steps: session.steps,
          branchCount: session.branches.size,
          totalRevisions: session.totalRevisions,
        });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function getSession(id: string | undefined): ThinkingSession {
  if (!id) throw new Error('session_id is required');
  const session = sessions.get(id);
  if (!session) throw new Error(`Session "${id}" not found. Use "start" to create one.`);
  return session;
}
