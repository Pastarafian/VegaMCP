/**
 * VegaMCP — Main MCP Server Entry Point (v7.0)
 * 
 * Hub router that registers all tools, resources, and prompts,
 * then serves them over stdio transport for zero-latency communication
 * with Google Antigravity.
 * 
 * v3.0 — Enhanced Intelligence Platform:
 * - Token Budget Manager
 * - Kimi + Ollama model support
 * - Knowledge Engine (embedded vector store)
 * - GitHub Scraper + AI Analysis
 * - Web Search (Tavily + SearXNG)
 * - Prompt Template Library
 * - Code Analysis Engine
 * - Lazy Tool Loading (profiles)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CompleteRequestSchema,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import fs from 'node:fs';

// --- Database ---
import { initGraphStore, closeGraphStore } from './db/graph-store.js';

// --- Memory Tools ---
import { createEntitiesSchema, handleCreateEntities } from './tools/memory/create-entities.js';
import { createRelationsSchema, handleCreateRelations } from './tools/memory/create-relations.js';
import { addObservationsSchema, handleAddObservations } from './tools/memory/add-observations.js';
import { searchGraphSchema, handleSearchGraph } from './tools/memory/search-graph.js';
import { openNodesSchema, handleOpenNodes } from './tools/memory/open-nodes.js';
import { deleteEntitiesSchema, handleDeleteEntities } from './tools/memory/delete-entities.js';

// --- Browser Tools ---
import { browserNavigateSchema, handleBrowserNavigate } from './tools/browser/navigate.js';
import { browserClickSchema, handleBrowserClick } from './tools/browser/click.js';
import { browserTypeSchema, handleBrowserType } from './tools/browser/type.js';
import { browserScreenshotSchema, handleBrowserScreenshot } from './tools/browser/screenshot.js';
import { browserSnapshotSchema, handleBrowserSnapshot } from './tools/browser/snapshot.js';
import { browserExecuteJsSchema, handleBrowserExecuteJs } from './tools/browser/execute-js.js';
import { browserConsoleLogsSchema, handleBrowserConsoleLogs } from './tools/browser/console-logs.js';
import { browserCloseSchema, handleBrowserClose } from './tools/browser/close.js';
import { closeBrowser } from './tools/browser/session.js';

// --- Sentry Tools ---
import { sentrySearchIssuesSchema, handleSentrySearchIssues } from './tools/sentry/search-issues.js';
import { sentryGetIssueDetailSchema, handleSentryGetIssueDetail } from './tools/sentry/get-issue-detail.js';
import { sentryGetBreadcrumbsSchema, handleSentryGetBreadcrumbs } from './tools/sentry/get-breadcrumbs.js';
import { sentryResolveIssueSchema, handleSentryResolveIssue } from './tools/sentry/resolve-issue.js';
import { getSentryConfig } from './tools/sentry/client.js';

// --- Reasoning Tool ---
import { routeToReasoningModelSchema, handleRouteToReasoningModel } from './tools/reasoning/route-to-model.js';

// --- Swarm Management Tools ---
import { swarmCreateTaskSchema, handleSwarmCreateTask } from './tools/swarm/create-task.js';
import { swarmGetTaskStatusSchema, handleSwarmGetTaskStatus } from './tools/swarm/get-task-status.js';
import { swarmCancelTaskSchema, handleSwarmCancelTask } from './tools/swarm/cancel-task.js';
import { swarmListAgentsSchema, handleSwarmListAgents } from './tools/swarm/list-agents.js';
import { swarmAgentControlSchema, handleSwarmAgentControl } from './tools/swarm/agent-control.js';
import { swarmBroadcastSchema, handleSwarmBroadcast } from './tools/swarm/broadcast.js';
import { swarmGetMetricsSchema, handleSwarmGetMetrics } from './tools/swarm/get-metrics.js';
import { swarmRegisterTriggerSchema, handleSwarmRegisterTrigger, swarmRunPipelineSchema, handleSwarmRunPipeline } from './tools/swarm/triggers-pipeline.js';

// --- Capabilities Tools ---
import { sandboxExecuteSchema, handleSandboxExecute } from './tools/capabilities/sandbox.js';
import { apiRequestSchema, handleApiRequest } from './tools/capabilities/api-gateway.js';
import { watcherCreateSchema, handleWatcherCreate, watcherListSchema, handleWatcherList, watcherDeleteSchema, handleWatcherDelete, closeAllWatchers } from './tools/capabilities/watchers.js';
import { webhookCreateSchema, handleWebhookCreate, webhookListSchema, handleWebhookList, webhookDeleteSchema, handleWebhookDelete, webhookTestSchema, handleWebhookTest } from './tools/capabilities/webhooks.js';
import { workflowExecuteSchema, handleWorkflowExecute } from './tools/capabilities/workflow.js';
import { scheduleToolSchema, handleScheduleTool } from './tools/capabilities/schedule.js';
import { notifyToolSchema, handleNotifyTool } from './tools/capabilities/notify.js';
import { agentConversationSchema, handleAgentConversation } from './tools/capabilities/agent-conversations.js';
import { agentDnaSchema, handleAgentDna } from './tools/capabilities/agent-dna.js';
import { reasoningTraceSchema, handleReasoningTrace } from './tools/capabilities/reasoning-trace.js';
import { dataStreamSchema, handleDataStream } from './tools/capabilities/data-streams.js';
import { goalTrackerSchema, handleGoalTracker } from './tools/capabilities/goal-tracker.js';
import { abTestSchema, handleABTest } from './tools/capabilities/ab-test.js';

// --- v3.1 New Tools ---
import { healthCheckSchema, handleHealthCheck } from './tools/capabilities/health-check.js';
import { analyticsSchema, handleAnalytics, recordToolCall } from './tools/capabilities/analytics.js';
import { skillsSchema, handleSkills } from './tools/capabilities/skills.js';

// --- v3.2 New Tool Modules ---
import { filesystemSchema, handleFilesystem } from './tools/capabilities/filesystem.js';
import { gitToolsSchema, handleGitTools } from './tools/capabilities/git-tools.js';
import { sequentialThinkingSchema, handleSequentialThinking } from './tools/capabilities/sequential-thinking.js';
import { databaseSchema, handleDatabase } from './tools/capabilities/database.js';
import { documentReaderSchema, handleDocumentReader } from './tools/capabilities/document-reader.js';
import { shellSchema, handleShell } from './tools/capabilities/shell.js';
import { vaultSchema, handleVault } from './tools/capabilities/vault.js';

// --- v7.0 Testing Suite ---
import { mobileTestingSchema, handleMobileTesting } from './tools/capabilities/mobile-testing.js';
import { webTestingSchema, handleWebTesting } from './tools/capabilities/web-testing.js';
import { apiTestingSchema, handleApiTesting } from './tools/capabilities/api-testing.js';
import { accessibilitySchema, handleAccessibility } from './tools/capabilities/accessibility-testing.js';

// --- v3.2 Seed Data (PolyAlgo, EasyPrompts, BugTaxonomy) ---
import { seedDataSchema, handleSeedData, autoSeed } from './seed/seed-runner.js';

// --- v3.0 Enhanced Intelligence Tools ---
import { tokenBudgetSchema, handleTokenBudget } from './tools/capabilities/token-budget.js';
import { knowledgeEngineSchema, handleKnowledgeEngine } from './tools/capabilities/knowledge-engine.js';
import { githubScraperSchema, handleGithubScraper } from './tools/capabilities/github-scraper.js';
import { webSearchSchema, handleWebSearch } from './tools/capabilities/web-search.js';
import { promptLibrarySchema, handlePromptLibrary } from './tools/capabilities/prompt-library.js';
import { codeAnalysisSchema, handleCodeAnalysis } from './tools/capabilities/code-analysis.js';
import { autoUpdateSchema, handleAutoUpdate, startAutoUpdateDaemon } from './tools/capabilities/auto-update.js';

// --- Resources ---
import { memoryResources, readMemoryResource } from './resources/memory-resources.js';
import { sentryResources, readSentryResource } from './resources/sentry-resources.js';
import { swarmResources, readSwarmResource } from './resources/swarm-resources.js';

// --- Prompts ---
import { mcpPrompts, getPromptMessages } from './prompts/prompts.js';

// --- Swarm Core ---
import { initSwarm, getOrchestrator } from './swarm/orchestrator.js';
import { registerAllAgents } from './swarm/agent-registry.js';

// --- v4.0 Research Scientist Edition ---
import { memoryBridgeSchema, handleMemoryBridge } from './tools/research/memory_bridge.js';
import { hypothesisGenSchema, handleHypothesisGen } from './tools/research/hypothesis_gen.js';
import { selfEvolutionSchema, handleSelfEvolution } from './tools/research/self_evolution.js';
import { qualityGateSchema, handleQualityGate } from './tools/research/quality_gate.js';
import { stressTestSchema, handleStressTest } from './tools/research/stress_test.js';
import { sentinelSchema, handleSentinel } from './tools/research/sentinel.js';
import { securityScannerSchema, handleSecurityScanner } from './tools/research/security_scanner.js';
import { synthesisEngineSchema, handleSynthesisEngine } from './tools/research/synthesis_engine.js';
import { graphRagSchema, handleGraphRag } from './tools/research/graph_rag.js';
import { llmRouterSchema, handleLlmRouter } from './tools/research/llm_router.js';
import { toolDiscoverySchema, handleToolDiscovery, agenticRagSchema, handleAgenticRag, seedToolCatalog, recordToolUsage } from './tools/research/discovery_rag.js';

// --- MCP Protocol Extensions (v5.0) ---
import { setServerRef, mcpLog, getPromptCompletions, getResourceCompletions, registerPromptCompletion, fetchRoots, LogLevel } from './mcp-extensions.js';

// --- v6.0 MCP Protocol Upgrades ---
import { registerBuiltinSchemas, getOutputSchema, getAllOutputSchemas } from './mcp-protocol/structured-output.js';
import { elicitationSchema, handleElicitation } from './mcp-protocol/elicitation.js';
import { withResourceLinks, autoDetectLinks, entityLink } from './mcp-protocol/resource-links.js';
import { mcpTasksSchema, handleMCPTasks, runAsync } from './mcp-protocol/mcp-tasks.js';
import { oauthSchema, handleOAuth, getProtectedResourceMetadata } from './mcp-protocol/oauth.js';
import { gatewaySchema, handleGateway, recordAudit, detectPromptInjection, checkRateLimit } from './mcp-protocol/gateway.js';
import { sessionSchema, handleSession } from './mcp-protocol/session-manager.js';
import { a2aProtocolSchema, handleA2AProtocol } from './mcp-protocol/a2a-protocol.js';
import { toolSearchSchema, handleToolSearch, registerAllSearchableTools } from './mcp-protocol/tool-search.js';
import { mcpAppsSchema, handleMCPApps } from './mcp-protocol/mcp-apps.js';
import { agentGraphsSchema, handleAgentGraphs } from './mcp-protocol/agent-graphs.js';
import { agenticSamplingSchema, handleAgenticSampling } from './mcp-protocol/agentic-sampling-v2.js';
import { multimodalSchema, handleMultimodal } from './mcp-protocol/multimodal-embeddings.js';
import { dynamicIndexingSchema, handleDynamicIndexing, startAutoProcessing } from './mcp-protocol/dynamic-indexing.js';
import { zeroTrustSchema, handleZeroTrust } from './mcp-protocol/zero-trust.js';

// ============================================================
// Tool Profile System (Lazy Loading)
// ============================================================

type ToolProfile = 'full' | 'minimal' | 'research' | 'coding' | 'ops';

function getToolProfile(): ToolProfile {
  const profile = (process.env.VEGAMCP_TOOL_PROFILE || 'full').toLowerCase();
  if (['full', 'minimal', 'research', 'coding', 'ops'].includes(profile)) {
    return profile as ToolProfile;
  }
  return 'full';
}

// ============================================================
// Server Setup
// ============================================================

const server = new Server(
  {
    name: 'vegamcp',
    version: '7.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},        // MCP Structured Logging
      completions: {},    // MCP Autocomplete
    },
    instructions: 'VegaMCP v6.0 — AI-native MCP server with memory, browser, swarm, research, A2A protocol, MCP Apps (UI), agent graphs, zero-trust identity, gateway security, async tasks (SEP-1686), multimodal embeddings, and agentic sampling v2. Use tool_search to discover tools, graph_rag for retrieval, llm_router for multi-model routing, a2a_protocol for agent communication.',
  }
);

// Set server reference for MCP extensions (sampling, logging, progress, roots)
setServerRef(server);

// ═══════════════════════════════════════════════
// Tool Annotations (MCP 2025 Spec)
// ═══════════════════════════════════════════════
const TOOL_ANNOTATIONS: Record<string, {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}> = {
  // Merged tools
  memory: { title: 'Memory Graph', readOnlyHint: false },
  browser: { title: 'Browser Automation', openWorldHint: true },
  sentry: { title: 'Sentry Error Tracking', readOnlyHint: false, openWorldHint: true },
  swarm: { title: 'Agent Swarm', readOnlyHint: false },
  watcher: { title: 'File Watcher', readOnlyHint: false },
  webhook: { title: 'Webhooks', readOnlyHint: false, openWorldHint: true },
  agent_intel: { title: 'Agent Intelligence', readOnlyHint: true },
  agent_ops: { title: 'Agent Operations', readOnlyHint: false },
  // Research tools
  graph_rag: { title: 'GraphRAG Retrieval', readOnlyHint: true, idempotentHint: true },
  agentic_rag: { title: 'Agentic RAG', readOnlyHint: true },
  tool_discovery: { title: 'Tool Discovery', readOnlyHint: true, idempotentHint: true },
  llm_router: { title: 'Multi-LLM Router', openWorldHint: true },
  memory_bridge: { title: 'Memory Bridge', readOnlyHint: true },
  hypothesis_gen: { title: 'Hypothesis Generator', readOnlyHint: false },
  stress_test: { title: 'Stress Test', readOnlyHint: true },
  sentinel: { title: 'Sentinel Diagnostics', readOnlyHint: true },
  security_scanner: { title: 'Security Scanner', readOnlyHint: true, idempotentHint: true },
  synthesis_engine: { title: 'Synthesis Engine', readOnlyHint: false },
  // Core capability tools
  web_search: { title: 'Web Search', readOnlyHint: true, openWorldHint: true },
  github_scraper: { title: 'GitHub Scraper', readOnlyHint: true, openWorldHint: true },
  code_analysis: { title: 'Code Analysis', readOnlyHint: true, idempotentHint: true },
  analytics: { title: 'Analytics', readOnlyHint: true },
  health_check: { title: 'Health Check', readOnlyHint: true, idempotentHint: true },
  shell: { title: 'Shell Execute', destructiveHint: true, openWorldHint: true },
  filesystem: { title: 'Filesystem', destructiveHint: true },
  // v6.0 tools
  elicit: { title: 'AI Elicitation', readOnlyHint: true },
  mcp_tasks: { title: 'Async Tasks (SEP-1686)', readOnlyHint: false },
  oauth_manage: { title: 'OAuth Management', readOnlyHint: false },
  gateway: { title: 'MCP Gateway', readOnlyHint: true },
  session_manager: { title: 'Session Manager', readOnlyHint: false },
  a2a_protocol: { title: 'A2A Protocol', openWorldHint: true },
  tool_search: { title: 'Tool Search', readOnlyHint: true, idempotentHint: true },
  mcp_apps: { title: 'MCP Apps (UI)', readOnlyHint: true },
  agent_graphs: { title: 'Agent Graphs', readOnlyHint: false },
  agentic_sampling_v2: { title: 'Agentic Sampling v2', readOnlyHint: false },
  multimodal_embeddings: { title: 'Multimodal Embeddings', readOnlyHint: false },
  dynamic_indexing: { title: 'Dynamic Indexing', readOnlyHint: false },
  zero_trust: { title: 'Zero-Trust Identity', readOnlyHint: false },
  auto_update: { title: 'Auto-Update Daemon', readOnlyHint: false, openWorldHint: true },
  mobile_testing: { title: 'Mobile App Testing', readOnlyHint: false, openWorldHint: false },
  web_testing: { title: 'Web Testing Suite', readOnlyHint: true, openWorldHint: true },
  api_testing: { title: 'API Testing Suite', readOnlyHint: true, openWorldHint: true },
  accessibility: { title: 'Accessibility Testing', readOnlyHint: true, openWorldHint: true },
};

// ============================================================
// Merged Tool Schemas (84 → 52 tools)
// ============================================================

const memorySchema = {
  name: 'memory',
  description: 'Knowledge graph operations. Actions: create_entities (create knowledge nodes), create_relations (link entities), add_observations (append facts), search (text search across entities), open_nodes (retrieve by exact name), delete (remove entities).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create_entities', 'create_relations', 'add_observations', 'search', 'open_nodes', 'delete'], description: 'Operation to perform' },
      entities: { type: 'array', description: 'Array of {name, type, domain, observations} for create_entities', items: { type: 'object' } },
      relations: { type: 'array', description: 'Array of {from, to, type} for create_relations', items: { type: 'object' } },
      entity_name: { type: 'string', description: 'Entity name for add_observations' },
      observations: { type: 'array', items: { type: 'string' }, description: 'Facts to add (add_observations)' },
      query: { type: 'string', description: 'Search query (search action)' },
      domain: { type: 'string', description: 'Filter by domain' },
      names: { type: 'array', items: { type: 'string' }, description: 'Entity names (open_nodes, delete)' },
    },
    required: ['action'],
  },
};

async function handleMemoryDispatch(args: any): Promise<any> {
  switch (args.action) {
    case 'create_entities': return handleCreateEntities(args);
    case 'create_relations': return handleCreateRelations(args);
    case 'add_observations': return handleAddObservations(args);
    case 'search': return handleSearchGraph(args);
    case 'open_nodes': return handleOpenNodes(args);
    case 'delete': return handleDeleteEntities(args);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown memory action: ${args.action}` }) }] };
  }
}

const browserSchema = {
  name: 'browser',
  description: 'Browser automation via headless Chromium. Actions: navigate (go to URL), click (click element), type (enter text), screenshot (capture page), snapshot (accessibility tree), execute_js (run JavaScript), console_logs (get logs), close (close browser).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['navigate', 'click', 'type', 'screenshot', 'snapshot', 'execute_js', 'console_logs', 'close'], description: 'Browser action' },
      url: { type: 'string', description: 'URL (navigate)' },
      selector: { type: 'string', description: 'CSS selector (click, type)' },
      text: { type: 'string', description: 'Text to type (type)' },
      script: { type: 'string', description: 'JavaScript code (execute_js)' },
    },
    required: ['action'],
  },
};

async function handleBrowserDispatch(args: any): Promise<any> {
  switch (args.action) {
    case 'navigate': return handleBrowserNavigate(args);
    case 'click': return handleBrowserClick(args);
    case 'type': return handleBrowserType(args);
    case 'screenshot': return handleBrowserScreenshot(args);
    case 'snapshot': return (handleBrowserSnapshot as any)(args);
    case 'execute_js': return handleBrowserExecuteJs(args);
    case 'console_logs': return (handleBrowserConsoleLogs as any)(args);
    case 'close': return handleBrowserClose();
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown browser action: ${args.action}` }) }] };
  }
}

const sentrySchema = {
  name: 'sentry',
  description: 'Sentry error tracking. Actions: search_issues (find errors), get_detail (full issue info), get_breadcrumbs (event trail), resolve (mark resolved).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['search_issues', 'get_detail', 'get_breadcrumbs', 'resolve'], description: 'Sentry action' },
      query: { type: 'string', description: 'Search query (search_issues)' },
      issue_id: { type: 'string', description: 'Issue ID (get_detail, get_breadcrumbs, resolve)' },
    },
    required: ['action'],
  },
};

async function handleSentryDispatch(args: any): Promise<any> {
  switch (args.action) {
    case 'search_issues': return handleSentrySearchIssues(args);
    case 'get_detail': return handleSentryGetIssueDetail(args);
    case 'get_breadcrumbs': return handleSentryGetBreadcrumbs(args);
    case 'resolve': return handleSentryResolveIssue(args);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown sentry action: ${args.action}` }) }] };
  }
}

const swarmSchema = {
  name: 'swarm',
  description: 'Agent swarm orchestration. Actions: create_task, get_status, cancel, list_agents, agent_control, broadcast, get_metrics, register_trigger, run_pipeline.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create_task', 'get_status', 'cancel', 'list_agents', 'agent_control', 'broadcast', 'get_metrics', 'register_trigger', 'run_pipeline'], description: 'Swarm action' },
      task_id: { type: 'string', description: 'Task ID (get_status, cancel)' },
      title: { type: 'string', description: 'Task title (create_task)' },
      description: { type: 'string', description: 'Task description' },
      priority: { type: 'string', description: 'Task priority' },
      agent_id: { type: 'string', description: 'Agent ID (agent_control)' },
      command: { type: 'string', description: 'Control command (agent_control)' },
      message: { type: 'string', description: 'Broadcast message' },
      trigger: { type: 'object', description: 'Trigger config (register_trigger)' },
      pipeline: { type: 'array', description: 'Pipeline steps (run_pipeline)', items: { type: 'object' } },
    },
    required: ['action'],
  },
};

async function handleSwarmDispatch(args: any): Promise<any> {
  switch (args.action) {
    case 'create_task': return handleSwarmCreateTask(args);
    case 'get_status': return handleSwarmGetTaskStatus(args);
    case 'cancel': return handleSwarmCancelTask(args);
    case 'list_agents': return handleSwarmListAgents(args);
    case 'agent_control': return handleSwarmAgentControl(args);
    case 'broadcast': return handleSwarmBroadcast(args);
    case 'get_metrics': return handleSwarmGetMetrics(args);
    case 'register_trigger': return handleSwarmRegisterTrigger(args);
    case 'run_pipeline': return handleSwarmRunPipeline(args);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown swarm action: ${args.action}` }) }] };
  }
}

const watcherSchema = {
  name: 'watcher',
  description: 'File system watchers. Actions: create (watch path for changes), list (show active watchers), delete (stop watching).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'delete'], description: 'Watcher action' },
      path: { type: 'string', description: 'Path to watch (create)' },
      id: { type: 'string', description: 'Watcher ID (delete)' },
      patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns (create)' },
    },
    required: ['action'],
  },
};

async function handleWatcherDispatch(args: any): Promise<any> {
  switch (args.action) {
    case 'create': return handleWatcherCreate(args);
    case 'list': return (handleWatcherList as any)();
    case 'delete': return handleWatcherDelete(args);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown watcher action: ${args.action}` }) }] };
  }
}

const webhookSchema = {
  name: 'webhook',
  description: 'Dynamic webhook endpoints. Actions: create (register endpoint), list (show all), delete (remove), test (fire test event).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'delete', 'test'], description: 'Webhook action' },
      id: { type: 'string', description: 'Webhook ID (delete, test)' },
      url: { type: 'string', description: 'URL (create)' },
      events: { type: 'array', items: { type: 'string' }, description: 'Event types (create)' },
    },
    required: ['action'],
  },
};

async function handleWebhookDispatch(args: any): Promise<any> {
  switch (args.action) {
    case 'create': return handleWebhookCreate(args);
    case 'list': return (handleWebhookList as any)();
    case 'delete': return handleWebhookDelete(args);
    case 'test': return handleWebhookTest(args);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown webhook action: ${args.action}` }) }] };
  }
}

const agentIntelSchema = {
  name: 'agent_intel',
  description: 'Agent intelligence tools. Actions: conversation (inter-agent messaging), dna (agent performance profiles), reasoning_trace (trace reasoning steps).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['conversation', 'dna', 'reasoning_trace'], description: 'Intelligence action' },
      agent_id: { type: 'string', description: 'Agent ID' },
      message: { type: 'string', description: 'Message content (conversation)' },
      thread_id: { type: 'string', description: 'Thread ID (conversation)' },
      trace_id: { type: 'string', description: 'Trace ID (reasoning_trace)' },
    },
    required: ['action'],
  },
};

async function handleAgentIntelDispatch(args: any): Promise<any> {
  const wrap = (fn: (a: any) => string) => ({ content: [{ type: 'text', text: fn(args) }] });
  switch (args.action) {
    case 'conversation': return wrap(handleAgentConversation);
    case 'dna': return wrap(handleAgentDna);
    case 'reasoning_trace': return wrap(handleReasoningTrace);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown agent_intel action: ${args.action}` }) }] };
  }
}

const agentOpsSchema = {
  name: 'agent_ops',
  description: 'Agent operational tools. Actions: data_stream (pub/sub data streams), goal_tracker (track goals/milestones), ab_test (compare model outputs).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['data_stream', 'goal_tracker', 'ab_test'], description: 'Operations action' },
      stream_id: { type: 'string', description: 'Stream ID (data_stream)' },
      goal: { type: 'string', description: 'Goal description (goal_tracker)' },
      test_name: { type: 'string', description: 'Test name (ab_test)' },
      variants: { type: 'array', description: 'Test variants (ab_test)', items: { type: 'object' } },
    },
    required: ['action'],
  },
};

async function handleAgentOpsDispatch(args: any): Promise<any> {
  const wrap = (fn: (a: any) => string) => ({ content: [{ type: 'text', text: fn(args) }] });
  switch (args.action) {
    case 'data_stream': return wrap(handleDataStream);
    case 'goal_tracker': return wrap(handleGoalTracker);
    case 'ab_test': return wrap(handleABTest);
    default: return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown agent_ops action: ${args.action}` }) }] };
  }
}

// ============================================================
// Tool Registry (Consolidated)
// ============================================================

function getAvailableTools(): Array<{ schema: any; handler: (args: any) => Promise<any> }> {
  const tools: Array<{ schema: any; handler: (args: any) => Promise<any> }> = [];
  const profile = getToolProfile();

  // ═══════════════════════════════════════════
  // MEMORY (merged 6→1) — always available
  // ═══════════════════════════════════════════
  tools.push({ schema: memorySchema, handler: handleMemoryDispatch });

  // ═══════════════════════════════════════════
  // REASONING — always available
  // ═══════════════════════════════════════════
  if (process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.KIMI_API_KEY) {
    tools.push({ schema: routeToReasoningModelSchema, handler: handleRouteToReasoningModel });
  }

  // ═══════════════════════════════════════════
  // CORE (always available)
  // ═══════════════════════════════════════════
  tools.push({ schema: tokenBudgetSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleTokenBudget(args) }] }) });
  tools.push({ schema: knowledgeEngineSchema, handler: handleKnowledgeEngine });
  tools.push({ schema: autoUpdateSchema, handler: handleAutoUpdate });
  tools.push({ schema: promptLibrarySchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handlePromptLibrary(args) }] }) });

  if (profile === 'minimal') return tools;

  // ═══════════════════════════════════════════
  // BROWSER (merged 8→1) — full, research
  // ═══════════════════════════════════════════
  if (profile === 'full' || profile === 'research') {
    tools.push({ schema: browserSchema, handler: handleBrowserDispatch });
  }

  // ═══════════════════════════════════════════
  // SENTRY (merged 4→1) — full, ops
  // ═══════════════════════════════════════════
  if ((profile === 'full' || profile === 'ops') && getSentryConfig()) {
    tools.push({ schema: sentrySchema, handler: handleSentryDispatch });
  }

  // ═══════════════════════════════════════════
  // SWARM (merged 9→1) — full, ops
  // ═══════════════════════════════════════════
  if (profile === 'full' || profile === 'ops') {
    tools.push({ schema: swarmSchema, handler: handleSwarmDispatch });
  }

  // ═══════════════════════════════════════════
  // CAPABILITIES — profile-gated
  // ═══════════════════════════════════════════
  if (profile === 'full' || profile === 'coding') {
    tools.push({ schema: sandboxExecuteSchema, handler: handleSandboxExecute });
  }

  if (profile === 'full' || profile === 'ops') {
    tools.push({ schema: apiRequestSchema, handler: handleApiRequest });
    tools.push({ schema: watcherSchema, handler: handleWatcherDispatch });       // merged 3→1
    tools.push({ schema: webhookSchema, handler: handleWebhookDispatch });       // merged 4→1
    tools.push({ schema: workflowExecuteSchema, handler: handleWorkflowExecute });
    tools.push({ schema: scheduleToolSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleScheduleTool(args) }] }) });
    tools.push({ schema: notifyToolSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleNotifyTool(args) }] }) });
  }

  // Agent tools (merged 6→2) — full, research, ops
  if (profile === 'full' || profile === 'research' || profile === 'ops') {
    tools.push({ schema: agentIntelSchema, handler: handleAgentIntelDispatch });
    tools.push({ schema: agentOpsSchema, handler: handleAgentOpsDispatch });
  }

  // ═══════════════════════════════════════════
  // ALWAYS AVAILABLE UTILITIES
  // ═══════════════════════════════════════════
  tools.push({ schema: healthCheckSchema, handler: handleHealthCheck });
  tools.push({ schema: analyticsSchema, handler: handleAnalytics });
  tools.push({ schema: skillsSchema, handler: handleSkills });
  tools.push({ schema: filesystemSchema, handler: handleFilesystem });
  tools.push({ schema: gitToolsSchema, handler: handleGitTools });
  tools.push({ schema: sequentialThinkingSchema, handler: handleSequentialThinking });
  tools.push({ schema: databaseSchema, handler: handleDatabase });
  tools.push({ schema: documentReaderSchema, handler: handleDocumentReader });
  tools.push({ schema: shellSchema, handler: handleShell });
  tools.push({ schema: vaultSchema, handler: handleVault });
  tools.push({ schema: seedDataSchema, handler: handleSeedData });

  // ═══════════════════════════════════════════
  // TESTING SUITE (v7.0) — full, ops
  // ═══════════════════════════════════════════
  if (profile === 'full' || profile === 'ops') {
    tools.push({ schema: mobileTestingSchema, handler: handleMobileTesting });
    tools.push({ schema: webTestingSchema, handler: handleWebTesting });
    tools.push({ schema: apiTestingSchema, handler: handleApiTesting });
    tools.push({ schema: accessibilitySchema, handler: handleAccessibility });
  }

  // ═══════════════════════════════════════════
  // ENHANCED INTELLIGENCE — profile-gated
  // ═══════════════════════════════════════════
  if (profile === 'full' || profile === 'research' || profile === 'coding') {
    tools.push({ schema: githubScraperSchema, handler: handleGithubScraper });
  }
  if ((profile === 'full' || profile === 'research') && (process.env.TAVILY_API_KEY || process.env.SEARXNG_URL)) {
    tools.push({ schema: webSearchSchema, handler: handleWebSearch });
  }
  if (profile === 'full' || profile === 'coding') {
    tools.push({ schema: codeAnalysisSchema, handler: handleCodeAnalysis });
  }

  // ═══════════════════════════════════════════
  // RESEARCH SCIENTIST (v4/v5) — full, research
  // ═══════════════════════════════════════════
  if (profile === 'full' || profile === 'research') {
    tools.push({ schema: memoryBridgeSchema, handler: handleMemoryBridge });
    tools.push({ schema: hypothesisGenSchema, handler: handleHypothesisGen });
    tools.push({ schema: selfEvolutionSchema, handler: handleSelfEvolution });
    tools.push({ schema: qualityGateSchema, handler: handleQualityGate });
    tools.push({ schema: stressTestSchema, handler: handleStressTest });
    tools.push({ schema: sentinelSchema, handler: handleSentinel });
    tools.push({ schema: securityScannerSchema, handler: handleSecurityScanner });
    tools.push({ schema: synthesisEngineSchema, handler: handleSynthesisEngine });
    tools.push({ schema: graphRagSchema, handler: handleGraphRag });
    tools.push({ schema: llmRouterSchema, handler: handleLlmRouter });
    tools.push({ schema: toolDiscoverySchema, handler: handleToolDiscovery });
    tools.push({ schema: agenticRagSchema, handler: handleAgenticRag });
  }

  // ═══════════════════════════════════════════
  // v6.0 PROTOCOL — always available
  // ═══════════════════════════════════════════
  tools.push({ schema: elicitationSchema, handler: handleElicitation });
  tools.push({ schema: mcpTasksSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleMCPTasks(args) }] }) });
  tools.push({ schema: oauthSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleOAuth(args) }] }) });
  tools.push({ schema: gatewaySchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleGateway(args) }] }) });
  tools.push({ schema: sessionSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleSession(args) }] }) });
  tools.push({ schema: a2aProtocolSchema, handler: handleA2AProtocol });
  tools.push({ schema: toolSearchSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleToolSearch(args) }] }) });
  tools.push({ schema: mcpAppsSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleMCPApps(args) }] }) });
  tools.push({ schema: agentGraphsSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleAgentGraphs(args) }] }) });
  tools.push({ schema: agenticSamplingSchema, handler: handleAgenticSampling });
  tools.push({ schema: multimodalSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleMultimodal(args) }] }) });
  tools.push({ schema: dynamicIndexingSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleDynamicIndexing(args) }] }) });
  tools.push({ schema: zeroTrustSchema, handler: async (args: any) => ({ content: [{ type: 'text', text: handleZeroTrust(args) }] }) });

  return tools;
}

// ============================================================
// Request Handlers
// ============================================================

// List available tools (with MCP 2025 annotations)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = getAvailableTools();
  return {
    tools: tools.map(t => {
      const annotations = TOOL_ANNOTATIONS[t.schema.name];
      return {
        name: t.schema.name,
        description: t.schema.description,
        inputSchema: t.schema.inputSchema,
        ...(annotations ? { annotations } : {}),
      };
    }),
  };
});

// Call a tool — with analytics tracking + gateway audit + prompt injection detection
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tools = getAvailableTools();
  const tool = tools.find(t => t.schema.name === name);

  if (!tool) {
    recordToolCall(name, 0, false, 'TOOL_NOT_FOUND');
    recordAudit({ toolName: name, userId: 'system', args: args || {}, durationMs: 0, success: false, error: 'TOOL_NOT_FOUND' });
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'TOOL_NOT_FOUND', message: `Unknown tool: ${name}. Available tools: ${tools.map(t => t.schema.name).join(', ')}` } }) }],
    };
  }

  // Gateway: Prompt injection detection
  const injection = detectPromptInjection(args || {});
  if (injection.detected) {
    recordAudit({ toolName: name, userId: 'system', args: args || {}, durationMs: 0, success: false, blocked: true, blockReason: `Prompt injection detected: ${injection.pattern}` });
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'BLOCKED', message: `Request blocked: suspicious pattern detected in field '${injection.field}'` } }) }],
    };
  }

  // Gateway: Rate limiting
  const rateCheck = checkRateLimit(name, 'system');
  if (!rateCheck.allowed) {
    recordAudit({ toolName: name, userId: 'system', args: args || {}, durationMs: 0, success: false, blocked: true, blockReason: 'Rate limit exceeded' });
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded. Try again shortly.' } }) }],
    };
  }

  const callStart = Date.now();
  try {
    const result = await tool.handler(args || {});
    const durationMs = Date.now() - callStart;
    recordToolCall(name, durationMs, true);
    recordToolUsage(name); // Track in tool discovery catalog
    recordAudit({ toolName: name, userId: 'system', args: args || {}, durationMs, success: true });
    return result;
  } catch (err: any) {
    const durationMs = Date.now() - callStart;
    recordToolCall(name, durationMs, false, err.message);
    recordAudit({ toolName: name, userId: 'system', args: args || {}, durationMs, success: false, error: err.message });
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'TOOL_ERROR', message: err.message } }) }],
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [...memoryResources, ...swarmResources];

  // Only include Sentry resources if configured
  if (getSentryConfig()) {
    resources.push(...sentryResources);
  }

  return { resources };
});

// Read a resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri.startsWith('memory://')) {
    return {
      contents: [{ uri, text: readMemoryResource(uri), mimeType: 'application/json' }],
    };
  }

  if (uri.startsWith('swarm://')) {
    return {
      contents: [{ uri, text: readSwarmResource(uri), mimeType: 'application/json' }],
    };
  }

  if (uri.startsWith('sentry://')) {
    const text = await readSentryResource(uri);
    return {
      contents: [{ uri, text, mimeType: 'application/json' }],
    };
  }

  return {
    contents: [{ uri, text: JSON.stringify({ error: `Unknown resource URI: ${uri}` }), mimeType: 'application/json' }],
  };
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: mcpPrompts };
});

// Get a prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const prompt = mcpPrompts.find(p => p.name === name);

  if (!prompt) {
    return {
      messages: [{ role: 'user', content: { type: 'text', text: `Unknown prompt: ${name}` } as any }],
    };
  }

  const messages = getPromptMessages(name, (args || {}) as Record<string, string>);
  return {
    messages: messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  };
});

// ═══════════════════════════════════════════════
// MCP Completion (Autocomplete for prompts/resources)
// ═══════════════════════════════════════════════
server.setRequestHandler(CompleteRequestSchema, async (request) => {
  const ref = request.params.ref;
  const arg = request.params.argument;

  if (ref.type === 'ref/prompt') {
    const completions = getPromptCompletions(ref.name, arg.name, arg.value || '');
    return { completion: completions };
  }

  if (ref.type === 'ref/resource') {
    const completions = getResourceCompletions(ref.uri, arg.value || '');
    return { completion: completions };
  }

  return { completion: { values: [] } };
});

// ═══════════════════════════════════════════════
// MCP SetLevel (Structured Logging Level Control)
// ═══════════════════════════════════════════════
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  const level = request.params.level as LogLevel;
  await mcpLog('info', `Log level set to: ${level}`, 'vegamcp');
  return {};
});

// ============================================================
// Server Lifecycle
// ============================================================

async function main(): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.resolve(process.env.DATA_DIR || './data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize database
  await initGraphStore(dataDir);

  // Initialize swarm
  const orchestrator = await initSwarm();
  const agents = registerAllAgents();

  // 🔧 FIX: Actually start all agents so the swarm can process tasks
  await orchestrator.startAllAgents();

  // Auto-seed knowledge engine with project docs
  autoPopulateKnowledge(dataDir).catch(err => {
    console.error(`[VegaMCP] Knowledge seeding error: ${err.message}`);
  });

  // Auto-seed default skills
  handleSkills({ action: 'seed_defaults' }).catch(err => {
    console.error(`[VegaMCP] Skills seeding error: ${err.message}`);
  });

  // Auto-seed PolyAlgo algorithms, EasyPrompts, and BugTaxonomy
  try { autoSeed(); } catch (e: any) { console.error(`[VegaMCP] Seed data error: ${e.message}`); }

  // Seed tool discovery catalog with all built-in tools
  try {
    const allTools = getAvailableTools();
    seedToolCatalog(allTools.map(t => ({ name: t.schema.name, description: t.schema.description || '' })));
  } catch (e: any) { console.error(`[VegaMCP] Tool catalog seed error: ${e.message}`); }

  // v6.0: Register structured output schemas for all tools
  try { registerBuiltinSchemas(); } catch (e: any) { console.error(`[VegaMCP] Schema registry error: ${e.message}`); }

  // v6.0: Seed tool search with all registered tools
  try {
    const allToolsForSearch = getAvailableTools();
    registerAllSearchableTools(allToolsForSearch);
  } catch (e: any) { console.error(`[VegaMCP] Tool search seed error: ${e.message}`); }

  // v6.0: Start dynamic indexing auto-processing
  try { startAutoProcessing(10000); } catch (e: any) { console.error(`[VegaMCP] Dynamic indexing error: ${e.message}`); }

  // Register prompt completions for autocomplete
  try {
    registerPromptCompletion('analyze_code', 'language', () => ({
      values: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'c++'],
    }));
    registerPromptCompletion('swarm_task', 'task_type', () => ({
      values: ['research', 'analysis', 'coding', 'review', 'planning', 'documentation'],
    }));
  } catch { /* ignore */ }

  // Log available modules to stderr (not stdout — that's for MCP messages)
  const sentryEnabled = !!getSentryConfig();
  const reasoningEnabled = !!(process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.KIMI_API_KEY);
  const profile = getToolProfile();
  const tools = getAvailableTools();
  const quiet = process.env.VEGAMCP_QUIET === 'true';

  if (quiet) {
    // Compact single-line output to avoid PowerShell stderr popups
    console.error(`[VegaMCP v7.0.0] ${tools.length} tools | ${agents.length} agents | profile=${profile}`);
  } else {
    console.error(`╔══════════════════════════════════════════════════════════════════╗`);
    console.error(`║      VegaMCP Server v7.0.0 — Full Spectrum Testing Edition      ║`);
    console.error(`╠══════════════════════════════════════════════════════════════════╣`);
    console.error(`║  Core:                                                          ║`);
    console.error(`║    🧠 Memory Graph       ✅ Active                              ║`);
    console.error(`║    🧪 Playwright Browser ✅ Active (lazy-init)                  ║`);
    console.error(`║    🔍 Sentry             ${(sentryEnabled ? '✅ Active' : '⬚  Not configured').padEnd(36)}  ║`);
    console.error(`║    🤖 Reasoning Router   ${(reasoningEnabled ? '✅ Active' : '⬚  Not configured').padEnd(36)}  ║`);
    console.error(`║                                                                  ║`);
    console.error(`║  v5.0 Full Spectrum:                                             ║`);
    console.error(`║    🔗 GraphRAG           ✅ Hybrid retrieval (vector+graph)      ║`);
    console.error(`║    🧭 LLM Router        ✅ Multi-model intelligent routing      ║`);
    console.error(`║    🔎 Tool Discovery     ✅ Dynamic catalog (SQLite)             ║`);
    console.error(`║    🤖 Agentic RAG       ✅ Autonomous multi-step retrieval      ║`);
    console.error(`║                                                                  ║`);
    console.error(`║  v6.0 Protocol Supremacy (17 new features):                      ║`);
    console.error(`║    📋 Structured Output  ✅ outputSchema + structuredContent     ║`);
    console.error(`║    💬 AI Elicitation     ✅ AI-driven input via Sampling         ║`);
    console.error(`║    🔗 Resource Links     ✅ Lazy context in tool results         ║`);
    console.error(`║    ⚡ MCP Tasks          ✅ Async SEP-1686 (call-now/fetch-later)║`);
    console.error(`║    🔐 OAuth 2.1          ✅ RFC 9728 Protected Resource          ║`);
    console.error(`║    🛡️ MCP Gateway        ✅ Audit + injection detection          ║`);
    console.error(`║    📍 Session Manager    ✅ Resumable sessions                   ║`);
    console.error(`║    🌐 A2A Protocol       ✅ Agent-to-Agent (Google standard)     ║`);
    console.error(`║    🔍 Tool Search        ✅ Lazy loading (10x context savings)   ║`);
    console.error(`║    🎨 MCP Apps           ✅ Interactive HTML dashboards          ║`);
    console.error(`║    🕸️ Agent Graphs       ✅ Hierarchical DAG orchestration       ║`);
    console.error(`║    🧠 Agentic Sampling   ✅ Server-side agent loops              ║`);
    console.error(`║    🎵 Multimodal Embed   ✅ Text+image+audio vector search       ║`);
    console.error(`║    📡 Dynamic Indexing   ✅ Real-time event-driven reindex       ║`);
    console.error(`║    🔒 Zero-Trust         ✅ Agent identity + behavior analysis   ║`);
    console.error(`║    🔄 Scope Consent      ✅ WWW-Authenticate challenges          ║`);
    console.error(`║    ⏮️ Session Resume     ✅ Mcp-Session-Id reconnection          ║`);
    console.error(`║                                                                  ║`);
    console.error(`║  v7.0 Testing Suite (4 AI-first testing tools):                   ║`);
    console.error(`║    📱 Mobile Testing     ✅ Android + iOS (30+ actions)          ║`);
    console.error(`║    🌐 Web Testing        ✅ Lighthouse, CWV, responsive, forms   ║`);
    console.error(`║    🔌 API Testing        ✅ Contract, load, sequence, diff       ║`);
    console.error(`║    ♿ Accessibility      ✅ WCAG, contrast, keyboard, ARIA       ║`);
    console.error(`║                                                                  ║`);
    console.error(`║  Swarm:                                                          ║`);
    console.error(`║    🐝 Orchestrator       ✅ Active (adaptive tick rate)          ║`);
    console.error(`║    🎯 Agents             ${String(agents.length).padStart(2)} started                          ║`);
    console.error(`║                                                                  ║`);
    console.error(`║  Config:                                                         ║`);
    console.error(`║    🎯 Profile            ${profile.padEnd(40)}  ║`);
    console.error(`║    🔧 Tools              ${String(tools.length).padStart(2)} registered                        ║`);
    console.error(`║    📁 Data               ${dataDir.slice(0, 40).padEnd(40)}  ║`);
    console.error(`╚══════════════════════════════════════════════════════════════════╝`);
  }

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Post-connect: fetch roots from client (async, non-blocking)
  fetchRoots().catch(() => {});

  // Start auto-update daemon (refreshes knowledge base in background)
  startAutoUpdateDaemon();
}

// ============================================================
// Auto-Populate Knowledge Engine
// ============================================================

import {
  addToVectorStore,
  getVectorStoreStats,
} from './db/vector-store.js';

async function autoPopulateKnowledge(dataDir: string): Promise<void> {
  const stats = getVectorStoreStats();
  const currentEntries = stats.totalEntries || 0;

  // Only seed if knowledge is nearly empty (< 5 entries)
  if (currentEntries >= 5) {
    console.error(`[VegaMCP] Knowledge engine has ${currentEntries} entries — skipping auto-seed`);
    return;
  }

  console.error('[VegaMCP] Auto-populating knowledge engine...');
  let seeded = 0;

  // Seed from project documentation files
  const projectRoot = path.resolve(__dirname, '..');
  const docFiles = [
    { file: 'README.md', category: 'project' },
    { file: 'docs/ARCHITECTURE.md', category: 'architecture' },
    { file: 'docs/MEMORY_MODULE.md', category: 'module' },
    { file: 'docs/BROWSER_MODULE.md', category: 'module' },
    { file: 'docs/REASONING_MODULE.md', category: 'module' },
    { file: 'docs/SENTRY_MODULE.md', category: 'module' },
    { file: 'docs/SECURITY.md', category: 'security' },
    { file: 'docs/SETUP.md', category: 'setup' },
    { file: 'VEGAMCP_SWARM_ARCHITECTURE.md', category: 'architecture' },
    // UsefulCode knowledge sources
    { file: 'UsefulCode/EasyPrompts/Generted.txt', category: 'prompt-templates' },
    { file: 'UsefulCode/EasyPrompts/README.md', category: 'tool-description' },
    { file: 'UsefulCode/GitScraper/analyzer.py', category: 'code-pattern' },
    { file: 'UsefulCode/GitScraper/engine.py', category: 'code-pattern' },
    { file: 'UsefulCode/GitScraper/github_async.py', category: 'code-pattern' },
    { file: 'UsefulCode/GitScraper/utils.py', category: 'code-pattern' },
    { file: 'UsefulCode/GitScraper/harvester.py', category: 'code-pattern' },
  ];

  for (const { file, category } of docFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Split into chunks of ~1500 chars for better search granularity
        const chunks = splitIntoChunks(content, 1500);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk.trim().length < 50) continue; // Skip tiny chunks
          await addToVectorStore(
            `doc:${path.basename(file, '.md')}:chunk${i}`,
            chunk,
            'knowledge',
            { source: file, category, chunkIndex: i, totalChunks: chunks.length }
          );
          seeded++;
        }
      } catch (err: any) {
        console.error(`[VegaMCP] Failed to seed ${file}: ${err.message}`);
      }
    }
  }

  // Seed core concepts about the server itself
  const coreConcepts = [
    {
      id: 'concept:vegamcp-overview',
      content: 'VegaMCP is a production-grade MCP server providing 50+ tools including persistent memory graph, browser automation via Playwright, multi-model reasoning (DeepSeek, Kimi, GPT-4o, Claude, Ollama), agent swarm with 10 specialized agents, knowledge engine with vector search, GitHub scraper, web search, code analysis, and more.',
      metadata: { type: 'concept', category: 'core' },
    },
    {
      id: 'concept:swarm-architecture',
      content: 'VegaMCP Agent Swarm: 10 agents across 3 coordinators. Research (researcher, analyst, writer, coder, planner), Quality (reviewer, critic), Operations (integrator, monitor, summarizer). Task routing via type map, priority queue, 2-second polling. Agents can think via LLM, access memory graph, communicate via messages.',
      metadata: { type: 'concept', category: 'swarm' },
    },
    {
      id: 'concept:tool-profiles',
      content: 'VegaMCP Tool Profiles: full (all tools), minimal (memory+reasoning only), research (memory+reasoning+browser+search), coding (memory+reasoning+sandbox+code-analysis), ops (memory+swarm+watchers+webhooks). Set via VEGAMCP_TOOL_PROFILE env var.',
      metadata: { type: 'concept', category: 'config' },
    },
    {
      id: 'concept:supported-models',
      content: 'VegaMCP supports 11 model providers: DeepSeek (R1, Chat), Kimi/Moonshot (K2.5), OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Meta (Llama 405B), Google (Gemini 2.0/2.5), Groq (Llama 3.3 70B, Mixtral), Mistral (Large, Codestral), Together AI (Qwen 2.5 72B), xAI (Grok 3 Mini), Ollama (any local model).',
      metadata: { type: 'concept', category: 'models' },
    },
    {
      id: 'concept:skills-system',
      content: 'VegaMCP Skills System: file-based instruction folders with SKILL.md. Features auto-activation triggers, version tracking, usage analytics, ratings, vector search discovery, GitHub import, and 10 built-in skills covering code-review, debug, architecture, testing, security, refactoring, API design, performance, docs, and git.',
      metadata: { type: 'concept', category: 'skills' },
    },
  ];

  for (const concept of coreConcepts) {
    try {
      await addToVectorStore(concept.id, concept.content, 'knowledge', concept.metadata);
      seeded++;
    } catch { /* skip duplicates */ }
  }

  // Seed some code snippets
  const codeSnippets = [
    {
      id: 'snippet:mcp-tool-schema',
      content: `// MCP Tool Schema Pattern (TypeScript)
export const myToolSchema = {
  name: 'tool_name',
  description: 'What this tool does',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['action1', 'action2'] },
      query: { type: 'string', description: 'Search query' },
    },
    required: ['action'],
  },
};

export async function handleMyTool(args: any) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}`,
      metadata: { language: 'typescript', pattern: 'mcp-tool' },
    },
    {
      id: 'snippet:swarm-agent',
      content: `// Swarm Agent Pattern (TypeScript)
import { SwarmAgent } from '../agent-base.js';
import type { TaskPayload, TaskResult } from '../types.js';

export class MyAgent extends SwarmAgent {
  constructor() {
    super({
      agentId: 'my-agent',
      agentName: 'My Agent',
      role: 'researcher',
      coordinator: 'research',
      modelPref: 'deepseek/deepseek-r1',
      personality: 'You are an expert...',
      capabilities: ['research', 'analysis'],
      maxConcurrentTasks: 3,
      heartbeatIntervalMs: 30000,
      taskTimeoutMs: 120000,
    });
  }

  async processTask(payload: TaskPayload): Promise<TaskResult> {
    const result = await this.think(JSON.stringify(payload.input), payload.input);
    this.storeObservation('result', 'concept', result.content.slice(0, 200));
    return { success: true, output: { result: result.content } };
  }
}`,
      metadata: { language: 'typescript', pattern: 'swarm-agent' },
    },
  ];

  for (const snippet of codeSnippets) {
    try {
      await addToVectorStore(snippet.id, snippet.content, 'code_snippets', snippet.metadata);
      seeded++;
    } catch { /* skip */ }
  }

  console.error(`[VegaMCP] Knowledge engine seeded: ${seeded} entries added`);
}

function splitIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const sections = text.split(/\n#{1,3}\s+/); // Split by markdown headers
  let current = '';

  for (const section of sections) {
    if (current.length + section.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = section;
    } else {
      current += '\n' + section;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.error('[VegaMCP] Shutting down...');
  
  // Stop swarm
  try {
    const orchestrator = getOrchestrator();
    await orchestrator.stopAllAgents();
  } catch { /* swarm may not be initialized */ }

  // Close watchers
  closeAllWatchers();
  
  // Close browser
  await closeBrowser();
  
  // Close database
  closeGraphStore();
  
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('[VegaMCP] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (err: any) => {
  console.error('[VegaMCP] Unhandled rejection:', err?.message || err);
});

// Start the server
main().catch((err) => {
  console.error('[VegaMCP] Fatal error:', err);
  process.exit(1);
});
