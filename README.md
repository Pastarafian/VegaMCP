<p align="center">
  <h1 align="center">🚀 VegaMCP v3.2</h1>
  <p align="center">
    <strong>AI Agent Swarm Platform — Multi-Model MCP Server</strong>
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tools">Tools</a> •
    <a href="#agents">Agents</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#documentation">Docs</a>
  </p>
</p>

---

> **VegaMCP** is a production-grade MCP (Model Context Protocol) server that provides an autonomous 10-agent AI swarm, persistent memory, browser automation, multi-model reasoning, and 63+ tools — all accessible via any MCP-compatible client like VS Code, Claude Desktop, or custom integrations.

## Features

### 🧠 Core Intelligence
- **Multi-Model Reasoning Router** — 9 modes (analyze, quick, code, debug, explain, debate, chain, critique, auto), 25+ models across 10 providers, multi-model debate, conversation memory
- **Knowledge Engine** — Semantic vector search with TF-IDF embeddings, auto-deduplication
- **Persistent Memory Graph** — Entity-relation knowledge graph with SQLite backing
- **Auto-Prompt Library** — 21 token-optimized templates with auto-selection from context triggers

### 🆕 v3.2 Additions
- **Multi-Mode Reasoning** — Debate (multi-model synthesis), Chain (decompose→solve→synthesize), Critique (self-review)
- **Auto-Prompt System** — Context-aware prompt selection with trigger matching
- **PolyAlgo Library** — 160+ searchable algorithms (AI, NLP, math, optimization, graphics)
- **Bug Taxonomy** — 17 categories, 400+ keywords for commit/code classification
- **Updated Models** — Claude Sonnet 4, Claude Opus 4, GPT-4.1, O3-Mini, Gemini 2.5 Flash, Llama 4 Maverick, Qwen 3-235B
- **System Prompt Presets** — 10 expert personas (engineer, mathematician, security_auditor, architect, etc.)
- **Health Check** — Full server diagnostics across 9 subsystems
- **Analytics Dashboard** — Real-time tool usage tracking, latency metrics, error rates
- **Skills Engine** — 10 built-in skills with auto-activation, vector search, GitHub import

### 🐝 Agent Swarm
- **10 Specialized Agents** across 3 coordinators (Research, Quality, Operations)
- **Autonomous Task Orchestration** — priority queue, routing, pipelines, event triggers
- **Agent DNA** — Learned performance profiles for adaptive task routing
- **Inter-Agent Communication** — Threaded conversations and pub/sub data streams

### 🔧 Capabilities
- **Code Sandbox** — Python & JavaScript execution in sandboxed environments
- **Browser Automation** — Headless Chromium via Playwright (navigate, click, type, screenshot)
- **GitHub Scraper** — Search repos/code/issues, analyze repos, generate knowledge
- **Web Search** — Tavily AI search + SearXNG fallback
- **API Gateway** — External HTTP requests with caching, rate limiting, circuit breaker
- **Webhooks & Watchers** — File system watchers and dynamic webhook endpoints
- **A/B Testing** — Compare model outputs, track performance stats
- **Scheduled Tasks** — Cron, interval, and one-time scheduling

### 🔒 Security
- Per-tool rate limiting
- Input validation & sanitization
- Path traversal guards
- Token budget management ($5/day, $1/hr defaults)
- Audit logging for all operations

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

# Run integration tests (55 tests)
node test-server.mjs
```

### Connect to VS Code (Gemini / Copilot)

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "vegamcp": {
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
┌──────────────────────────────────────────────────────────────────┐
│                       VegaMCP v3.0                               │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Memory   │  │ Browser  │  │  Sentry  │  │   Reasoning    │  │
│  │  Graph    │  │ (PW)     │  │ (errors) │  │ (Multi-Model)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
│                                                                  │
│  ┌────────────────── AGENT SWARM ─────────────────────────────┐ │
│  │ ┌──────────┐  ┌──────────┐  ┌────────────┐                │ │
│  │ │ Research  │  │ Quality  │  │ Operations │  Coordinators  │ │
│  │ │ (5 agts)  │  │ (2 agts) │  │ (3 agents) │                │ │
│  │ └──────────┘  └──────────┘  └────────────┘                │ │
│  │                                                            │ │
│  │ ┌────────────────────────────────────────────────────────┐ │ │
│  │ │  Orchestrator: task queue • routing • pipelines        │ │ │
│  │ └────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────── CAPABILITIES ────────────────────────────┐ │
│  │ Sandbox • API Gateway • Watchers • Webhooks • Workflows   │ │
│  │ Knowledge Engine • GitHub • Web Search • Code Analysis    │ │
│  │ Prompt Library • A/B Testing • Token Budget • Scheduling  │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Agents

VegaMCP includes 10 domain-agnostic AI agents organized into 3 coordinators:

| Agent | Role | Coordinator | Default Model |
|-------|------|-------------|---------------|
| **Researcher** | Deep research & knowledge gathering | Research | DeepSeek R1 |
| **Analyst** | Data analysis & pattern recognition | Research | DeepSeek R1 |
| **Coder** | Code generation & technical tasks | Research | DeepSeek Chat |
| **Planner** | Task decomposition & planning | Research | Claude 3.5 |
| **Writer** | Content creation & documentation | Research | GPT-4o |
| **Critic** | Critical analysis & feedback | Quality | DeepSeek R1 |
| **Reviewer** | Code review & quality assurance | Quality | Claude 3.5 |
| **Summarizer** | Summary generation & reporting | Operations | GPT-4o |
| **Monitor** | System health & observability | Operations | DeepSeek Chat |
| **Integrator** | Cross-system integration tasks | Operations | DeepSeek Chat |

## Tools

**47 tools** across 6 modules:

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

### Capabilities (19)
`sandbox_execute` · `api_request` · `watcher_create` · `watcher_list` · `watcher_delete` · `webhook_create` · `webhook_list` · `webhook_delete` · `webhook_test` · `workflow_execute` · `knowledge_engine` · `github_scraper` · `web_search` · `prompt_library` · `code_analysis` · `token_budget` · `schedule_task` · `notify` · `ab_test`

### Agent Tools (6)
`agent_conversation` · `agent_dna` · `data_stream` · `goal_tracker` · `reasoning_trace`

## Resources

| URI | Description |
|-----|-------------|
| `memory://entities` | All entities in the knowledge graph |
| `memory://entities/{domain}` | Entities filtered by domain |
| `memory://relations` | All entity relationships |
| `memory://domains` | Available domains |
| `memory://audit` | Recent audit log |
| `memory://stats` | Memory graph statistics |
| `sentry://issues/recent` | Recent production errors |
| `swarm://status` | Live agent status & coordinators |
| `swarm://tasks/active` | Currently running tasks |
| `swarm://metrics/dashboard` | Performance metrics |
| `swarm://triggers` | Event triggers |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# At least one reasoning model key required
OPENROUTER_API_KEY=          # Supports ALL models via OpenRouter
DEEPSEEK_API_KEY=            # Direct DeepSeek API (R1 + Chat)
KIMI_API_KEY=                # Kimi K2.5 for coding (api.kimi.com)

# Optional integrations
GITHUB_TOKEN=                # GitHub API (increases rate limit 60→5000/hr)
TAVILY_API_KEY=              # AI-powered web search
SEARXNG_URL=                 # Self-hosted search fallback
SENTRY_AUTH_TOKEN=           # Error tracking integration
SENTRY_ORG=
SENTRY_PROJECT=

# Budget controls
TOKEN_DAILY_BUDGET_USD=5.00  # Max daily API spend
TOKEN_HOURLY_BUDGET_USD=1.00 # Max hourly API spend

# Tool profiles (controls exposed tools)
VEGAMCP_TOOL_PROFILE=full    # full | minimal | research | coding | ops
```

## Project Structure

```
VegaMCP/
├── src/
│   ├── index.ts                     # Server entry point (dotenv + MCP setup)
│   ├── db/
│   │   ├── graph-store.ts           # Memory graph (SQLite)
│   │   └── swarm-store.ts           # Swarm persistence (6 tables)
│   ├── swarm/
│   │   ├── types.ts                 # Core type definitions
│   │   ├── agent-base.ts            # Abstract agent class
│   │   ├── orchestrator.ts          # Task orchestrator (singleton)
│   │   ├── agent-registry.ts        # Agent factory
│   │   └── agents/                  # 10 specialized agents
│   ├── tools/
│   │   ├── memory/                  # 6 knowledge graph tools
│   │   ├── browser/                 # 8 browser automation tools
│   │   ├── sentry/                  # 4 error tracking tools
│   │   ├── reasoning/               # Multi-model reasoning router
│   │   ├── swarm/                   # 9 swarm management tools
│   │   └── capabilities/            # 19 capability tools
│   ├── resources/                   # MCP resource providers
│   ├── prompts/                     # MCP prompt templates
│   └── security/                    # Rate limiter, input validator, path guard
├── integration/
│   ├── vegamcp_bridge.py            # FastAPI REST bridge
│   └── SwarmMonitor.tsx             # React dashboard component
├── docs/                            # Architecture & module documentation
├── test-server.mjs                  # 55 integration tests
├── .env.example                     # Environment template
├── package.json
└── tsconfig.json
```

## Integration

### FastAPI Bridge
```python
from integration.vegamcp_bridge import router
app.include_router(router, prefix="/api/v1/swarm", tags=["Swarm"])
```

### React Dashboard
```tsx
import SwarmMonitor from './integration/SwarmMonitor';
<SwarmMonitor />
```

## Supported Models

| Provider | Models | Key Required |
| --- | --- | --- |
| **DeepSeek** | deepseek-r1 (reasoning), deepseek-chat | `DEEPSEEK_API_KEY` |
| **Kimi / Moonshot** | kimi-for-coding (K2.5, 262K context) | `KIMI_API_KEY` |
| **Google Gemini** | gemini-2.0-flash, gemini-2.5-pro | `GEMINI_API_KEY` |
| **Groq** | llama-3.3-70b (fast), mixtral-8x7b | `GROQ_API_KEY` |
| **Mistral AI** | mistral-large, codestral | `MISTRAL_API_KEY` |
| **Together AI** | qwen-2.5-72b | `TOGETHER_API_KEY` |
| **xAI** | grok-3-mini | `XAI_API_KEY` |
| **OpenAI** | gpt-4o | `OPENROUTER_API_KEY` |
| **Anthropic** | claude-3.5-sonnet | `OPENROUTER_API_KEY` |
| **Meta** | llama-3.1-405b | `OPENROUTER_API_KEY` |
| **Ollama** | Any local model | None (local) |

## Test Results

```
═══════════════════════════════════════════════════════════
║  📊 VEGAMCP v3.0.0 TEST RESULTS                       ║
═══════════════════════════════════════════════════════════
║  ✅ Passed:  55   tests                                ║
║  ❌ Failed:  0    tests                                ║
║  📋 Total:   55   tests                                ║
═══════════════════════════════════════════════════════════

🎉 ALL TESTS PASSED! VegaMCP v3.0.0 is fully operational.
   10 agents • 47 tools • 11 resources • 7 prompts
```

## License

MIT

---

<p align="center">
  Built with TypeScript • MCP SDK • sql.js • Playwright • DeepSeek • Kimi K2.5
</p>
