# VegaMCP v7.0 — Architecture

> **Version:** 7.0 (Protocol Supremacy + Full Testing Platform)  
> **Updated:** 2026-02-28  
> **Previous:** v1.0 Hub-and-Spoke → v6.0 Multi-Module → v7.0 Unified Clusters

---

## 1. High-Level Architecture

VegaMCP v7.0 is an **AI-native MCP server** that consolidates 60+ capabilities into **15 unified tool clusters** served over stdio/SSE transport. It follows a **Cluster-Action-Dispatch** pattern where each tool cluster contains related actions routed through a unified dispatcher.

```
┌───────────────────────────────────────────────────────────────┐
│                        AI Agent Client                        │
│              (Claude Code / Kimi Code / Codex CLI)            │
└────────────────────────────┬──────────────────────────────────┘
                             │ MCP Protocol (stdio / SSE)
┌────────────────────────────▼──────────────────────────────────┐
│                    VegaMCP v7.0 Server                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Gateway Layer                          │  │
│  │  Security · Rate Limiting · Prompt Injection · Audit    │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│  ┌─────────────────────────▼───────────────────────────────┐  │
│  │               Unified Dispatch Router                   │  │
│  │  Tool Selection → Action Routing → Handler Resolution   │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│  ┌─────────────────────────▼───────────────────────────────┐  │
│  │               15 Capability Clusters                    │  │
│  │                                                         │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │  │ memory  │ │   web   │ │  code   │ │   ai    │      │  │
│  │  │ 6 acts  │ │ 10 acts │ │ 7 acts  │ │ 8 acts  │      │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │  │  swarm  │ │  data   │ │   ops   │ │security │      │  │
│  │  │ 9 acts  │ │ 5 acts  │ │ 8 acts  │ │ 5 acts  │      │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │  │ create  │ │protocol │ │ sentry  │ │  intel  │      │  │
│  │  │ 3 acts  │ │ 11 acts │ │ 4 acts  │ │ 3 acts  │      │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐            │  │
│  │  │web_test  │ │api_test  │ │accessibility │  ← NEW     │  │
│  │  │ 10 acts  │ │ 8 acts   │ │   6 acts     │            │  │
│  │  └──────────┘ └──────────┘ └──────────────┘            │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Backward Compatibility Layer              │  │
│  │  60+ v6 tool names → v7 cluster:action aliases          │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Shared Infrastructure                  │  │
│  │  SQLite · ChromaDB · Playwright · Analytics · Caching   │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
src/
├── index.ts                         # Server entry point, tool registry, request handler
├── tools/
│   ├── browser/                     # 9 files → merged into 'web' cluster
│   │   ├── browser-manager.ts       # Playwright browser lifecycle
│   │   ├── navigate.ts              # Page navigation
│   │   ├── interact.ts              # Click, type, screenshot, snapshot
│   │   └── ...                      # console-logs, execute-js, close
│   ├── capabilities/                # 31 files → individual tools being consolidated
│   │   ├── mobile-testing.ts        # ✅ Mobile testing (39KB, Android + iOS)
│   │   ├── web-testing.ts           # 🔄 Web QA (Lighthouse, CWV, visual regression)
│   │   ├── api-testing.ts           # 🔄 API QA (contract, load, sequence, mock)
│   │   ├── accessibility-testing.ts # 🔄 A11y (WCAG, contrast, keyboard, ARIA)
│   │   ├── sandbox.ts               # Code execution sandbox
│   │   ├── code-analysis.ts         # AST analysis engine
│   │   ├── shell.ts                 # Shell command execution
│   │   ├── filesystem.ts            # File operations
│   │   ├── git-tools.ts             # Git operations
│   │   ├── web-search.ts            # Tavily/SearXNG search
│   │   ├── github-scraper.ts        # GitHub code/repo search
│   │   ├── database.ts              # SQLite query engine
│   │   ├── analytics.ts             # Usage analytics
│   │   ├── vault.ts                 # Obsidian-style note vault
│   │   ├── health-check.ts          # System diagnostics
│   │   ├── auto-update.ts           # Knowledge base auto-refresh
│   │   ├── notify.ts                # User notifications
│   │   ├── schedule.ts              # Task scheduling (cron, interval)
│   │   ├── workflow.ts              # Multi-step state machines
│   │   ├── api-gateway.ts           # HTTP request gateway
│   │   ├── knowledge-engine.ts      # Vector search + dedup
│   │   ├── prompt-library.ts        # 20+ token-optimized templates
│   │   ├── skills.ts                # SKILL.md management
│   │   ├── document-reader.ts       # Multi-format document parsing
│   │   ├── sequential-thinking.ts   # Chain-of-thought reasoning
│   │   └── token-budget.ts          # Cost tracking
│   ├── memory/                      # 6 files → already merged into 'memory' cluster
│   ├── reasoning/                   # 1 file → route-to-reasoning-model
│   ├── research/                    # 11 files → AI research tools
│   │   ├── discovery_rag.ts         # Agentic RAG pipeline
│   │   ├── graph_rag.ts             # Hybrid vector + graph retrieval
│   │   ├── hypothesis_gen.ts        # Multi-model debate system
│   │   ├── llm_router.ts            # Multi-LLM routing
│   │   ├── memory_bridge.ts         # Cross-modal memory bridge
│   │   ├── quality_gate.ts          # Quality regression tracking
│   │   ├── security_scanner.ts      # 100+ pattern scanner
│   │   ├── self_evolution.ts        # RLM 2.0 feedback loops
│   │   ├── sentinel.ts              # Self-healing diagnostics
│   │   ├── stress_test.ts           # Chaos/fuzz testing
│   │   └── synthesis_engine.ts      # Knowledge-to-training pipeline
│   ├── sentry/                      # 5 files → already merged into 'sentry' cluster
│   └── swarm/                       # 8 files → already merged into 'swarm' cluster
├── mcp-protocol/                    # 15 files → MCP protocol extensions
│   ├── a2a-protocol.ts              # Agent-to-Agent communication
│   ├── agent-graphs.ts              # Hierarchical agent DAGs
│   ├── agentic-sampling-v2.ts       # Server-side agent loops
│   ├── dynamic-indexing.ts          # Real-time indexing pipeline
│   ├── elicitation.ts               # AI-driven input requests
│   ├── gateway.ts                   # Security/audit gateway
│   ├── mcp-apps.ts                  # Interactive UI dashboards
│   ├── mcp-tasks.ts                 # Async task management
│   ├── multimodal-embeddings.ts     # Cross-modal vector search
│   ├── oauth.ts                     # OAuth 2.1 authorization
│   ├── session-manager.ts           # Session resumability
│   ├── structured-output.ts         # JSON output formatting
│   ├── tool-search.ts               # Tool discovery via NLP
│   └── zero-trust.ts               # Agent identity management
├── security/                        # 4 files → shared security infrastructure
│   ├── prompt-injection-detector.ts # Injection detection
│   ├── rate-limiter.ts              # Per-endpoint rate limits
│   ├── audit-logger.ts              # Structured audit logging
│   └── circuit-breaker.ts           # Failing endpoint protection
├── swarm/                           # 18 files → 10-agent swarm orchestration
├── db/                              # 4 files → database infrastructure
│   ├── vector-store.ts              # ChromaDB integration
│   ├── sqlite-manager.ts            # SQLite connection pool
│   └── ...
├── resources/                       # 3 files → MCP resources
├── prompts/                         # 1 file → MCP prompt templates
└── seed/                            # 4 files → built-in knowledge libraries
    ├── polyalgo.ts                  # 160+ algorithms
    ├── easy-prompts.ts              # 150+ prompt templates
    └── bug-taxonomy.ts              # 17 categories, 400+ keywords
```

---

## 3. Design Patterns

### 3.1 Unified Action Schema

Every tool in v7 follows the same dispatch pattern:

```typescript
// Every tool: { action: string, ...params }
// Dispatch: tool_name → action → handler function
{
  name: 'web_testing',
  inputSchema: {
    type: 'object',
    properties: {
      action: { enum: ['lighthouse', 'visual_regression', 'responsive_test', ...] },
      url: { type: 'string' },
      // ... action-specific params
    },
    required: ['action']
  }
}
```

### 3.2 Progressive Disclosure (3-Level)

```
Level 1 (Always):  Tool name + 1-line summary      (~20 tokens each)
Level 2 (Smart):   Expanded description + keywords  (~100 tokens each, top 3 only)
Level 3 (On-call): Full action schemas               (~150 tokens, per request)
```

### 3.3 AI-First Output Pattern (Testing Tools)

All testing tools return structured JSON with an `ai_analysis` block:

```typescript
{
  // Raw data
  lighthouse: { performance: 72, accessibility: 95, seo: 88 },
  // AI-actionable analysis
  ai_analysis: {
    verdict: 'needs_improvement',
    worst_category: 'performance',
    top_opportunities: [...],
    hint: 'Focus on performance — score 72 is below target 90.'
  }
}
```

### 3.4 Backward Compatibility via Aliases

```typescript
// Old v6 call: REDACTED_web_search({ query: 'test' })
// Auto-aliased to: web({ action: 'search', query: 'test' })
const ALIASES = {
  REDACTED_web_search: { tool: 'web', action: 'search' },
  REDACTED_browser: { tool: 'web', action: 'browse' },
  REDACTED_sandbox_execute: { tool: 'code', action: 'execute' },
  // ... 60+ aliases
};
```

---

## 4. Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js ≥ 20.0 | Server runtime |
| Language | TypeScript 5.7+ | Type safety |
| MCP SDK | @modelcontextprotocol/sdk 1.12+ | Protocol implementation |
| Browser | Playwright 1.50+ | Browser automation, web testing |
| Database | sql.js (SQLite) | Local data storage |
| Vectors | ChromaDB (in-process) | Semantic search |
| Schema | Zod 3.24+ | Runtime validation |
| Environment | dotenv 16.6+ | Configuration |
| Build | tsc (TypeScript compiler) | Compilation |
| Dev | tsx (watch mode) | Development server |

---

## 5. Request Lifecycle

```
1. Client sends CallToolRequest via stdio/SSE
   ↓
2. Gateway Layer
   ├── Prompt injection detection
   ├── Rate limiting (per-endpoint)
   ├── API key validation (if OAuth enabled)
   └── Audit logging
   ↓
3. Dispatch Router
   ├── Resolve tool name (check aliases if v6 name)
   ├── Extract action from params
   ├── Route to cluster handler
   └── Validate action-specific params
   ↓
4. Cluster Handler
   ├── Execute action logic
   ├── Interact with infrastructure (DB, browser, HTTP, etc.)
   └── Format response (structured JSON with ai_analysis for testing)
   ↓
5. Response
   ├── Analytics tracking (latency, token usage)
   ├── Error wrapping (structured error objects)
   └── Return MCP ToolResult
```

---

## 6. Tool Profiles

Tools are conditionally loaded based on the `VEGAMCP_TOOL_PROFILE` environment variable:

| Profile | Tools Loaded | Use Case |
|---------|-------------|----------|
| `full` | All 15 clusters | Full-featured development |
| `minimal` | memory, web, code, ai | Lightweight coding assistant |
| `research` | memory, web, ai, data, security | Research and analysis |
| `coding` | memory, web, code, ai, sentry | Pure development |
| `ops` | ops, security, protocol, sentry | Infrastructure management |
| `testing` | web_testing, api_testing, accessibility, mobile (via protocol) | QA focus |

---

## 7. The 15 Tool Clusters

| # | Cluster | Actions | Source Files | Status |
|---|---------|---------|-------------|--------|
| 1 | `memory` | 6 | tools/memory/ | ✅ Merged in v6 |
| 2 | `web` | 10 | tools/browser/ + capabilities/ | 🔄 Consolidating |
| 3 | `code` | 7 | capabilities/ (7 files) | 🔄 Consolidating |
| 4 | `ai` | 8 | reasoning/ + research/ | 🔄 Consolidating |
| 5 | `swarm` | 9 | tools/swarm/ | ✅ Merged in v6 |
| 6 | `data` | 5 | capabilities/ (3 files) | 🔄 Consolidating |
| 7 | `ops` | 8 | capabilities/ (8 files) | 🔄 Consolidating |
| 8 | `security` | 5 | research/ (4 files) | 🔄 Consolidating |
| 9 | `create` | 3 | mcp-protocol/ + capabilities/ | 🔄 Consolidating |
| 10 | `protocol` | 11 | mcp-protocol/ (12 files) + mobile | 🔄 Consolidating |
| 11 | `sentry` | 4 | tools/sentry/ | ✅ Merged in v6 |
| 12 | `intel` | 3 | capabilities/ (2 files) | 🔄 Consolidating |
| 13 | `web_testing` | 10 | capabilities/web-testing.ts | 🔄 Phase 9 |
| 14 | `api_testing` | 8 | capabilities/api-testing.ts | 🔄 Phase 10 |
| 15 | `accessibility` | 6 | capabilities/accessibility-testing.ts | 🔄 Phase 11 |

**Total: 100+ actions across 15 clusters**

---

## 8. Security Architecture

```
┌───────────────────────────────────────┐
│          Security Layers              │
├───────────────────────────────────────┤
│ 1. Prompt Injection Detection         │  ← Blocks malicious prompts
│ 2. Rate Limiting (per-endpoint)       │  ← Prevents abuse
│ 3. OAuth 2.1 (optional)              │  ← API key management
│ 4. Zero-Trust Agent Identity          │  ← Scoped permissions per agent
│ 5. Gateway Audit Logging              │  ← Complete call history
│ 6. Circuit Breaker                    │  ← Failing endpoint protection
│ 7. Tool Profile Gating                │  ← Only load needed tools
│ 8. WORKSPACE_ROOT Sandboxing          │  ← File system isolation
└───────────────────────────────────────┘
```

---

## 9. Cross-Agent Compatibility

| Client | Transport | Tool Limit | Status |
|--------|-----------|-----------|--------|
| Claude Code | stdio | ~128 tools | ✅ Tested |
| Kimi Code | stdio | ~50 tools | ✅ Tested |
| Codex CLI | stdio | ~30 tools | ✅ Tested (15 tools fits all) |
| Custom MCP | SSE | Unlimited | ✅ Supported |

The v7 consolidation (60+ → 15 tools) ensures **every client can load the full tool set** without hitting limits.

---

## 10. Evolution History

| Version | Tools | Architecture | Key Addition |
|---------|-------|-------------|-------------|
| v1.0 | ~20 | Hub-and-Spoke (4 modules) | Memory, Browser, Sentry, Reasoning |
| v3.0 | ~35 | Multi-Module | Research tools, Code analysis |
| v4.0 | ~45 | + Research Engine | Hypothesis gen, Self-evolution, Sentinel |
| v5.0 | ~55 | + MCP Protocol Extensions | A2A, OAuth, Gateway, Sampling |
| v6.0 | 60+ | + Capabilities Layer | Mobile testing, Zero-trust, MCP Apps |
| **v7.0** | **15 clusters (100+ actions)** | **Unified Clusters** | **Web+API+A11y testing, Progressive Disclosure** |
