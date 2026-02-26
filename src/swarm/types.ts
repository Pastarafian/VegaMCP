/**
 * VegaMCP — Swarm Type Definitions
 * Core types for the general-purpose agent swarm architecture.
 */

// ═══════════════════════════════════════════════
// AGENT TYPES
// ═══════════════════════════════════════════════

export type CoordinatorType = 'research' | 'quality' | 'operations' | 'innovation';

export type AgentRole =
  | 'researcher'       // Deep research, information gathering
  | 'analyst'          // Data analysis, pattern recognition
  | 'writer'           // Content creation, documentation
  | 'coder'            // Code generation, debugging, reviews
  | 'planner'          // Task decomposition, strategy, planning
  | 'reviewer'         // Quality assurance, validation
  | 'critic'           // Critical analysis, feedback
  | 'integrator'       // System integration, API coordination
  | 'monitor'          // System monitoring, alerting
  | 'summarizer'       // Synthesis, report generation
  | 'visionary'        // Creative hypothesis generation (Tournament of Ideas)
  | 'adversary'        // Prior art critic, debunker (Tournament of Ideas)
  | 'arbiter'          // Final judgment, feasibility arbiter (Tournament of Ideas)
  | 'post_mortem';     // Failure analysis, constraint extraction (Self-Evolution)

export type AgentStatus = 'idle' | 'processing' | 'error' | 'paused' | 'terminated';

export type TaskPriority = 0 | 1 | 2 | 3; // 0=emergency, 1=high, 2=normal, 3=background

export type TaskStatus = 'queued' | 'assigned' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type MessageType = 'request' | 'response' | 'alert' | 'observation' | 'coordination';

export type TriggerType = 'schedule' | 'webhook' | 'threshold' | 'manual' | 'event';

// ═══════════════════════════════════════════════
// AGENT CONFIG
// ═══════════════════════════════════════════════

export interface AgentConfig {
  agentId: string;
  agentName: string;
  role: AgentRole;
  coordinator: CoordinatorType;
  modelPref: string;
  personality: string;
  capabilities: string[];  // What this agent can do
  maxConcurrentTasks: number;
  heartbeatIntervalMs: number;
  taskTimeoutMs: number;
}

export interface AgentRegistration {
  config: AgentConfig;
  processTask: (task: TaskPayload) => Promise<TaskResult>;
}

// ═══════════════════════════════════════════════
// TASK TYPES
// ═══════════════════════════════════════════════

export interface TaskPayload {
  taskId: string;
  taskType: string;
  priority: TaskPriority;
  input: Record<string, any>;
  context: Record<string, any>;
  parentTaskId?: string;
  dependencies?: string[];
  timeoutMs: number;
}

export interface TaskResult {
  success: boolean;
  output: Record<string, any>;
  metrics?: {
    durationMs: number;
    tokensUsed?: number;
    modelUsed?: string;
    confidence?: number;
  };
  error?: {
    code: string;
    message: string;
  };
  followUpTasks?: Array<{
    taskType: string;
    priority: TaskPriority;
    input: Record<string, any>;
  }>;
}

// ═══════════════════════════════════════════════
// PIPELINE TYPES
// ═══════════════════════════════════════════════

export interface PipelineStep {
  stepId: string;
  taskType: string;
  agentRole?: AgentRole;
  input?: Record<string, any>;
  condition?: {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: any;
  };
  onSuccess?: string;  // next step ID
  onFailure?: string;  // step ID on failure
}

export interface PipelineDefinition {
  pipelineId: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  initialStepId: string;
  priority: TaskPriority;
  timeoutMs: number;
}

export interface PipelineExecution {
  executionId: string;
  pipelineId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepId: string;
  completedSteps: string[];
  stepResults: Record<string, TaskResult>;
  startedAt: string;
  completedAt?: string;
}

// ═══════════════════════════════════════════════
// MODEL ROUTING
// ═══════════════════════════════════════════════

export type ModelId =
  | 'deepseek/deepseek-r1'
  | 'deepseek/deepseek-chat'
  | 'anthropic/claude-3.5-sonnet'
  | 'openai/gpt-4o'
  | 'openai/o3-mini'
  | 'meta-llama/llama-3.1-405b';

export interface ModelRoutingConfig {
  primary: ModelId;
  fallback: ModelId[];
  costLimit?: number;
  latencyLimit?: number;
}

// ═══════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════

export interface SwarmEvent {
  eventType: string;
  source: string;
  timestamp: string;
  data: Record<string, any>;
}

// ═══════════════════════════════════════════════
// COORDINATOR TYPES
// ═══════════════════════════════════════════════

export interface CoordinatorConfig {
  type: CoordinatorType;
  agentRoles: AgentRole[];
  maxParallelTasks: number;
  conflictResolution: 'priority' | 'consensus' | 'veto';
}

// ═══════════════════════════════════════════════
// WORKFLOW / STATE MACHINE TYPES
// ═══════════════════════════════════════════════

export interface WorkflowState {
  stateId: string;
  agent?: AgentRole;
  action: string;
  transitions: Array<{
    condition: string;
    target: string;
  }>;
  isTerminal: boolean;
  notify: boolean;
}

export interface WorkflowDefinition {
  workflowId: string;
  name: string;
  description: string;
  states: Record<string, WorkflowState>;
  initialState: string;
}

// ═══════════════════════════════════════════════
// API GATEWAY TYPES
// ═══════════════════════════════════════════════

export interface ApiEndpointConfig {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  rateLimit: { maxPerMinute: number; maxPerHour: number };
  cacheTtlSeconds: number;
  circuitBreaker: { failureThreshold: number; resetTimeMs: number };
}

// ═══════════════════════════════════════════════
// SANDBOX TYPES
// ═══════════════════════════════════════════════

export interface SandboxConfig {
  environment: 'python' | 'javascript';
  timeout: number;
  memoryLimitMb: number;
  allowNetwork: boolean;
  allowFileRead: boolean;
}

export interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  memoryUsedMb?: number;
}

// ═══════════════════════════════════════════════
// RESEARCH SCIENTIST TYPES
// ═══════════════════════════════════════════════

export interface DebateConfig {
  visionaryModel: ModelId;
  adversaryModel: ModelId;
  arbiterModel: ModelId;
  creativityLevel: number;   // 0.0-1.0
  rigorLevel: number;        // 0.0-1.0
  maxDebateRounds: number;
}

export interface HypothesisPayload {
  topic: string;
  seedConcepts: string[];
  constraints: string[];
  pastFailures: string[];
  debateConfig?: Partial<DebateConfig>;
}

export interface EvolutionMetrics {
  totalFailures: number;
  totalConstraints: number;
  failureAvoidanceRate: number;
  promotionRate: number;
  avgConfidence: number;
  evolutionScore: number;     // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}
