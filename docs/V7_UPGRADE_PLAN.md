# VegaMCP v7.0 — Cross-Agent Compatibility Upgrade Plan

> **Goal:** Make VegaMCP seamlessly work across all AI agents (Claude Code, Codex CLI, Kimi Code, ChatGPT, etc.) while maintaining protocol supremacy.

---

## Executive Summary

| Aspect | Current State (v6.0) | Target State (v7.0) |
|--------|---------------------|---------------------|
| **Tools** | 60+ granular tools | **15 unified capability clusters** |
| **Protocol** | MCP native | MCP + A2A + SKILL.md bridge |
| **Agent Support** | Generic MCP clients | Native integration with Claude Code, Codex CLI, Kimi Code |
| **Tool Discovery** | `tool_search` via embeddings | SKILL.md registry + natural language matching |
| **Invocation** | Direct tool calls | Model-invoked skills + recursive sub-agents |
| **Context** | Resource links | Progressive disclosure + lazy loading |
| **Sandbox** | Local Node.js | Multi-environment (Docker, Modal, E2B) via RLM pattern |

---

## Phase 0: Tool Consolidation (Week 0-1) — Foundation for Cross-Agent Success

> **Goal:** Reduce 60+ tools to **15 core capability clusters** that work reliably across all AI agents.

### Problem: Tool Count Bloat

Current v6.0 has **60+ tools**, which causes:
- **Context overflow** — Tool descriptions consume 30-40% of available context
- **Poor model performance** — Harder for models to select correct tools
- **Inconsistent behavior** — Different agents handle large tool sets differently
- **Setup friction** — More tools = more auto-approval decisions, more permission prompts

### Target: 15 Core Capability Clusters

| Cluster | Current Tools | Consolidated Into | Action Count |
|---------|--------------|-------------------|--------------|
| **🧠 memory** | 6 tools (already merged) | `memory` | 6 actions |
| **🌐 web** | browser_navigate, browser_click, browser_type, browser_screenshot, browser_snapshot, browser_execute_js, browser_console_logs, browser_close, web_search, github_scraper | `web` | 10 actions |
| **💻 code** | sandbox_execute, code_analysis, shell, filesystem, git_tools, document_reader, sequential_thinking | `code` | 7 actions |
| **🤖 ai** | route_to_reasoning_model, llm_router, knowledge_engine, graph_rag, agentic_rag, tool_discovery, hypothesis_gen, synthesis_engine | `ai` | 8 actions |
| **🐝 swarm** | 9 tools (already merged) | `swarm` | 9 actions |
| **📊 data** | database, analytics, ab_test, data_streams, vault | `data` | 5 actions |
| **🔧 ops** | watcher, webhook, workflow, schedule, notify, api_request, health_check, auto_update | `ops` | 8 actions |
| **🛡️ security** | security_scanner, sentinel, stress_test, quality_gate | `security` | 5 actions |
| **🎨 create** | mcp_apps, prompt_library, skills | `create` | 3 actions |
| **⚡ protocol** | elicit, mcp_tasks, oauth, gateway, session, a2a_protocol, tool_search, agent_graphs, agentic_sampling, multimodal, dynamic_indexing | `protocol` | 11 actions |
| **🐛 sentry** | 4 tools (already merged) | `sentry` | 4 actions |
| **🎯 intel** | agent_intel, agent_ops | `intel` | 3 actions |
| **🌍 web_testing** | *NEW* — Lighthouse, visual regression, responsive, Core Web Vitals, console audit, link checker | `web_testing` | 10 actions |
| **🔌 api_testing** | *NEW* — Contract testing, load testing, sequence testing, mock server, endpoint discovery | `api_testing` | 8 actions |
| **♿ accessibility** | *NEW* — WCAG compliance, color contrast, keyboard nav, ARIA audit, screen reader simulation | `accessibility` | 6 actions |

**Result:** 15 tools instead of 60+, with ~100+ actions total.

### Design Pattern: Unified Action Schema

```typescript
// src/tools/unified-schema.ts
export interface UnifiedTool {
  name: string;
  description: string;
  // Single unified schema with action discriminator
  inputSchema: {
    type: 'object';
    properties: {
      action: { 
        type: 'string'; 
        enum: string[];  // All available actions
        description: 'The specific operation to perform';
      };
      // Action-specific parameters using oneOf
      params: {
        oneOf: ActionParameterSchema[];
      };
    };
    required: ['action'];
  };
}

// Example: Web tool schema
export const webToolSchema: UnifiedTool = {
  name: 'web',
  description: `Web interaction toolkit. Actions:
- browse: Navigate, click, type, screenshot (browser automation)
- search: Web search with Tavily/SearXNG
- github: Search repos, issues, code on GitHub
- fetch: Direct HTTP fetch with parsing`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['browse', 'search', 'github', 'fetch'],
      },
      // Sub-schema selected by action
      browse: { /* browser params */ },
      search: { query: string, limit?: number },
      github: { /* github params */ },
      fetch: { url: string, method?: string },
    },
  },
};
```

### Smart Action Routing

Internal dispatcher routes to specialized handlers:

```typescript
// src/tools/dispatch.ts
const actionHandlers: Record<string, Record<string, Handler>> = {
  web: {
    browse: handleBrowseAction,      // Uses Playwright
    search: handleSearchAction,      // Uses Tavily/SearXNG
    github: handleGithubAction,      // Uses GitHub API
    fetch: handleFetchAction,        // Uses fetch API
  },
  code: {
    execute: handleSandboxExecute,   // Python/JS sandbox
    analyze: handleCodeAnalysis,     // AST analysis
    shell: handleShellExecute,       // Terminal
    file: handleFilesystem,          // File ops
    git: handleGitTools,             // Git commands
    read: handleDocumentReader,      // Doc parsing
    think: handleSequentialThinking, // Step-by-step
  },
  ai: {
    reason: handleReasoning,         // Multi-model routing
    search: handleKnowledgeSearch,   // Vector search
    rag: handleGraphRag,             // Hybrid retrieval
    discover: handleToolDiscovery,   // Tool matching
    hypothesize: handleHypothesisGen,// Generate hypotheses
    synthesize: handleSynthesisEngine,// Combine results
  },
  // ... etc
};

export async function dispatch(tool: string, action: string, args: any) {
  const handler = actionHandlers[tool]?.[action];
  if (!handler) throw new Error(`Unknown action: ${tool}.${action}`);
  return handler(args);
}
```

### Progressive Disclosure Pattern

Tools expose minimal surface area by default, expand on demand:

```typescript
// src/tools/progressive-disclosure.ts
export interface ToolManifest {
  // Always visible (core description)
  summary: string;
  // Shown when tool is relevant to task
  description: string;
  // Shown when tool is selected
  actions: ActionManifest[];
  // Shown when action is selected
  parameters: ParameterManifest;
}

// Client receives only what's needed for current context
export function getToolView(
  tool: UnifiedTool, 
  context: TaskContext
): ToolView {
  // If no task context, return summary only
  if (!context) return { summary: tool.summary };
  
  // If task mentions "web" or "browser", return full web tool
  if (mentionsTopic(context, 'web')) {
    return {
      summary: tool.summary,
      description: tool.description,
      actions: tool.actions,
    };
  }
  
  // Otherwise return compressed view
  return { summary: tool.summary };
}
```

### Capability-Gated Tool Loading

Instead of profiles that hide tools, use capability tokens:

```typescript
// src/tools/capability-tokens.ts
export interface CapabilitySet {
  core: ['memory', 'ai', 'code'];      // Always available
  research: ['web', 'data'];           // Needs research context
  ops: ['ops', 'security', 'swarm'];   // Needs ops context
  protocol: ['protocol', 'intel'];     // Advanced features
}

// Client requests capabilities, not tools
export function getToolsForCapabilities(
  caps: Capability[],
  context: TaskContext
): UnifiedTool[] {
  const tools: UnifiedTool[] = [];
  
  for (const cap of caps) {
    switch (cap) {
      case 'research':
        // Web tool loads with browse+search actions
        tools.push(getWebTool(['browse', 'search', 'github']));
        break;
      case 'coding':
        // Code tool loads with execute+analyze+file+git actions
        tools.push(getCodeTool(['execute', 'analyze', 'file', 'git']));
        break;
      // ... etc
    }
  }
  
  return tools;
}
```

### Backward Compatibility Layer

Old tool names map to new unified tools:

```typescript
// src/compatibility/tool-aliases.ts
export const toolAliases: Record<string, { tool: string; action: string }> = {
  // Memory tools (already merged in v6)
  'create_entities': { tool: 'memory', action: 'create_entities' },
  'create_relations': { tool: 'memory', action: 'create_relations' },
  
  // Browser tools → web.browse
  'browser_navigate': { tool: 'web', action: 'browse' },
  'browser_click': { tool: 'web', action: 'browse' },
  'browser_screenshot': { tool: 'web', action: 'browse' },
  
  // Web search → web.search
  'web_search': { tool: 'web', action: 'search' },
  'github_scraper': { tool: 'web', action: 'github' },
  
  // Code tools → code.*
  'sandbox_execute': { tool: 'code', action: 'execute' },
  'code_analysis': { tool: 'code', action: 'analyze' },
  'shell': { tool: 'code', action: 'shell' },
  
  // AI tools → ai.*
  'route_to_reasoning_model': { tool: 'ai', action: 'reason' },
  'llm_router': { tool: 'ai', action: 'reason' },
  'knowledge_engine': { tool: 'ai', action: 'search' },
  'graph_rag': { tool: 'ai', action: 'rag' },
  
  // ... etc
};

// Intercept old tool calls and route to new system
export async function handleLegacyToolCall(
  name: string, 
  args: any
): Promise<any> {
  const alias = toolAliases[name];
  if (!alias) throw new Error(`Unknown legacy tool: ${name}`);
  
  return dispatch(alias.tool, alias.action, {
    ...args,
    _legacyTool: name,  // Hint for behavior matching
  });
}
```

### Token Efficiency Architecture

Beyond simple consolidation, v7.0 implements **hierarchical tool descriptions** for maximum token efficiency:

```
Level 1 (Always): Tool summaries only
  "web: Browse, search, GitHub access"
  15 tools × 20 tokens = 300 tokens

Level 2 (On relevance): Expanded tool descriptions
  "web: Browser automation, search, GitHub
   Actions: browse, search, github, fetch"
  +80 tokens per expanded tool

Level 3 (At call time): Full action schema
  Detailed parameters for selected action
  +150 tokens at call time only
```

**Result:** 90% reduction in baseline token usage (12,000 → 1,200 tokens)

### Smart Relevance Scoring

Tools are ranked and only top-N are expanded based on context budget:

```typescript
// Relevance scoring based on:
// - Keyword matching in task description
// - Historical usage patterns
// - Task type classification
// - File extension hints

// With 32k context: Show 12 summaries + expand top 3 (~500 tokens)
// With 128k context: Show 12 summaries + expand top 6 (~1,200 tokens)
```

### Implementation Steps

1. **Week 0.1:** Create unified schema system + dispatch layer + token budget manager
2. **Week 0.2:** Migrate tool groups (web, code, ai, ops) with hierarchical descriptions
3. **Week 0.3:** Add backward compatibility layer + relevance scoring
4. **Week 0.4:** Test with all 3 clients (Kimi, Claude, Codex) + benchmark token usage

### Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| **Tool count** | 60+ | 12 |
| **Tool description tokens** | ~12,000 tokens | ~1,200 tokens (90% reduction) |
| **Context available for tasks** | ~89% | ~99% of context window |
| **Tool selection accuracy** | ~75% | ~95% |
| **Setup time** | 5 min | < 2 min |
| **Permission prompts** | 15+ | 4-5 |
| **Backward compatibility** | N/A | 100% (complete alias layer) |
| **Capability coverage** | 100% | 100%+ (all preserved + enhanced) |

---

## Phase 1: SKILL.md Bridge (Week 1-2)

### 1.1 Export Tools as SKILL.md

Create a converter that transforms VegaMCP tools into the open SKILL.md format:

```typescript
// src/compatibility/skill-exporter.ts
export function toolToSkill(tool: Tool): Skill {
  return {
    name: tool.schema.name,
    description: tool.schema.description,
    // Auto-generate from inputSchema
    parameters: jsonSchemaToParameters(tool.schema.inputSchema),
    // Extract examples from tool annotations
    examples: extractExamples(tool),
    // Map to appropriate trigger patterns
    triggers: inferTriggers(tool),
  };
}
```

**Output:** Each tool gets a corresponding `.claude/skills/vegamcp-{tool}.md` compatible file.

### 1.2 Import External Skills

Allow VegaMCP to consume external SKILL.md files as first-class tools:

```typescript
// src/compatibility/skill-loader.ts
export async function loadSkillFromPath(path: string): Promise<Tool> {
  const skill = await parseSkillMd(path);
  return {
    name: `skill_${skill.name}`,
    description: skill.description,
    inputSchema: parametersToJsonSchema(skill.parameters),
    handler: createSkillHandler(skill),
  };
}
```

**Benefit:** VegaMCP can load 280k+ skills from SkillsMP marketplace.

---

## Phase 2: Multi-Agent Transport Layer (Week 2-3)

### 2.1 Unified Configuration

Create a cross-compatible MCP configuration that works everywhere:

```jsonc
// ~/.kimi/mcp.json (Kimi Code)
// ~/.claude/mcp.json (Claude Code)
// ~/.codex/mcp.json (Codex CLI)
{
  "mcpServers": {
    "vegamcp": {
      "command": "node",
      "args": ["/path/to/VegaMCP/build/index.js"],
      "env": {
        "VEGAMCP_TOOL_PROFILE": "adaptive",
        "VEGAMCP_AGENT_MODE": "true",
        // Keys loaded from parent environment
      },
      "disabled": false,
      "autoApprove": ["memory", "knowledge_engine", "tool_search"]
    }
  }
}
```

### 2.2 Agent Detection & Adaptation

VegaMCP detects which client is connecting and adapts its behavior:

```typescript
// src/compatibility/agent-detector.ts
export function detectAgentClient(request: MCPRequest): AgentClient {
  const headers = request.meta?.headers || {};
  if (headers['x-claude-client']) return 'claude-code';
  if (headers['x-kimi-client']) return 'kimi-code';
  if (headers['x-codex-client']) return 'codex-cli';
  return 'generic';
}

// Adapt tool descriptions based on client
export function adaptToolsForClient(tools: Tool[], client: AgentClient): Tool[] {
  switch (client) {
    case 'claude-code':
      // Use Claude-specific prompt engineering patterns
      return tools.map(t => ({
        ...t,
        description: optimizeForClaude(t.description)
      }));
    case 'kimi-code':
      // Use Kimi-optimized descriptions
      return tools.map(t => ({
        ...t,
        description: optimizeForKimi(t.description)
      }));
    // ... etc
  }
}
```

---

## Phase 3: Recursive Agent Kernel (Week 3-4)

### 3.1 RLM Integration

Adopt the Recursive Language Model pattern from MIT's RLM:

```typescript
// src/recursion/recursive-agent.ts
export interface RecursiveContext {
  // REPL-like environment for stateful execution
  variables: Map<string, any>;
  // Stack of sub-LM calls
  callStack: SubLMCall[];
  // Sandboxed execution environment
  sandbox: SandboxEnvironment;
}

export class RecursiveAgent {
  async complete(prompt: string, context: RecursiveContext): Promise<RLMResult> {
    // 1. Model generates code + sub-calls
    const response = await this.llm.generate(prompt, {
      tools: this.getAvailableTools(),
      context: context.variables,
    });

    // 2. Execute code in sandbox
    if (response.code) {
      const result = await context.sandbox.execute(response.code);
      context.variables.set('result', result);
    }

    // 3. Handle recursive sub-calls
    for (const subCall of response.subCalls) {
      const subResult = await this.complete(subCall.prompt, {
        ...context,
        callStack: [...context.callStack, subCall],
      });
      context.variables.set(subCall.id, subResult);
    }

    // 4. Return final response
    return { response: response.finalAnswer, context };
  }
}
```

### 3.2 Multi-Sandbox Support

Support pluggable sandbox environments:

| Environment | Use Case | Isolation |
|-------------|----------|-----------|
| `local` | Quick dev tasks | None (host process) |
| `docker` | CI/CD pipelines | Container |
| `modal` | Serverless compute | Cloud sandbox |
| `e2b` | Secure code execution | Cloud sandbox |
| `prime` | Distributed agents | Beta cloud |

```typescript
// src/sandbox/sandbox-factory.ts
export function createSandbox(type: SandboxType): Sandbox {
  switch (type) {
    case 'local': return new LocalSandbox();
    case 'docker': return new DockerSandbox();
    case 'modal': return new ModalSandbox();
    case 'e2b': return new E2BSandbox();
  }
}
```

---

## Phase 4: Progressive Disclosure & Context Management (Week 4-5)

### 4.1 Lazy Resource Loading

Implement resource references that load on-demand:

```typescript
// src/context/resource-refs.ts
export interface ResourceReference {
  uri: string;
  mimeType: string;
  // Lazy loading metadata
  loadStrategy: 'immediate' | 'on_access' | 'summarized';
  summary?: string;  // AI-generated preview
  size?: number;     // Size in bytes for cost estimation
}

// Tool results can include resource refs instead of full content
export function withResourceLinks(result: any, refs: ResourceReference[]) {
  return {
    ...result,
    _vegamcp_resources: refs.map(r => ({
      uri: r.uri,
      summary: r.summary,
      size: r.size,
      // Client decides when to fetch
      fetch_hint: r.loadStrategy,
    })),
  };
}
```

### 4.2 Context Budget Management

Track and enforce context budgets per agent:

```typescript
// src/context/budget-manager.ts
export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  strategy: 'truncate' | 'summarize' | 'evict';
}

export class ContextBudgetManager {
  // Automatically compress context when budget exceeded
  async ensureBudget(context: Context, budget: ContextBudget): Promise<Context> {
    if (estimateTokens(context) <= budget.maxTokens) return context;
    
    switch (budget.strategy) {
      case 'truncate':
        return this.truncateOldest(context, budget.maxTokens);
      case 'summarize':
        return this.summarizeSections(context, budget.maxTokens);
      case 'evict':
        return this.evictLowPriority(context, budget.maxTokens);
    }
  }
}
```

---

## Phase 5: A2A Protocol Implementation (Week 5-6)

### 5.1 Agent Card Standard

Implement Google's A2A Agent Card for cross-platform discovery:

```json
// Agent Card for VegaMCP
{
  "name": "VegaMCP Agent Swarm",
  "description": "60+ tool MCP server with agent swarm, memory, browser automation",
  "url": "https://vegamcp.io/a2a",
  "provider": {
    "name": "VegaMCP",
    "url": "https://vegamcp.io"
  },
  "version": "7.0.0",
  "documentationUrl": "https://docs.vegamcp.io",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["OAuth2", "ApiKey"]
  },
  "defaultInputModes": ["text", "file"],
  "defaultOutputModes": ["text", "file", "structured"],
  "skills": [
    {
      "id": "memory-graph",
      "name": "Persistent Memory Graph",
      "description": "Knowledge graph with entity-relationship storage",
      "tags": ["memory", "knowledge", "graph"],
      "examples": ["Remember that user prefers TypeScript", "Find all related entities"]
    },
    // ... all tools as skills
  ]
}
```

### 5.2 Cross-Agent Task Delegation

Allow agents to delegate tasks to VegaMCP via A2A:

```typescript
// src/a2a/task-handler.ts
export async function handleA2ATask(task: A2ATask): Promise<A2ATaskResult> {
  // Convert A2A task to VegaMCP swarm task
  const swarmTask = await convertA2AToSwarm(task);
  
  // Route to appropriate agent based on skill requirements
  const agent = await routeToAgent(task.metadata.requiredSkills);
  
  // Execute with progress streaming
  const result = await agent.processTaskWithStreaming(swarmTask, {
    onProgress: (update) => sendA2AUpdate(task.id, update),
  });
  
  // Convert back to A2A result format
  return convertSwarmToA2A(result);
}
```

---

## Phase 6: System Prompt Optimization (Week 6-7)

### 6.1 Research-Based Prompt Engineering

Use the system prompts collection to optimize VegaMCP's internal prompts:

| Source | Insight | Application |
|--------|---------|-------------|
| **Claude Code** | Constitution pattern, tool use XML | Improve reasoning router prompts |
| **Cursor** | Composer mode, agent loop | Enhance agent orchestration |
| **Devin** | Planning → execution → verification | Strengthen swarm coordination |
| **Windsurf** | Cascade flow, file context | Optimize file-aware tools |
| **Augment** | Code comprehension first | Improve code analysis tools |

### 6.2 Dynamic Prompt Assembly

Assemble prompts based on task context:

```typescript
// src/prompts/dynamic-assembly.ts
export function assembleAgentPrompt(
  task: Task,
  agent: Agent,
  context: Context
): string {
  const sections = [
    // Base personality from agent config
    agent.personality,
    
    // Task-specific instructions from SKILL.md patterns
    getTaskInstructions(task.type),
    
    // Tool descriptions (filtered by relevance)
    formatTools(getRelevantTools(task)),
    
    // Memory context (from graph)
    formatMemoryContext(context.memory),
    
    // Conversation history (truncated to budget)
    formatHistory(context.history, context.budget),
  ];
  
  return sections.join('\n\n');
}
```

---

## Phase 7: Cross-Platform Installation (Week 7-8)

### 7.1 One-Line Installers

```bash
# Claude Code
claude mcp add vegamcp -- $(npm root -g)/vegamcp/build/index.js

# Codex CLI
codex mcp add vegamcp -- node $(npm root -g)/vegamcp/build/index.js

# Kimi Code
kimi mcp add --transport stdio vegamcp -- node /path/to/vegamcp/build/index.js

# Global npm (detects client)
npm install -g vegamcp
vegamcp install  # Auto-detects and configures for installed clients
```

### 7.2 Configuration Sync

Keep configurations in sync across clients:

```typescript
// src/install/config-sync.ts
export async function syncConfig(): Promise<void> {
  const configs = {
    'claude': '~/.claude/mcp.json',
    'kimi': '~/.kimi/mcp.json',
    'codex': '~/.codex/mcp.json',
  };
  
  const vegamcpConfig = {
    command: 'node',
    args: [getInstallPath()],
    env: await loadEnv(),
  };
  
  for (const [client, path] of Object.entries(configs)) {
    if (await fileExists(path)) {
      await mergeMcpConfig(path, 'vegamcp', vegamcpConfig);
    }
  }
}
```

---

## Phase 8: AI-First Mobile Testing Platform (✅ IMPLEMENTED)

> **Status:** ✅ Fully implemented and verified  
> **File:** `src/tools/capabilities/mobile-testing.ts` (620+ lines)  
> **Registered:** `index.ts` — available under `full` and `ops` profiles

### 8.1 Overview

A comprehensive AI-first mobile testing tool that brings Android emulator and iOS simulator control directly into VegaMCP. All outputs are structured JSON optimized for AI consumption — not raw text dumps.

### 8.2 Android Capabilities (30+ Actions)

| Category | Actions | Description |
|----------|---------|-------------|
| **Emulator Management** | `avd_list`, `avd_create`, `emulator_start`, `emulator_stop`, `device_list` | Create, boot, and manage Android Virtual Devices |
| **App Lifecycle** | `app_install`, `app_launch`, `app_stop`, `app_clear` | Install APKs, launch activities, manage app state |
| **Visual Testing** | `screenshot`, `ui_tree`, `screen_record` | Screenshots with screen metadata, UI hierarchy as structured tree, video recording |
| **Interaction** | `touch`, `swipe`, `type_text`, `key_event` | Simulate taps, swipes, text input, and hardware buttons |
| **AI-Enhanced Diagnostics** | `logcat`, `crash_logs`, `performance` | Structured logcat with crash/ANR detection, parsed performance metrics |
| **Device Simulation** | `network_sim`, `battery_sim`, `orientation` | Simulate network conditions (wifi/3g/none), battery states, screen rotation |
| **Stress Testing** | `monkey_test` | Random UI fuzzing with crash/ANR detection |
| **Shell Access** | `shell` | Raw ADB shell command execution |

### 8.3 iOS Capabilities (macOS only)

| Action | Description |
|--------|-------------|
| `sim_list` | List available iOS simulators (JSON parsed) |
| `sim_create` | Create new simulator with device type + runtime |
| `sim_boot` / `sim_shutdown` | Boot/shutdown simulators |
| `sim_install` / `sim_launch` | Install and launch apps |
| `sim_screenshot` | Capture screenshot (base64 PNG) |
| `sim_ui_tree` | UI hierarchy dump |
| `sim_logs` | Structured system logs |

### 8.4 AI-First Design Principles

Every output is designed for AI consumption:

```typescript
// Logcat: Not raw text, but structured entries with AI analysis
{
  logcat: { total_entries: 50, error_count: 3, crash_count: 0, anr_count: 0 },
  entries: [{ timestamp, pid, tid, level, tag, message, is_crash, is_anr, is_error }],
  ai_analysis: {
    has_crashes: false,
    error_summary: ["[WebView] net::ERR_FAILED"],
    hint: "Focus on entries with is_crash=true or is_error=true for bug diagnosis."
  }
}

// Screenshots: Include screen metadata for coordinate calculation
{
  screenshot: { size_bytes: 274000, screen_size: "1080x2400", density: "440" },
  ai_hint: "Analyze for UI layout, visual bugs, text readability, and touch target sizes."
}

// UI Tree: Parsed accessibility tree with interactive element summary
{
  ui_tree: { total_nodes: 47, clickable_count: 12, scrollable_areas: 2 },
  ai_summary: {
    interactive_elements: [{ text: "Get Started", bounds: "[60,1350][660,1420]", type: "Button" }],
    visible_text: ["Antigravity", "Your AI Coding Agent, on Mobile"],
    hint: "Use bounds [left,top][right,bottom] for touch coordinates."
  }
}

// Performance: Parsed metrics with AI thresholds
{
  performance: {
    memory: { total_pss_kb: 145000, native_heap_kb: 35000 },
    gfx: { janky_frames: 5, janky_percent: 2.1, frame_time_p90_ms: 12 },
    ai_analysis: {
      hint: "Check memory.total_pss_kb for memory leaks over time.",
      thresholds: { memory_warning_kb: 200000, jank_warning_percent: 10 }
    }
  }
}
```

### 8.5 Environment Auto-Detection

- Auto-detects Android SDK, JDK, ADB, and emulator paths
- Works on Windows, macOS, and Linux
- iOS support auto-detects macOS + Xcode availability
- JAVA_HOME auto-set from known JDK install paths

### 8.6 Tool Annotation

```typescript
mobile_testing: { 
  title: 'Mobile App Testing', 
  readOnlyHint: false, 
  openWorldHint: false 
}
```

### 8.7 Verified Working

- ✅ AVD creation with `system-images;android-35;google_apis;x86_64`
- ✅ Emulator boot and screenshot capture
- ✅ APK installation and app launch
- ✅ Touch interaction (tap coordinates)
- ✅ Tested with Antigravity Mobile app (Capacitor + React)
- ✅ VegaMCP builds cleanly with 0 TypeScript errors

---

## Phase 9: AI-First Web Testing Platform (NEW)

> **Status:** 🔄 Planned  
> **File:** `src/tools/capabilities/web-testing.ts`  
> **Depends on:** Existing Playwright browser module

### 9.1 Overview

A comprehensive web quality assurance tool that extends existing Playwright browser automation into structured, AI-optimized web testing. All outputs follow the same AI-first JSON pattern as mobile testing.

### 9.2 Actions (10 total)

| Action | Description | Output |
|--------|-------------|--------|
| `lighthouse` | Run Google Lighthouse audits (performance, accessibility, SEO, best practices) | Scores with AI thresholds + suggestions |
| `visual_regression` | Pixel-diff screenshot comparison between versions/pages | Diff percentage + highlighted regions |
| `responsive_test` | Auto-test page across viewport sizes (mobile, tablet, desktop, ultrawide) | Layout issues + overflow detection per breakpoint |
| `console_audit` | Structured parsing of JS errors, warnings, deprecations | Error count + severity + `ai_analysis` block |
| `network_waterfall` | Capture HAR file, analyze load times, find slow resources | Resource timing + bottleneck identification |
| `form_test` | Auto-fill/submit forms, validate error states, test required fields | Form field map + validation results |
| `link_check` | Crawl site for broken links, 404s, redirect chains | Link status map + redirect chain depth |
| `storage_audit` | Inspect cookies, localStorage, sessionStorage | Cookie count + security flags + size analysis |
| `css_coverage` | Find unused CSS rules | Used vs unused percentage + top unused rules |
| `core_web_vitals` | LCP, FID, CLS, TTFB, INP measurement | Metrics with pass/fail per Google thresholds |

### 9.3 AI-First Design

```typescript
// Lighthouse: Not just scores, but AI-actionable suggestions
{
  lighthouse: {
    performance: 72, accessibility: 95, seo: 88, best_practices: 83
  },
  ai_analysis: {
    worst_category: 'performance',
    top_opportunities: [
      { name: 'Reduce unused JavaScript', savings_ms: 1200 },
      { name: 'Serve images in next-gen formats', savings_kb: 450 }
    ],
    hint: 'Focus on performance — score 72 is below target 90.'
  }
}

// Core Web Vitals: Structured with pass/fail verdicts
{
  vitals: {
    lcp: { value_ms: 2100, rating: 'needs_improvement', threshold: 2500 },
    cls: { value: 0.05, rating: 'good', threshold: 0.1 },
    fid: { value_ms: 80, rating: 'good', threshold: 100 },
    ttfb: { value_ms: 350, rating: 'good', threshold: 800 },
    inp: { value_ms: 180, rating: 'needs_improvement', threshold: 200 }
  },
  ai_analysis: {
    overall_verdict: 'needs_improvement',
    blocking_metric: 'lcp',
    hint: 'LCP is 2100ms. Target < 2500ms. Optimize largest image or reduce render-blocking resources.'
  }
}
```

---

## Phase 10: AI-First API Testing Platform (NEW)

> **Status:** 🔄 Planned  
> **File:** `src/tools/capabilities/api-testing.ts`  
> **Depends on:** Existing `api_request` tool (api-gateway.ts)

### 10.1 Overview

A comprehensive API quality assurance tool that extends the existing HTTP request capability into full API testing. Supports REST, GraphQL, and WebSocket testing with AI-optimized structured output.

### 10.2 Actions (8 total)

| Action | Description | Output |
|--------|-------------|--------|
| `discover_endpoints` | Auto-detect endpoints from OpenAPI/Swagger specs or HAR files | Endpoint map + method + auth requirements |
| `contract_test` | Validate API responses against JSON Schema or OpenAPI spec | Pass/fail per field + type mismatches |
| `load_test` | Simple load testing (concurrent requests, latency percentiles) | p50/p95/p99 latency + error rate + throughput |
| `auth_flow` | Test OAuth, JWT, API key authentication workflows | Token lifecycle + expiry + refresh behavior |
| `validate_response` | Deep response validation (status, headers, body schema, timing) | Structured validation results |
| `sequence_test` | Multi-step API workflows (create → read → update → delete) | Step-by-step results + data flow validation |
| `mock_server` | Spin up temporary mock endpoint for testing | Mock URL + captured requests |
| `diff_test` | Compare API responses between environments (staging vs prod) | Field-level diff + structural changes |

### 10.3 AI-First Design

```typescript
// Load Test: AI-analyzed performance results
{
  load_test: {
    total_requests: 1000, concurrency: 50, duration_s: 10,
    latency: { p50_ms: 45, p95_ms: 120, p99_ms: 350, max_ms: 1200 },
    throughput: { rps: 100, bytes_per_sec: 52000 },
    errors: { count: 3, rate_percent: 0.3, codes: { '500': 2, '429': 1 } }
  },
  ai_analysis: {
    verdict: 'good',
    concerns: ['p99 latency (350ms) is 7x p50 — indicates tail latency issue'],
    hint: 'API handles 100 rps with 0.3% error rate. p99 tail latency suggests occasional slow queries.'
  }
}

// Contract Test: Schema validation with precise error locations
{
  contract_test: {
    endpoint: '/api/users', method: 'GET',
    schema_source: 'openapi.yaml',
    total_fields: 15, passed: 13, failed: 2,
    failures: [
      { path: '$.data[0].email', expected: 'string', got: 'null', severity: 'error' },
      { path: '$.meta.total', expected: 'integer', got: 'string', severity: 'warning' }
    ]
  },
  ai_analysis: {
    verdict: 'fail',
    hint: 'email field returns null — likely missing NOT NULL constraint or serialization bug.'
  }
}
```

---

## Phase 11: AI-First Accessibility Testing Platform (NEW)

> **Status:** 🔄 Planned  
> **File:** `src/tools/capabilities/accessibility-testing.ts`  
> **Depends on:** Existing Playwright browser module

### 11.1 Overview

Automated accessibility testing for WCAG 2.1 AA/AAA compliance, color contrast, keyboard navigation, and ARIA validation. Critical for legal compliance and inclusive design.

### 11.2 Actions (6 total)

| Action | Description | Output |
|--------|-------------|--------|
| `wcag_audit` | Full WCAG 2.1 compliance scan (AA by default, AAA optional) | Violations + severity + WCAG rule reference |
| `contrast_check` | Check text/background color contrast ratios across all text elements | Pass/fail per element + suggested fix colors |
| `keyboard_nav` | Verify all interactive elements are keyboard-accessible, check tab order | Tab sequence + trapped focus detection |
| `aria_audit` | Validate ARIA roles, labels, states, and relationships | Missing labels + incorrect roles + orphaned references |
| `screen_reader` | Traverse page as screen reader would, extract reading order | Reading order + hidden content + landmark structure |
| `focus_management` | Audit focus indicators, focus traps, focus restoration on modals | Missing focus styles + trap detection + modal behavior |

### 11.3 AI-First Design

```typescript
// WCAG Audit: Structured violations with fix suggestions
{
  wcag_audit: {
    standard: 'WCAG 2.1 AA', url: 'https://example.com',
    total_checks: 85, passed: 78, violations: 5, warnings: 2,
    violations_by_severity: { critical: 1, serious: 2, moderate: 2 }
  },
  violations: [
    {
      rule: 'image-alt', severity: 'critical', wcag: '1.1.1',
      element: '<img src="hero.jpg">', count: 1,
      fix: 'Add alt attribute: <img src="hero.jpg" alt="Description of hero image">'
    },
    {
      rule: 'color-contrast', severity: 'serious', wcag: '1.4.3',
      element: '<p class="muted">', count: 3,
      fix: 'Increase contrast ratio from 3.2:1 to minimum 4.5:1'
    }
  ],
  ai_analysis: {
    verdict: 'needs_work',
    compliance_score: 91,
    hint: 'Critical: 1 image missing alt text. Fix this first for screen reader users.'
  }
}
```

---

## Implementation Roadmap

```
Week 0:     Tool Consolidation — 60+ tools → 15 core clusters
              ├── Unified dispatch layer + backward compat aliases
              ├── Decompose index.ts (1154 lines → modular)
              └── Rewrite ARCHITECTURE.md for v7
Week 1-2:   SKILL.md Bridge + Skill Marketplace Integration
Week 3-4:   Recursive Agent Kernel + Multi-Sandbox Support
Week 5-6:   A2A Protocol + Cross-Agent Task Delegation
Week 7-8:   System Prompt Optimization + Installation UX
Week 8:     ✅ Mobile Testing Platform (DONE — Android + iOS)
Week 9:     Web Testing Platform (Lighthouse, visual regression, responsive, CWV)
Week 10:    API Testing Platform (contract, load, sequence, mock)
Week 11:    Accessibility Testing Platform (WCAG, contrast, keyboard, ARIA)
Week 12-13: Integration Testing, Documentation, Community Feedback
Week 14:    v7.0 Stable Release
```

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| **Tool count** | 15 unified tools (from 60+) | 🔄 In progress |
| **Tool availability** | 100% of VegaMCP tools work in Claude Code, Kimi Code, Codex CLI | 🔄 In progress |
| **Setup time** | < 2 minutes from install to first tool call | 🔄 In progress |
| **Cross-agent task success** | > 95% of tasks delegated via A2A complete successfully | 🔄 In progress |
| **Context efficiency** | ~80% reduction in tool description tokens | 🔄 In progress |
| **Tool selection accuracy** | > 95% correct tool selection on first try | 🔄 In progress |
| **Skill marketplace integration** | Load any SkillsMP skill as VegaMCP tool within 10s | 🔄 In progress |
| **Mobile testing coverage** | Android emulator + iOS simulator with 30+ actions | ✅ Done |
| **Web testing coverage** | Lighthouse, visual regression, responsive, CWV + 6 more | 🔄 Phase 9 |
| **API testing coverage** | Contract, load, sequence, mock + 4 more actions | 🔄 Phase 10 |
| **Accessibility testing** | WCAG 2.1 AA/AAA, contrast, keyboard, ARIA, screen reader | 🔄 Phase 11 |
| **AI-optimized diagnostics** | Structured JSON + `ai_analysis` block on ALL testing output | ✅ Pattern established |

---

## Migration Path from v6.0

### Tool Consolidation Migration

| Old Tool(s) | New Tool | Action Mapping |
|-------------|----------|----------------|
| `browser_*` (8 tools) | `web` | `action: "browse"` with sub-actions |
| `web_search`, `github_scraper` | `web` | `action: "search"`, `action: "github"` |
| `sandbox_execute`, `code_analysis`, `shell`, `filesystem`, `git_tools` | `code` | `action: "execute"`, `"analyze"`, `"shell"`, `"file"`, `"git"` |
| `route_to_reasoning_model`, `llm_router`, `knowledge_engine`, `graph_rag` | `ai` | `action: "reason"`, `"search"`, `"rag"` |
| `watcher_*`, `webhook_*`, `workflow_*`, `schedule`, `notify` | `ops` | Various actions under unified tool |
| `security_scanner`, `sentinel`, `stress_test` | `security` | `action: "scan"`, `"monitor"`, `"test"` |
| *NEW* | `web_testing` | `action: "lighthouse"`, `"visual_regression"`, `"responsive_test"`, etc. |
| *NEW* | `api_testing` | `action: "contract_test"`, `"load_test"`, `"sequence_test"`, etc. |
| *NEW* | `accessibility` | `action: "wcag_audit"`, `"contrast_check"`, `"keyboard_nav"`, etc. |

**Compatibility:** Old tool calls are automatically aliased to new unified tools.

### General Migration

1. **No Breaking Changes:** All v6.0 tools continue working via alias layer
2. **Opt-in Features:** New capabilities (testing tools) are additive
3. **Gradual Migration:** Users can adopt features incrementally
4. **Auto-Upgrade:** `vegamcp upgrade` handles configuration migration
5. **Tool Count:** Reduces from 60+ to 15 after upgrade (with opt-out to legacy mode)
6. **New Testing Tools:** Available under `full`, `ops`, and new `testing` profile
