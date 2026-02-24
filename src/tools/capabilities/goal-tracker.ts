/**
 * VegaMCP — Goal Tracker
 * Persistent project-level objectives with sub-goals, progress, and task linking.
 */

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface SubGoal { id: string; title: string; completed: boolean; completedAt: string | null; }

interface Goal {
  id: string; title: string; description: string; category: string;
  status: 'active' | 'completed' | 'paused' | 'failed'; progress: number;
  subGoals: SubGoal[]; successCriteria: string[]; deadline: string | null;
  linkedTaskIds: string[]; tags: string[]; createdAt: string;
  updatedAt: string; completedAt: string | null; notes: string[];
}

const goals = new Map<string, Goal>();

function recalcProgress(g: Goal): void {
  if (g.subGoals.length === 0) return;
  g.progress = Math.round((g.subGoals.filter(s => s.completed).length / g.subGoals.length) * 100);
  if (g.progress === 100 && g.status === 'active') { g.status = 'completed'; g.completedAt = new Date().toISOString(); }
}

export const goalTrackerSchema = {
  name: 'goal_tracker',
  description: 'Manage persistent project goals. Create goals with sub-goals, track progress, set deadlines, link tasks. Perfect for coding projects or multi-step objectives.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create','update','add_subgoal','complete_subgoal','link_task','add_note','get','list','delete'] },
      goal_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
      category: { type: 'string' }, success_criteria: { type: 'array', items: { type: 'string' } },
      deadline: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
      subgoal_title: { type: 'string' }, subgoal_id: { type: 'string' },
      task_id: { type: 'string' }, note: { type: 'string' },
      status: { type: 'string', enum: ['active','completed','paused','failed'] },
      progress: { type: 'number' }, filter_status: { type: 'string' }, filter_category: { type: 'string' },
    },
    required: ['action'],
  },
};

export function handleGoalTracker(args: any): string {
  try {
    switch (args.action) {
      case 'create': {
        if (!args.title) return JSON.stringify({ success: false, error: { code: 'INVALID_PARAMS', message: 'title required' } });
        const now = new Date().toISOString();
        const g: Goal = { id: `goal-${genId()}`, title: args.title, description: args.description || '',
          category: args.category || 'general', status: 'active', progress: 0, subGoals: [],
          successCriteria: args.success_criteria || [], deadline: args.deadline || null,
          linkedTaskIds: [], tags: args.tags || [], createdAt: now, updatedAt: now, completedAt: null, notes: [] };
        goals.set(g.id, g);
        return JSON.stringify({ success: true, goal: { id: g.id, title: g.title, category: g.category }, message: `Goal "${g.title}" created` });
      }
      case 'update': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        if (args.title) g.title = args.title; if (args.description) g.description = args.description;
        if (args.status) { g.status = args.status; if (args.status === 'completed') g.completedAt = new Date().toISOString(); }
        if (args.deadline) g.deadline = args.deadline; if (args.tags) g.tags = args.tags;
        if (args.progress !== undefined) g.progress = Math.min(100, Math.max(0, args.progress));
        g.updatedAt = new Date().toISOString();
        return JSON.stringify({ success: true, goal: { id: g.id, title: g.title, status: g.status, progress: g.progress } });
      }
      case 'add_subgoal': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        const sg: SubGoal = { id: `sg-${genId()}`, title: args.subgoal_title || 'Untitled', completed: false, completedAt: null };
        g.subGoals.push(sg); recalcProgress(g); g.updatedAt = new Date().toISOString();
        return JSON.stringify({ success: true, subgoal: { id: sg.id, title: sg.title }, goalProgress: g.progress, totalSubGoals: g.subGoals.length });
      }
      case 'complete_subgoal': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        const sg = g.subGoals.find(s => s.id === args.subgoal_id);
        if (!sg) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Sub-goal not found' } });
        sg.completed = true; sg.completedAt = new Date().toISOString(); recalcProgress(g); g.updatedAt = new Date().toISOString();
        return JSON.stringify({ success: true, subgoal: { id: sg.id, completed: true }, goalProgress: g.progress, goalStatus: g.status,
          message: g.status === 'completed' ? `Goal "${g.title}" COMPLETE!` : `Progress: ${g.progress}%` });
      }
      case 'link_task': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        if (!g.linkedTaskIds.includes(args.task_id)) g.linkedTaskIds.push(args.task_id);
        g.updatedAt = new Date().toISOString();
        return JSON.stringify({ success: true, totalLinkedTasks: g.linkedTaskIds.length });
      }
      case 'add_note': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        g.notes.push(`[${new Date().toISOString()}] ${args.note || ''}`); g.updatedAt = new Date().toISOString();
        return JSON.stringify({ success: true, totalNotes: g.notes.length });
      }
      case 'get': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        return JSON.stringify({ success: true, goal: { ...g,
          isOverdue: g.deadline && new Date(g.deadline) < new Date() && g.status === 'active',
          completedSubGoals: g.subGoals.filter(s => s.completed).length,
          remainingSubGoals: g.subGoals.filter(s => !s.completed).length } });
      }
      case 'list': {
        let all = Array.from(goals.values());
        if (args.filter_status) all = all.filter(g => g.status === args.filter_status);
        if (args.filter_category) all = all.filter(g => g.category === args.filter_category);
        return JSON.stringify({ success: true, goals: all.map(g => ({
          id: g.id, title: g.title, category: g.category, status: g.status, progress: g.progress,
          subGoals: g.subGoals.length, completedSubGoals: g.subGoals.filter(s => s.completed).length,
          linkedTasks: g.linkedTaskIds.length, deadline: g.deadline, updatedAt: g.updatedAt })),
          count: all.length, summary: { active: all.filter(g => g.status === 'active').length,
            completed: all.filter(g => g.status === 'completed').length } });
      }
      case 'delete': {
        const g = goals.get(args.goal_id);
        if (!g) return JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Goal not found' } });
        goals.delete(args.goal_id);
        return JSON.stringify({ success: true, message: `Goal "${g.title}" deleted` });
      }
      default: return JSON.stringify({ success: false, error: { code: 'INVALID_ACTION', message: `Unknown: ${args.action}` } });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: { code: 'GOAL_ERROR', message: err.message } });
  }
}
