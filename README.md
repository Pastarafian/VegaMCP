<p align="center">
  <h1 align="center">🚀 VegaMCP v7.0</h1>
  <p align="center">
    <strong>Full Spectrum Testing Edition — AI Agent Swarm Platform</strong>
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tools">Tools (65+)</a> •
    <a href="#v70-testing-suite">v7.0 Testing Suite</a> •
    <a href="#configuration">Configuration</a>
  </p>
</p>

---

> **VegaMCP** is a production-grade MCP (Model Context Protocol) server providing an autonomous AI agent swarm, persistent memory, browser automation, multi-model reasoning, security gateway, agent graphs, zero-trust identity, A2A protocol, AI-first testing suite (mobile, web, API, accessibility), and 65+ tools — all accessible via any MCP-compatible client.

## Features

### 🧠 Core Intelligence
- **Multi-Model Reasoning Router** — 9 modes, 25+ models, multi-model debate, conversation memory
- **Knowledge Engine** — Semantic vector search with TF-IDF embeddings, auto-deduplication
- **Persistent Memory Graph** — Entity-relation knowledge graph with SQLite backing
- **GraphRAG** — Hybrid retrieval (vector + graph traversal)
- **Agentic RAG** — Autonomous multi-step retrieval with self-evaluation

### 🐝 Agent Swarm
- **10 Specialized Agents** across 3 coordinators (Research, Quality, Operations)
- **Autonomous Task Orchestration** — priority queue, routing, pipelines, event triggers
- **Agent DNA** — Learned performance profiles for adaptive task routing
- **Inter-Agent Communication** — Threaded conversations and pub/sub data streams

### 🔧 Capabilities
- **Code Sandbox** — Python & JavaScript execution in sandboxed environments
- **Browser Automation** — Headless Chromium via Playwright
- **GitHub Scraper** — Search repos/code/issues, analyze repos, generate knowledge
- **Web Search** — Tavily AI search + SearXNG fallback
- **A/B Testing** — Compare model outputs, track performance stats
- **Scheduled Tasks** — Cron, interval, and one-time scheduling

### 🆕 v6.0 Protocol Features
- **Structured Tool Output** — `outputSchema` + `structuredContent` for machine-readable results
- **AI Elicitation** — Tools request structured input from the AI model via MCP Sampling
- **Resource Links** — Lazy context loading via resource references in tool results
- **MCP Tasks (SEP-1686)** — Async call-now/fetch-later with SQLite persistence
- **OAuth 2.1 Authorization** — JWT validation, scope-based access, RFC 9728 Protected Resource Metadata
- **MCP Gateway** — Centralized audit logging, rate limiting, prompt injection detection (8 patterns)
- **Session Manager** — Resumable sessions via `Mcp-Session-Id`, message redelivery
- **A2A Protocol** — Google's Agent-to-Agent standard for inter-agent communication
- **Tool Search** — Natural language search with lazy schema loading (10x context savings)
- **MCP Apps** — Interactive HTML dashboards rendered in sandboxed iframes
- **Agent Graphs** — Hierarchical DAG orchestration with topological sort
- **Agentic Sampling v2** — Server-side Plan→Execute→Evaluate→Refine loops
- **Multimodal Embeddings** — Cross-modal text+image+audio vector search
- **Dynamic Indexing** — Event-driven real-time re-indexing pipeline
- **Zero-Trust Identity** — Agent provisioning, behavioral anomaly detection, token rotation

### 🧪 v7.0 Testing Suite
- **Mobile Testing** — Android emulator + iOS simulator control, screenshots, UI trees, logcat, performance profiling
- **Web Testing** — Lighthouse audits, Core Web Vitals, responsive testing, CSS coverage, console/network/form/link/storage audits
- **API Testing** — OpenAPI discovery, contract testing, load testing, auth flow, sequence testing, diff testing
- **Accessibility Testing** — WCAG 2.1 AA/AAA audits, color contrast, keyboard navigation, ARIA validation, screen reader compat

### 🔒 Security
- OAuth 2.1 Resource Server with JWT validation
- MCP Gateway with prompt injection detection
- Zero-trust agent identity with behavioral monitoring
- Per-tool rate limiting & scope enforcement
- SQLite audit trail for all operations
- Token budget management ($5/day, $1/hr defaults)

## Quick Start

### Prerequisites
- **Node.js** 18+
- **npm** 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/Pastarafian/VegaMCP.git
cd VegaMCP

# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your API keys

# Build
npm run build
```

### Connect to VS Code (Gemini / Copilot)

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "REDACTED": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/VegaMCP/build/index.js"],
      "cwd": "/path/to/VegaMCP"
    }
  }
}
```

> **Note:** API keys can be set in the `env` block of `mcp.json` or in the `.env` file (dotenv is loaded automatically).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        VegaMCP v7.0                                   │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐       │
│  │  Memory   │  │ Browser  │  │  Sentry  │  │   Reasoning    │       │
│  │  Graph    │  │ (PW)     │  │ (errors) │  │ (Multi-Model)  │       │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘       │
│                                                                       │
│  ┌─────────────── v6.0 PROTOCOL LAYER ──────────────────────────────┐│
│  │ Structured Output • A2A Protocol • MCP Tasks • OAuth 2.1        ││
│  │ Gateway (audit/injection) • Session Manager • Tool Search        ││
│  │ MCP Apps (UI) • Agent Graphs • Agentic Sampling v2              ││
│  │ Multimodal Embeddings • Dynamic Indexing • Zero-Trust Identity  ││
│  │ Resource Links • AI Elicitation • Incremental Scope Consent     ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌─────────────── AGENT SWARM ──────────────────────────────────────┐│
│  │ ┌──────────┐  ┌──────────┐  ┌────────────┐                      ││
│  │ │ Research  │  │ Quality  │  │ Operations │  Coordinators        ││
│  │ │ (5 agts)  │  │ (2 agts) │  │ (3 agents) │                      ││
│  │ └──────────┘  └──────────┘  └────────────┘                      ││
│  │ Orchestrator: task queue • routing • pipelines • triggers       ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌─────────────── CAPABILITIES ─────────────────────────────────────┐│
│  │ Sandbox • API Gateway • Watchers • Webhooks • Workflows         ││
│  │ Knowledge Engine • GitHub • Web Search • Code Analysis          ││
│  │ Prompt Library • A/B Testing • Token Budget • Scheduling        ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌────────────────┐  ┌────────────────────────────────────┐         │
│  │  SQLite + Audit │  │  Vector Store (embeddings)          │         │
│  └────────────────┘  └────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

## Tools

**65+ tools** across 9 modules:

### Memory (6)
`create_entities` · `create_relations` · `add_observations` · `search_graph` · `open_nodes` · `delete_entities`

### Browser (8)
`browser_navigate` · `browser_click` · `browser_type` · `browser_screenshot` · `browser_snapshot` · `browser_execute_js` · `browser_console_logs` · `browser_close`

### Sentry (4)
`sentry_search_issues` · `sentry_get_issue_detail` · `sentry_get_breadcrumbs` · `sentry_resolve_issue`

### Reasoning (1)
`route_to_reasoning_model` — Routes to DeepSeek, Kimi, GPT-4o, Claude, Llama, or local Ollama

### Swarm (9)
`swarm_create_task` · `swarm_get_task_status` · `swarm_cancel_task` · `swarm_list_agents` · `swarm_agent_control` · `swarm_broadcast` · `swarm_get_metrics` · `swarm_register_trigger` · `swarm_run_pipeline`

### Research & RAG (10)
`graph_rag` · `llm_router` · `tool_discovery` · `agentic_rag` · `memory_bridge` · `hypothesis_gen` · `synthesis_engine` · `security_scanner` · `sentinel` · `stress_test`

### v6.0 Protocol (13)
`elicit` · `mcp_tasks` · `oauth_manage` · `gateway` · `session_manager` · `a2a_protocol` · `tool_search` · `mcp_apps` · `agent_graphs` · `agentic_sampling_v2` · `multimodal_embeddings` · `dynamic_indexing` · `zero_trust`

### Capabilities (19+)
`sandbox_execute` · `api_request` · `watcher_create` · `watcher_list` · `watcher_delete` · `webhook_create` · `webhook_list` · `webhook_delete` · `webhook_test` · `workflow_execute` · `knowledge_engine` · `github_scraper` · `web_search` · `prompt_library` · `code_analysis` · `token_budget` · `schedule_task` · `notify` · `ab_test`

### Testing Suite (4) 🆕
`mobile_testing` (30+ actions) · `web_testing` (10 actions) · `api_testing` (8 actions) · `accessibility` (6 actions)

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# At least one reasoning model key required
OPENROUTER_API_KEY=          # Supports ALL models via OpenRouter
DEEPSEEK_API_KEY=            # Direct DeepSeek API (R1 + Chat)
KIMI_API_KEY=                # Kimi K2.5 for coding

# Optional integrations
GITHUB_TOKEN=                # GitHub API (60→5000 req/hr)
TAVILY_API_KEY=              # AI-powered web search
SEARXNG_URL=                 # Self-hosted search fallback
SENTRY_AUTH_TOKEN=           # Error tracking
SENTRY_ORG=
SENTRY_PROJECT=

# Budget controls
TOKEN_DAILY_BUDGET_USD=5.00
TOKEN_HOURLY_BUDGET_USD=1.00

# Tool profiles
VEGAMCP_TOOL_PROFILE=full    # full | minimal | research | coding | ops
```

## Project Structure

```
VegaMCP/
├── src/
│   ├── index.ts                     # Server entry point + hub router
│   ├── mcp-extensions.ts            # Sampling, logging, progress, roots
│   ├── mcp-protocol/               # v6.0 protocol modules (15 files)
│   │   ├── structured-output.ts     # outputSchema registry
│   │   ├── elicitation.ts           # AI-driven input via Sampling
│   │   ├── resource-links.ts        # Lazy context in tool results
│   │   ├── mcp-tasks.ts             # Async tasks (SEP-1686)
│   │   ├── oauth.ts                 # OAuth 2.1 Resource Server
│   │   ├── gateway.ts               # Audit + injection detection
│   │   ├── session-manager.ts       # Session resumability
│   │   ├── a2a-protocol.ts          # Agent-to-Agent communication
│   │   ├── tool-search.ts           # NL tool search + lazy loading
│   │   ├── mcp-apps.ts              # Interactive HTML dashboards
│   │   ├── agent-graphs.ts          # Hierarchical DAG orchestration
│   │   ├── agentic-sampling-v2.ts   # Server-side agent loops
│   │   ├── multimodal-embeddings.ts # Cross-modal vector search
│   │   ├── dynamic-indexing.ts      # Event-driven reindexing
│   │   └── zero-trust.ts           # Agent identity + behavior
│   ├── db/                          # SQLite + vector store
│   ├── swarm/                       # Agent swarm (10 agents)
│   ├── tools/                       # All tool implementations
│   ├── resources/                   # MCP resource providers
│   ├── prompts/                     # MCP prompt templates
│   └── security/                    # Rate limiter, validator, guard
├── docs/                            # Architecture & module docs
├── .env.example                     # Environment template
├── package.json
└── tsconfig.json
```

## License

MIT

---

<p align="center">
  Built with TypeScript • MCP SDK • sql.js • Playwright • DeepSeek • A2A Protocol
</p>
