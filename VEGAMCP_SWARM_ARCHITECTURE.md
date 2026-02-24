# VegaMCP v3.0 — Enhanced Intelligence Platform

## Architecture Overview

VegaMCP is a general-purpose MCP (Model Context Protocol) server that provides AI agents with a powerful multi-agent swarm platform enhanced with semantic knowledge, web intelligence, and code analysis capabilities. It exposes **47 tools**, 7 resources, and 7 prompt templates for orchestrating autonomous agent workflows.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    MCP HOST (Antigravity, etc.)                   │
│          AI sends tool calls → VegaMCP processes                  │
│          Tool profile → Only relevant schemas sent                │
└────────────────────────┬─────────────────────────────────────────┘
                         │  stdio / JSON-RPC 2.0
┌────────────────────────▼─────────────────────────────────────────┐
│                      VegaMCP Server v3.0                          │
│                                                                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐ │
│  │  Memory    │  │  Browser   │  │  Sentry    │  │ Reasoning     │ │
│  │ (6 tools)  │  │ (8 tools)  │  │ (4 tools)  │  │ (1 tool)      │ │
│  │            │  │            │  │            │  │ +Kimi +Ollama │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────┘ │
│                                                                   │
│  ┌─────────── v3.0 Intelligence Layer ─────────────────────────┐ │
│  │                                                              │ │
│  │  🧮 Token Budget    🔍 Web Search     🐙 GitHub Scraper    │ │
│  │  📋 Prompt Library  🔬 Code Analysis  🧠 Knowledge Engine  │ │
│  │  🏠 Ollama Fallback 🎯 Lazy Loading   🔄 Deduplication     │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │           Agent Swarm Orchestrator (10 agents)             │    │
│  │  Research (5) │ Quality (2) │ Operations (3)               │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌────────────────┐  ┌──────────────────────────────────────┐    │
│  │  SQLite Database │  │  Embedded Vector Store                │    │
│  │  Memory + Audit  │  │  knowledge | code_snippets | prompts │    │
│  └────────────────┘  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tool Inventory (47 tools)

### Memory Module (6 tools)

| Tool | Description |
|------|-------------|
| `create_entities` | Create knowledge graph nodes |
| `create_relations` | Link entities with typed relationships |
| `add_observations` | Append facts to entities |
| `search_graph` | Semantic search across the graph |
| `open_nodes` | Retrieve entities by exact name |
| `delete_entities` | Remove entities and their relations |

### Browser Module (8 tools)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL |
| `browser_click` | Click elements by selector/text/role |
| `browser_type` | Type into input fields |
| `browser_screenshot` | Capture page screenshots |
| `browser_snapshot` | Get accessibility tree |
| `browser_execute_js` | Run JavaScript in page context |
| `browser_console_logs` | Read captured console messages |
| `browser_close` | Close browser session |

### Sentry Module (4 tools)

| Tool | Description |
|------|-------------|
| `sentry_search_issues` | Search for error issues |
| `sentry_get_issue_detail` | Get full issue details |
| `sentry_get_breadcrumbs` | Get event breadcrumbs |
| `sentry_resolve_issue` | Resolve/unresolve issues |

### Reasoning Module (1 tool, enhanced)

| Tool | Description |
|------|-------------|
| `route_to_reasoning_model` | Route to DeepSeek-R1, GPT-4o, Claude, Llama, **Kimi (128K)**, or **local Ollama** |

### Swarm Management (9 tools)

| Tool | Description |
|------|-------------|
| `swarm_create_task` | Create tasks for agent processing |
| `swarm_get_task_status` | Check task status & output |
| `swarm_cancel_task` | Cancel running/queued tasks |
| `swarm_list_agents` | List all agents with status |
| `swarm_agent_control` | Start/stop/pause/restart agents |
| `swarm_broadcast` | Send messages to agent groups |
| `swarm_get_metrics` | Get performance metrics |
| `swarm_register_trigger` | Create event-driven triggers |
| `swarm_run_pipeline` | Execute multi-step pipelines |

### Capabilities (13 tools)

| Tool | Description |
|------|-------------|
| `sandbox_execute` | Execute code in sandboxed environment |
| `api_request` | Make HTTP API requests with caching |
| `watcher_create/list/delete` | File/URL change watchers |
| `webhook_create/list/delete/test` | Webhook endpoints |
| `workflow_execute` | Execute workflow templates |
| `schedule_task` | Cron/interval/one-time scheduling |
| `notify` | Multi-channel notifications |
| `agent_conversation` | Inter-agent messaging |
| `agent_dna` | Agent performance profiling |
| `reasoning_trace` | Decision audit trail |
| `data_stream` | Pub/sub data channels |
| `goal_tracker` | Project goal management |
| `ab_test` | A/B test prompt comparison |

### v3.0 Intelligence Layer (6 tools)

| Tool | Description |
|------|-------------|
| `token_budget` | Track token usage, set budgets, auto-downgrade models when over budget |
| `knowledge_engine` | Semantic search via embedded vector store, auto-deduplication, batch operations |
| `github_scraper` | Search GitHub code/repos, fetch files, AI analysis, synthetic knowledge generation |
| `web_search` | Tavily + SearXNG search, URL extraction, auto-summarization, batch search |
| `prompt_library` | 12 built-in templates, variable interpolation, usage tracking, semantic search |
| `code_analysis` | Static analysis for 5 languages (TS/JS/Python/Rust/Go), complexity metrics |

---

## v3.0 Model Support

| Model | Provider | Context | Cost (input/1K) | Best For |
|-------|----------|---------|------------------|----------|
| `deepseek/deepseek-r1` | OpenRouter/Direct | 32K | $0.00055 | Deep reasoning, chain-of-thought |
| `deepseek/deepseek-chat` | OpenRouter/Direct | 32K | $0.00014 | General tasks, cheapest API |
| `anthropic/claude-3.5-sonnet` | OpenRouter | 200K | $0.003 | Code review, architecture |
| `openai/gpt-4o` | OpenRouter | 128K | $0.0025 | Content, documentation |
| `meta-llama/llama-3.1-405b` | OpenRouter | 128K | $0.003 | Open-source, large context |
| `moonshot/kimi-128k` | Direct Kimi | **128K** | $0.00084 | **Long documents, Chinese** |
| `moonshot/kimi-32k` | Direct Kimi | 32K | $0.00034 | Cost-effective analysis |
| `moonshot/kimi-8k` | Direct Kimi | 8K | $0.000017 | **Ultra-cheap** summarization |
| `ollama/auto` | Local | Varies | **$0.00** | **Free** local inference |

---

## Tool Profiles (Lazy Loading)

| Profile | Tools | Token Savings | Use Case |
|---------|-------|---------------|----------|
| `full` | 47 | — | Everything (default) |
| `minimal` | ~10 | ~80% schema savings | Budget-conscious, simple tasks |
| `research` | ~28 | ~40% schema savings | Research, web scraping, analysis |
| `coding` | ~25 | ~45% schema savings | Code generation, review, analysis |
| `ops` | ~32 | ~30% schema savings | Swarm management, monitoring |

Set via: `VEGAMCP_TOOL_PROFILE=research` in `.env`

---

## Version

**VegaMCP v3.0.0** — Enhanced Intelligence Platform

### Changelog v2.0 → v3.0

- ✅ Token Budget Manager with auto-model-downgrade
- ✅ Kimi / Moonshot AI integration (128K context)
- ✅ Local Ollama fallback (free inference)
- ✅ Embedded Vector Store (semantic search, deduplication)
- ✅ Knowledge Engine (3 collections: knowledge, code_snippets, prompts)
- ✅ GitHub Scraper + AI code analysis + synthetic knowledge generation
- ✅ Web Search (Tavily API + SearXNG fallback)
- ✅ Prompt Template Library (12 built-in, variable interpolation)
- ✅ Code Analysis Engine (5 languages, complexity metrics)
- ✅ Lazy Tool Loading (5 profiles for token optimization)
- ✅ New rate limit categories for all v3.0 tools
