/**
 * VegaMCP — Swarm Orchestrator
 * Top-level coordinator that manages agent lifecycles, task routing,
 * conflict resolution, and pipeline execution.
 */

import type {
  AgentConfig, AgentRole, CoordinatorType, TaskPayload,
  TaskResult, PipelineDefinition, PipelineExecution, TaskPriority,
} from './types.js';
import { SwarmAgent } from './agent-base.js';
import {
  initSwarmTables, registerAgent, getAllAgentStates, getAgentState,
  setAgentEnabled, updateAgentState,
  createTask, getTask, updateTask, getActiveTasks, getNextQueuedTask,
  getSubTasks, getTasksByAgent, getTasksByStatus,
  sendMessage, getSwarmStats, recordMetric, getMetrics, getMetricsSummary,
  registerTrigger, getAllTriggers, fireTrigger, deleteTrigger,
  getAllAgentDefinitions,
} from '../db/swarm-store.js';

// ═══════════════════════════════════════════════
// COORDINATOR
// ═══════════════════════════════════════════════

class Coordinator {
  readonly type: CoordinatorType;
  readonly agentRoles: AgentRole[];
  readonly maxParallelTasks: number;

  constructor(type: CoordinatorType, agentRoles: AgentRole[], maxParallel: number = 5) {
    this.type = type;
    this.agentRoles = agentRoles;
    this.maxParallelTasks = maxParallel;
  }
}

// ═══════════════════════════════════════════════
// TASK ROUTING MAP
// ═══════════════════════════════════════════════

const TASK_TYPE_MAP: Record<string, { coordinator: CoordinatorType; preferredRole?: AgentRole }> = {
  // Research tasks
  'research':           { coordinator: 'research', preferredRole: 'researcher' },
  'deep_research':      { coordinator: 'research', preferredRole: 'researcher' },
  'web_research':       { coordinator: 'research', preferredRole: 'researcher' },
  'data_analysis':      { coordinator: 'research', preferredRole: 'analyst' },
  'pattern_analysis':   { coordinator: 'research', preferredRole: 'analyst' },
  'content_creation':   { coordinator: 'research', preferredRole: 'writer' },
  'documentation':      { coordinator: 'research', preferredRole: 'writer' },
  'copywriting':        { coordinator: 'research', preferredRole: 'writer' },
  'code_generation':    { coordinator: 'research', preferredRole: 'coder' },
  'code_review':        { coordinator: 'research', preferredRole: 'coder' },
  'debugging':          { coordinator: 'research', preferredRole: 'coder' },
  'planning':           { coordinator: 'research', preferredRole: 'planner' },
  'task_decomposition': { coordinator: 'research', preferredRole: 'planner' },
  'strategy':           { coordinator: 'research', preferredRole: 'planner' },
  // Quality tasks
  'review':             { coordinator: 'quality', preferredRole: 'reviewer' },
  'validation':         { coordinator: 'quality', preferredRole: 'reviewer' },
  'testing':            { coordinator: 'quality', preferredRole: 'reviewer' },
  'critique':           { coordinator: 'quality', preferredRole: 'critic' },
  'feedback':           { coordinator: 'quality', preferredRole: 'critic' },
  'improvement':        { coordinator: 'quality', preferredRole: 'critic' },
  // Operations tasks
  'integration':        { coordinator: 'operations', preferredRole: 'integrator' },
  'api_coordination':   { coordinator: 'operations', preferredRole: 'integrator' },
  'data_pipeline':      { coordinator: 'operations', preferredRole: 'integrator' },
  'monitoring':         { coordinator: 'operations', preferredRole: 'monitor' },
  'health_check':       { coordinator: 'operations', preferredRole: 'monitor' },
  'alerting':           { coordinator: 'operations', preferredRole: 'monitor' },
  'summarize':          { coordinator: 'operations', preferredRole: 'summarizer' },
  'generate_report':    { coordinator: 'operations', preferredRole: 'summarizer' },
  'synthesis':          { coordinator: 'operations', preferredRole: 'summarizer' },
};

// ═══════════════════════════════════════════════
// SWARM ORCHESTRATOR
// ═══════════════════════════════════════════════

export class SwarmOrchestrator {
  private agents: Map<string, SwarmAgent> = new Map();
  private coordinators: Map<CoordinatorType, Coordinator> = new Map();
  private pipelines: Map<string, PipelineExecution> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor() {
    // Initialize coordinators
    this.coordinators.set('research', new Coordinator('research', [
      'researcher', 'analyst', 'writer', 'coder', 'planner',
    ], 10));

    this.coordinators.set('quality', new Coordinator('quality', [
      'reviewer', 'critic',
    ], 5));

    this.coordinators.set('operations', new Coordinator('operations', [
      'integrator', 'monitor', 'summarizer',
    ], 5));
  }

  // --- Initialization ---

  async initialize(): Promise<void> {
    initSwarmTables();
    console.error('[Swarm] Orchestrator initialized — tables ready');
  }

  // --- Agent Management ---

  registerAgentInstance(agent: SwarmAgent): void {
    // Register in database
    registerAgent({
      agent_id: agent.config.agentId,
      agent_name: agent.config.agentName,
      agent_role: agent.config.role,
      coordinator: agent.config.coordinator,
      model_pref: agent.config.modelPref,
      personality: agent.config.personality,
      engine_access: JSON.stringify(agent.config.capabilities),
      config: JSON.stringify({
        maxConcurrentTasks: agent.config.maxConcurrentTasks,
        heartbeatIntervalMs: agent.config.heartbeatIntervalMs,
        taskTimeoutMs: agent.config.taskTimeoutMs,
      }),
      enabled: true,
    });

    // Store in memory
    this.agents.set(agent.config.agentId, agent);
    console.error(`[Swarm] Registered agent: ${agent.config.agentName} (${agent.config.role})`);
  }

  async startAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    await agent.start();
    setAgentEnabled(agentId, true);
    return true;
  }

  async stopAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    await agent.stop();
    return true;
  }

  async pauseAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    await agent.pause();
    return true;
  }

  async restartAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    await agent.stop();
    await agent.start();
    return true;
  }

  async startAllAgents(): Promise<void> {
    for (const [id, agent] of this.agents) {
      const def = getAllAgentDefinitions().find(d => d.agent_id === id);
      if (def?.enabled) {
        await agent.start();
      }
    }
    this.isRunning = true;
    this.startPolling();
    console.error(`[Swarm] All agents started — ${this.agents.size} agents active`);
  }

  async stopAllAgents(): Promise<void> {
    this.isRunning = false;
    this.stopPolling();
    for (const [, agent] of this.agents) {
      await agent.stop();
    }
    console.error('[Swarm] All agents stopped');
  }

  // --- Task Management ---

  async submitTask(
    taskType: string,
    input: Record<string, any>,
    options: {
      priority?: TaskPriority;
      targetAgent?: string;
      parentTaskId?: string;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const routing = TASK_TYPE_MAP[taskType] || { coordinator: 'research' };

    const task = createTask({
      task_type: taskType,
      priority: options.priority ?? 2,
      coordinator: routing.coordinator,
      assigned_agent: options.targetAgent || null,
      parent_task_id: options.parentTaskId || null,
      input_data: JSON.stringify(input),
      timeout_seconds: options.timeout || 300,
    });

    console.error(`[Swarm] Task created: ${task.task_id} (${taskType}, P${task.priority})`);

    // If an agent is targeted, dispatch immediately
    if (options.targetAgent) {
      await this.dispatchTask(task.task_id);
    }

    return task.task_id;
  }

  async dispatchTask(taskId: string): Promise<boolean> {
    const task = getTask(taskId);
    if (!task || task.status !== 'queued') return false;

    // Find the best agent
    let targetAgentId = task.assigned_agent;

    if (!targetAgentId) {
      const routing = TASK_TYPE_MAP[task.task_type];
      if (routing?.preferredRole) {
        targetAgentId = this.findBestAgent(routing.preferredRole);
      }
      if (!targetAgentId) {
        // Fallback: find any idle agent in the coordinator
        targetAgentId = this.findIdleAgent(task.coordinator || 'research');
      }
    }

    if (!targetAgentId) {
      // No available agent — leave in queue
      return false;
    }

    // Assign and execute
    updateTask(taskId, {
      status: 'assigned',
      assigned_agent: targetAgentId,
      started_at: new Date().toISOString(),
    });

    // Execute asynchronously
    this.executeTaskOnAgent(taskId, targetAgentId).catch(err => {
      console.error(`[Swarm] Task ${taskId} execution error:`, err.message);
    });

    return true;
  }

  private async executeTaskOnAgent(taskId: string, agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    const task = getTask(taskId);
    if (!agent || !task) return;

    updateTask(taskId, { status: 'processing' });

    let input: Record<string, any> = {};
    try { input = JSON.parse(task.input_data || '{}'); } catch { /* empty */ }

    const payload: TaskPayload = {
      taskId: task.task_id,
      taskType: task.task_type,
      priority: task.priority as TaskPriority,
      input,
      context: {},
      parentTaskId: task.parent_task_id || undefined,
      timeoutMs: task.timeout_seconds * 1000,
    };

    const result = await agent.executeTask(payload);

    if (result.success) {
      updateTask(taskId, {
        status: 'completed',
        output_data: JSON.stringify(result.output),
        completed_at: new Date().toISOString(),
      });

      // Increment agent's completed count
      const state = getAgentState(agentId);
      if (state) {
        updateAgentState(agentId, { tasks_completed: state.tasks_completed + 1 });
      }

      // Handle follow-up tasks
      if (result.followUpTasks) {
        for (const followUp of result.followUpTasks) {
          await this.submitTask(followUp.taskType, followUp.input, {
            priority: followUp.priority,
            parentTaskId: taskId,
          });
        }
      }
    } else {
      const retryCount = task.retry_count + 1;
      if (retryCount < task.max_retries) {
        updateTask(taskId, {
          status: 'queued',
          error_message: result.error?.message,
          retry_count: retryCount,
          assigned_agent: null as any,
        });
      } else {
        updateTask(taskId, {
          status: 'failed',
          error_message: result.error?.message,
          retry_count: retryCount,
          completed_at: new Date().toISOString(),
        });
        const state = getAgentState(agentId);
        if (state) {
          updateAgentState(agentId, { tasks_failed: state.tasks_failed + 1 });
        }
      }
    }
  }

  async cancelTask(taskId: string, reason: string): Promise<boolean> {
    const task = getTask(taskId);
    if (!task) return false;
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return false;

    updateTask(taskId, {
      status: 'cancelled',
      error_message: `Cancelled: ${reason}`,
      completed_at: new Date().toISOString(),
    });

    return true;
  }

  // --- Agent Selection ---

  private findBestAgent(role: AgentRole): string | null {
    for (const [id, agent] of this.agents) {
      if (agent.config.role === role) {
        const state = getAgentState(id);
        if (state && state.status === 'idle') {
          return id;
        }
      }
    }
    // No idle agent of this role — try any agent with this role
    for (const [id, agent] of this.agents) {
      if (agent.config.role === role) {
        const state = getAgentState(id);
        if (state && state.status !== 'terminated' && state.status !== 'paused') {
          return id;
        }
      }
    }
    return null;
  }

  private findIdleAgent(coordinatorType: string): string | null {
    const coordinator = this.coordinators.get(coordinatorType as CoordinatorType);
    if (!coordinator) return null;

    for (const [id, agent] of this.agents) {
      if (agent.config.coordinator === coordinatorType) {
        const state = getAgentState(id);
        if (state && state.status === 'idle') {
          return id;
        }
      }
    }
    return null;
  }

  // --- Task Queue Polling ---

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.pollTaskQueue().catch(err => {
        console.error('[Swarm] Poll error:', err.message);
      });
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollTaskQueue(): Promise<void> {
    if (!this.isRunning) return;

    // Process queued tasks
    for (const coordType of ['research', 'quality', 'operations'] as CoordinatorType[]) {
      const task = getNextQueuedTask(coordType);
      if (task) {
        await this.dispatchTask(task.task_id);
      }
    }

    // Check for stuck tasks (running > 2x timeout)
    const activeTasks = getActiveTasks();
    const now = Date.now();
    for (const task of activeTasks) {
      if (task.status === 'processing' && task.started_at) {
        const elapsed = now - new Date(task.started_at).getTime();
        if (elapsed > task.timeout_seconds * 2000) {
          console.error(`[Swarm] Task ${task.task_id} stuck — cancelling`);
          await this.cancelTask(task.task_id, 'Timeout exceeded');
        }
      }
    }
  }

  // --- Pipeline Execution ---

  async runPipeline(definition: PipelineDefinition): Promise<string> {
    const executionId = `pipeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const execution: PipelineExecution = {
      executionId,
      pipelineId: definition.pipelineId,
      status: 'running',
      currentStepId: definition.initialStepId,
      completedSteps: [],
      stepResults: {},
      startedAt: new Date().toISOString(),
    };

    this.pipelines.set(executionId, execution);

    // Start executing the first step
    this.executePipelineStep(executionId, definition, definition.initialStepId).catch(err => {
      console.error(`[Swarm] Pipeline ${executionId} error:`, err.message);
      execution.status = 'failed';
    });

    return executionId;
  }

  private async executePipelineStep(
    executionId: string,
    definition: PipelineDefinition,
    stepId: string
  ): Promise<void> {
    const execution = this.pipelines.get(executionId);
    if (!execution || execution.status !== 'running') return;

    const step = definition.steps.find(s => s.stepId === stepId);
    if (!step) {
      execution.status = 'failed';
      return;
    }

    execution.currentStepId = stepId;

    // Create and execute the task for this step
    const taskId = await this.submitTask(step.taskType, step.input || {}, {
      priority: definition.priority,
    });

    // Wait for task completion (poll)
    let task = getTask(taskId);
    const maxWait = definition.timeoutMs || 300000;
    const startWait = Date.now();

    while (task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
      if (Date.now() - startWait > maxWait) {
        execution.status = 'failed';
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      task = getTask(taskId);
    }

    if (!task || task.status !== 'completed') {
      if (step.onFailure) {
        execution.completedSteps.push(stepId);
        await this.executePipelineStep(executionId, definition, step.onFailure);
      } else {
        execution.status = 'failed';
      }
      return;
    }

    // Task completed — store result
    let output: any = {};
    try { output = JSON.parse(task.output_data || '{}'); } catch { /* empty */ }

    execution.stepResults[stepId] = { success: true, output };
    execution.completedSteps.push(stepId);

    const nextStep = step.onSuccess;
    if (!nextStep) {
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      return;
    }

    const nextStepDef = definition.steps.find(s => s.stepId === nextStep);
    if (!nextStepDef) {
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      return;
    }

    await this.executePipelineStep(executionId, definition, nextStep);
  }

  getPipelineStatus(executionId: string): PipelineExecution | null {
    return this.pipelines.get(executionId) || null;
  }

  // --- Broadcast ---

  async broadcastMessage(
    message: string,
    filter?: { coordinator?: string; status?: string }
  ): Promise<number> {
    const allStates = getAllAgentStates();
    let targets = allStates;

    if (filter?.coordinator) {
      targets = targets.filter(a => a.coordinator === filter.coordinator);
    }
    if (filter?.status) {
      targets = targets.filter(a => a.status === filter.status);
    }

    for (const agent of targets) {
      sendMessage({
        sender_agent: 'orchestrator',
        recipient: agent.agent_id,
        message_type: 'coordination',
        content: JSON.stringify({ message, timestamp: new Date().toISOString() }),
        priority: 1,
        expires_at: null,
      });
    }

    return targets.length;
  }

  // --- Emergency ---

  async emergencyShutdown(): Promise<void> {
    console.error('[Swarm] ⚠️ EMERGENCY SHUTDOWN');
    this.isRunning = false;
    this.stopPolling();

    const activeTasks = getActiveTasks();
    for (const task of activeTasks) {
      updateTask(task.task_id, {
        status: 'cancelled',
        error_message: 'Emergency shutdown',
        completed_at: new Date().toISOString(),
      });
    }

    for (const [, agent] of this.agents) {
      await agent.stop().catch(() => { /* force stop */ });
    }
  }

  // --- Status & Metrics ---

  getStatus() {
    return {
      isRunning: this.isRunning,
      agents: getAllAgentStates(),
      stats: getSwarmStats(),
      activePipelines: Array.from(this.pipelines.values()).filter(p => p.status === 'running'),
      coordinators: Array.from(this.coordinators.entries()).map(([type, coord]) => ({
        type,
        agentRoles: coord.agentRoles,
        maxParallelTasks: coord.maxParallelTasks,
      })),
    };
  }
}

// ═══════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════

let orchestratorInstance: SwarmOrchestrator | null = null;

export function getOrchestrator(): SwarmOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SwarmOrchestrator();
  }
  return orchestratorInstance;
}

export async function initSwarm(): Promise<SwarmOrchestrator> {
  const orchestrator = getOrchestrator();
  await orchestrator.initialize();
  return orchestrator;
}
