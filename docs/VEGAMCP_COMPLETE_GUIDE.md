# VegaMCP v3.0.0 â€” Complete Design & Usage Guide

> **Version:** 3.0.0 â€” Enhanced Intelligence Platform
> **Last Updated:** 2026-02-23
> **Runtime:** Node.js 20+ / TypeScript 5.x
> **Transport:** stdio (JSON-RPC 2.0, zero-latency)
> **SDK:** `@modelcontextprotocol/sdk`
> **Test Status:** 71/71 passing âœ…

---

## Table of Contents

1. [What is VegaMCP?](#1-what-is-vegamcp)
2. [Architecture Overview](#2-architecture-overview)
3. [Getting Started](#3-getting-started)
4. [Configuration Reference](#4-configuration-reference)
5. [Tool Profiles (Lazy Loading)](#5-tool-profiles-lazy-loading)
6. [Complete Tool Reference (47 Tools)](#6-complete-tool-reference-47-tools)
   - [Memory Module (6)](#61-memory-module-6-tools)
   - [Browser Module (8)](#62-browser-module-8-tools)
   - [Sentry Module (4)](#63-sentry-module-4-tools)
   - [Reasoning Module (1)](#64-reasoning-module-1-tool)
   - [Swarm Management (9)](#65-swarm-management-9-tools)
   - [Capabilities (13)](#66-capabilities-13-tools)
   - [v3.0 Intelligence Layer (6)](#67-v30-intelligence-layer-6-tools)
7. [Resources (10)](#7-resources-10)
8. [Prompts (7)](#8-prompts-7)
9. [Agent Swarm Architecture](#9-agent-swarm-architecture)
10. [Model Support (9 Models)](#10-model-support-9-models)
11. [Security & Guardrails](#11-security--guardrails)
12. [Database & Storage](#12-database--storage)
13. [v3.0 Feature Deep-Dives](#13-v30-feature-deep-dives)
14. [Workflows & Pipelines](#14-workflows--pipelines)
15. [Testing](#15-testing)
16. [Changelog](#16-changelog)

---

## 1. What is VegaMCP?

VegaMCP is a **general-purpose MCP (Model Context Protocol) server** that gives AI agents a comprehensive suite of capabilities to perform autonomous work. It operates as a "supercharged toolbox" that connects AI assistants (like Google Antigravity's Gemini) to:

- **Persistent memory** â€” a knowledge graph that survives across sessions
- **Browser automation** â€” full Playwright-powered headless browsing
- **Production monitoring** â€” Sentry error tracking integration
- **Multi-model reasoning** â€” route problems to 9 different AI models (including free local Ollama)
- **An autonomous agent swarm** â€” 10 specialized agents with task orchestration
- **Web intelligence** â€” search the web (Tavily/SearXNG), scrape GitHub, analyze code
- **Knowledge management** â€” semantic vector search, prompt templates, token budgeting

### Purpose

VegaMCP exists so that an AI coding assistant can:

1. **Remember** knowledge across conversations (Memory Graph)
2. **See** web pages and interact with them (Browser)
3. **Debug** production errors by pulling live data (Sentry)
4. **Think deeply** by delegating to specialized models (Reasoning Router)
5. **Coordinate work** through multiple AI agents (Swarm)
6. **Research** topics by searching the web and GitHub (Web Search, GitHub Scraper)
7. **Analyze code** without sending it to expensive models (Code Analysis)
8. **Optimize costs** by tracking token usage and auto-switching models (Token Budget)

### How It Works

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚     AI ASSISTANT (Antigravity)      â”‚
â”‚     Sends JSON-RPC tool calls       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚ stdio (stdin/stdout)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚        VegaMCP Server v3.0          â”‚
â”‚                                     â”‚
â”‚  Receives tool call â†’ validates â†’   â”‚
â”‚  routes to module â†’ executes â†’      â”‚
â”‚  returns structured JSON result     â”‚
â”‚                                     â”‚
â”‚  47 Tools | 10 Resources | 7 Promptsâ”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

The AI assistant sends a tool call like `create_entities` or `web_search`, VegaMCP processes it through the appropriate module, and returns the result as structured JSON. All communication happens over **stdio** (standard input/output) for zero-latency local operation.

---

## 2. Architecture Overview

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    MCP HOST (Antigravity, etc.)                   â”‚
â”‚          Tool Profile â†’ Only relevant schemas sent                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                         â”‚  stdio / JSON-RPC 2.0
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                      VegaMCP Server v3.0                          â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ Memory   â”‚  â”‚ Browser  â”‚  â”‚ Sentry   â”‚  â”‚ Reasoning      â”‚   â”‚
â”‚  â”‚ Graph    â”‚  â”‚Playwrightâ”‚  â”‚ Observa- â”‚  â”‚ Router         â”‚   â”‚
â”‚  â”‚ 6 tools  â”‚  â”‚ 8 tools  â”‚  â”‚ bility   â”‚  â”‚ +Kimi +Ollama  â”‚   â”‚
â”‚  â”‚          â”‚  â”‚          â”‚  â”‚ 4 tools  â”‚  â”‚ 1 tool         â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ v3.0 Intelligence Layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ ðŸ§® Token Budget   â”‚ ðŸ§  Knowledge Engine â”‚ ðŸ™ GitHub Scraperâ”‚ â”‚
â”‚  â”‚ ðŸ” Web Search     â”‚ ðŸ“‹ Prompt Library   â”‚ ðŸ”¬ Code Analysis â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Capabilities Layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ Sandbox â”‚ API Gateway â”‚ Watchers â”‚ Webhooks â”‚ Workflows     â”‚ â”‚
â”‚  â”‚ Scheduler â”‚ Notifications â”‚ Agent DNA â”‚ Data Streams        â”‚ â”‚
â”‚  â”‚ Conversations â”‚ Reasoning Traces â”‚ Goal Tracker â”‚ A/B Test  â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Agent Swarm Orchestrator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚  Research (5 agents)  â”‚  Quality (2)  â”‚  Operations (3)     â”‚ â”‚
â”‚  â”‚  researcher, analyst, â”‚  critic,      â”‚  integrator,        â”‚ â”‚
â”‚  â”‚  writer, coder,       â”‚  reviewer     â”‚  monitor,           â”‚ â”‚
â”‚  â”‚  planner              â”‚               â”‚  summarizer         â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ SQLite Database  â”‚  â”‚ Embedded Vector Store                 â”‚  â”‚
â”‚  â”‚ Memory + Audit   â”‚  â”‚ TF-IDF + Cosine Similarity           â”‚  â”‚
â”‚  â”‚ Swarm + Budgets  â”‚  â”‚ knowledge | code_snippets | prompts  â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚           Security Guardrails Layer                         â”‚  â”‚
â”‚  â”‚  Path Guard Â· Rate Limiter (12 categories) Â· Input Validatorâ”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Key Design Principles

- **Zero-config startup** â€” SQLite database creates itself, no external services required
- **Progressive enhancement** â€” features activate based on which API keys you provide
- **Cost-aware** â€” Token Budget Manager auto-switches to cheaper models when budget runs low
- **Modular** â€” each tool module is independently testable
- **Profile-based loading** â€” only expose the tools you need to save token overhead
- **Security-first** â€” every tool call goes through rate limiting, input validation, and path guarding

---

## 3. Getting Started

### Prerequisites

- **Node.js 20+** (required)
- **npm** (comes with Node.js)
- **Playwright browsers** (auto-installed on first use)

### Installation

```bash
# Clone or navigate to the project
cd VegaMCP

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys (see Section 4)
# At minimum, add ONE of: OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or KIMI_API_KEY

# Build TypeScript
npm run build

# Run tests to verify
node test-server.mjs
```

### Connecting to Antigravity

Add this to your Antigravity `mcp_config.json`:

```json
{
  "mcpServers": {
    "vegamcp": {
      "command": "node",
      "args": ["/path/to/VegaMCP/build/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Development Mode

```bash
# Hot-reload development (uses tsx)
npm run dev

# Type-check without building
npx tsc --noEmit

# Full build
npm run build

# Run integration tests
node test-server.mjs
```

---

## 4. Configuration Reference

All configuration is done through environment variables in `.env`.

### Required (at least one reasoning provider)

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key (supports ALL models) | `sk-or-v1-...` |
| `DEEPSEEK_API_KEY` | Direct DeepSeek API key | `sk-...` |
| `KIMI_API_KEY` | Moonshot/Kimi API key (128K context) | `sk-...` |

### Optional â€” External Services

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_URL` | Local Ollama server URL (free inference) | `http://localhost:11434` |
| `SENTRY_AUTH_TOKEN` | Sentry API token | â€” |
| `SENTRY_ORG` | Sentry organization slug | â€” |
| `SENTRY_PROJECT` | Sentry project slug | â€” |
| `GITHUB_TOKEN` | GitHub personal access token (increases rate limit from 60 â†’ 5000/hr) | â€” |
| `TAVILY_API_KEY` | Tavily AI Search API key (primary web search) | â€” |
| `SEARXNG_URL` | SearXNG self-hosted search URL (web search fallback) | â€” |

### Optional â€” Budgets & Profiles

| Variable | Description | Default |
|----------|-------------|---------|
| `TOKEN_DAILY_BUDGET_USD` | Maximum daily token spending in USD | `5.00` |
| `TOKEN_HOURLY_BUDGET_USD` | Maximum hourly token spending in USD | `1.00` |
| `VEGAMCP_TOOL_PROFILE` | Which tools to expose: `full`, `minimal`, `research`, `coding`, `ops` | `full` |
| `WORKSPACE_ROOT` | Root directory for path validation | Auto-detected |
| `DATA_DIR` | Directory for SQLite + vector store data | `./data` |

### Feature Activation Matrix

| Feature | Required Config | Without Config |
|---------|----------------|----------------|
| Memory Graph | None (built-in) | Always active |
| Browser | None (Playwright auto-installs) | Always active |
| Sentry | `SENTRY_AUTH_TOKEN` + org + project | Tools hidden |
| Reasoning (API) | Any API key | Tool hidden |
| Reasoning (Local) | Ollama installed | Falls back to API |
| Token Budget | None (built-in) | Always active |
| Knowledge Engine | None (built-in) | Always active |
| GitHub Scraper | None (works without token at 60 req/hr) | Always active |
| Web Search | `TAVILY_API_KEY` or `SEARXNG_URL` | Tool hidden |
| Prompt Library | None (built-in) | Always active |
| Code Analysis | None (built-in) | Always active |

---

## 5. Tool Profiles (Lazy Loading)

VegaMCP can expose **47 tools**, but many use cases only need a subset. Tool Profiles control which tools are sent to the AI host, dramatically reducing the token cost of tool schemas in every request.

Set in `.env`:

```env
VEGAMCP_TOOL_PROFILE=full
```

| Profile | Tools Loaded | Token Savings | Best For |
|---------|-------------|---------------|----------|
| **`full`** | ~47 | â€” | Everything (default) |
| **`minimal`** | ~10 | ~80% | Simple tasks, budget-conscious usage |
| **`research`** | ~28 | ~40% | Research, web scraping, analysis |
| **`coding`** | ~25 | ~45% | Code generation, review, debugging |
| **`ops`** | ~32 | ~30% | Swarm management, monitoring, DevOps |

### What's in each profile

| Module | `full` | `minimal` | `research` | `coding` | `ops` |
|--------|--------|-----------|------------|----------|-------|
| Memory (6) | âœ… | âœ… | âœ… | âœ… | âœ… |
| Reasoning (1) | âœ… | âœ… | âœ… | âœ… | âœ… |
| Token Budget (1) | âœ… | âœ… | âœ… | âœ… | âœ… |
| Knowledge Engine (1) | âœ… | âœ… | âœ… | âœ… | âœ… |
| Prompt Library (1) | âœ… | âœ… | âœ… | âœ… | âœ… |
| Browser (8) | âœ… | â€” | âœ… | â€” | â€” |
| Sentry (4) | âœ… | â€” | â€” | â€” | âœ… |
| Swarm (9) | âœ… | â€” | â€” | â€” | âœ… |
| Sandbox (1) | âœ… | â€” | â€” | âœ… | â€” |
| API Gateway (1) | âœ… | â€” | â€” | â€” | âœ… |
| Watchers/Webhooks (6) | âœ… | â€” | â€” | â€” | âœ… |
| Workflow/Schedule (3) | âœ… | â€” | â€” | â€” | âœ… |
| Agent Collab (6) | âœ… | â€” | âœ… | âœ… | âœ… |
| GitHub Scraper (1) | âœ… | â€” | âœ… | âœ… | â€” |
| Web Search (1) | âœ… | â€” | âœ… | â€” | â€” |
| Code Analysis (1) | âœ… | â€” | â€” | âœ… | â€” |

---

## 6. Complete Tool Reference (47 Tools)

### 6.1 Memory Module (6 tools)

The Memory Module provides a **persistent knowledge graph** stored in SQLite. Entities survive across sessions and can be searched, linked, and annotated.

#### `create_entities`

Create new knowledge nodes in the graph.

```json
{
  "entities": [
    {
      "name": "API Style Guide",
      "type": "convention",
      "domain": "coding-style",
      "observations": ["All API endpoints use camelCase", "REST resources are plural nouns"]
    }
  ]
}
```

**Entity types:** `service`, `convention`, `pattern`, `bug-fix`, `dependency`, `config`, `concept`

#### `create_relations`

Link entities with typed, weighted relationships.

```json
{
  "relations": [
    {
      "from": "UserService",
      "to": "PostgreSQL",
      "type": "depends_on",
      "strength": 0.9,
      "context": "Primary data store for user records"
    }
  ]
}
```

**Relation types:** `depends_on`, `implements`, `uses`, `fixed_by`, `related_to`, `contains`, `overrides`

#### `add_observations`

Append timestamped facts to an existing entity. Observations are **append-only** (changelog style).

```json
{ "entity": "API Style Guide", "observations": ["Added pagination convention: use ?page=N&limit=M"] }
```

#### `search_graph`

Full-text + fuzzy search across entity names, types, domains, and observations.

```json
{ "query": "camelCase API", "domain": "coding-style", "limit": 10 }
```

#### `open_nodes`

Retrieve specific entities by their exact names, including all observations and relationships.

```json
{ "names": ["API Style Guide", "UserService"] }
```

#### `delete_entities`

Remove entities and all their associated relations and observations.

```json
{ "names": ["Obsolete Pattern"] }
```

---

### 6.2 Browser Module (8 tools)

Full **Playwright-powered** headless browser for web interaction, testing, and scraping. The browser session is lazy-initialized on first use.

#### `browser_navigate`

Navigate to a URL and wait for page load.

```json
{ "url": "https://example.com", "waitUntil": "networkidle", "timeout": 30000 }
```

**Wait options:** `domcontentloaded` (default), `load`, `networkidle`

#### `browser_click`

Click an element found by CSS selector, text content, or ARIA role.

```json
{ "selector": "#submit-btn" }
// or
{ "text": "Sign In" }
// or
{ "role": "button" }
```

#### `browser_type`

Type text into an input field. Supports clearing existing content and pressing Enter.

```json
{ "selector": "#search-input", "text": "VegaMCP documentation", "clearFirst": true, "pressEnter": true }
```

#### `browser_screenshot`

Capture the current page as a PNG image.

```json
{ "fullPage": true }
// or capture a specific element
{ "selector": ".dashboard-chart" }
```

#### `browser_snapshot`

Get the **accessibility tree** of the page â€” far more useful than screenshots for LLMs to understand page structure.

```json
{ "root": ".main-content" }
```

#### `browser_execute_js`

Execute arbitrary JavaScript in the page context and return the result.

```json
{ "code": "document.querySelectorAll('a').length" }
```

#### `browser_console_logs`

Retrieve captured console messages (log, warn, error, info) since last check.

```json
{ "level": "error" }
```

**Levels:** `all`, `log`, `warn`, `error`, `info`

#### `browser_close`

Close the browser session and free resources. Auto-relaunches on next browser tool call.

---

### 6.3 Sentry Module (4 tools)

Live production error monitoring via the **Sentry API**. Only available when `SENTRY_AUTH_TOKEN` is configured.

#### `sentry_search_issues`

Search and filter Sentry issues.

```json
{ "query": "TypeError", "status": "unresolved", "level": "error", "limit": 10 }
```

#### `sentry_get_issue_detail`

Get full stack trace, environment info, tags, and metadata for a specific issue.

```json
{ "issue_id": "PROJ-1234" }
```

#### `sentry_get_breadcrumbs`

Get user navigation trail (breadcrumbs) leading up to an error event.

```json
{ "issue_id": "PROJ-1234" }
```

#### `sentry_resolve_issue`

Mark an issue as resolved (or unresolve it).

```json
{ "issue_id": "PROJ-1234", "status": "resolved" }
```

---

### 6.4 Reasoning Module (1 tool)

The **Multi-Model Reasoning Router** delegates complex problems to specialized AI models. v3.0 adds Kimi (128K context), Ollama (free local), and token budget integration.

#### `route_to_reasoning_model`

```json
{
  "problem": "Design an efficient algorithm to find the longest palindromic substring in O(n) time.",
  "model": "deepseek/deepseek-r1",
  "includeMemoryContext": true,
  "maxTokens": 4096,
  "temperature": 0.2,
  "checkBudget": true
}
```

**Available models:**

| Model | Best For | Cost |
|-------|----------|------|
| `deepseek/deepseek-r1` | Deep reasoning, chain-of-thought | $0.00055/1K |
| `deepseek/deepseek-chat` | General tasks, cheapest API | $0.00014/1K |
| `anthropic/claude-3.5-sonnet` | Code review, architecture | $0.003/1K |
| `openai/gpt-4o` | Content, documentation | $0.0025/1K |
| `meta-llama/llama-3.1-405b` | Open-source, multilingual | $0.003/1K |
| `moonshot/kimi-128k` | Long documents (128K context!) | $0.00084/1K |
| `moonshot/kimi-32k` | Cost-effective analysis | $0.00034/1K |
| `moonshot/kimi-8k` | Ultra-cheap summarization | $0.000017/1K |
| `ollama/auto` | **FREE** local inference | $0.00 |

**Features:**

- **Chain-of-thought extraction** â€” automatically separates reasoning from answers for DeepSeek R1
- **Memory context injection** â€” enriches prompt with relevant knowledge from the graph
- **Token budget integration** â€” auto-downgrades to cheaper model when budget runs low
- **Multi-provider fallback** â€” OpenRouter â†’ DeepSeek Direct â†’ Kimi Direct â†’ Ollama
- **Ollama auto-detection** â€” detects installed local models and selects the best one

---

### 6.5 Swarm Management (9 tools)

The **Agent Swarm** provides 10 specialized AI agents organized into 3 coordinator groups. Each agent is mapped to a preferred LLM model.

#### `swarm_create_task`

Create a task for agent processing. Tasks are automatically routed to the appropriate coordinator and agent.

```json
{
  "task_type": "research",
  "priority": 1,
  "input_data": { "topic": "AI agent architectures", "depth": "deep" },
  "timeout": 300
}
```

**Supported task types:** `research`, `deep_research`, `web_research`, `data_analysis`, `pattern_analysis`, `trend_analysis`, `content_creation`, `documentation`, `code_generation`, `code_review`, `debugging`, `refactoring`, `planning`, `task_decomposition`, `review`, `validation`, `testing`, `critique`, `feedback`, `integration`, `monitoring`, `health_check`, `summarize`, `generate_report`

**Priority levels:** `0` = emergency, `1` = high, `2` = normal, `3` = background

#### `swarm_get_task_status`

Check the status, assigned agent, output data, and subtasks of a task.

```json
{ "task_id": "task-abc123" }
```

#### `swarm_cancel_task`

Cancel a queued or running task.

```json
{ "task_id": "task-abc123", "reason": "No longer needed" }
```

#### `swarm_list_agents`

List all agents with their status, role, coordinator, model, and performance stats.

```json
{ "coordinator": "research", "status": "idle" }
```

#### `swarm_agent_control`

Start, stop, pause, or restart individual agents.

```json
{ "agent_id": "researcher", "action": "start" }
```

#### `swarm_broadcast`

Send a message to all agents or a filtered subset.

```json
{ "message": "Priority shift: focus on code review tasks", "coordinator": "quality" }
```

#### `swarm_get_metrics`

Retrieve performance metrics for the swarm or individual agents.

```json
{ "summary": true }
// or
{ "agent_id": "researcher", "metric_name": "task_latency_ms" }
```

#### `swarm_register_trigger`

Create event-driven triggers that auto-create tasks when conditions are met.

```json
{
  "trigger_type": "threshold",
  "condition": { "source": "monitor", "metric": "error_rate", "threshold": 0.05 },
  "action": { "task_type": "debugging", "priority": 1 },
  "cooldown": 300
}
```

**Trigger types:** `event`, `schedule`, `webhook`, `threshold`, `manual`

#### `swarm_run_pipeline`

Execute a multi-step pipeline â€” a chain of agent tasks with conditional branching.

```json
{
  "name": "Code Review Pipeline",
  "initial_step": "analyze",
  "steps": [
    { "step_id": "analyze", "task_type": "code_review", "on_success": "critique", "on_failure": "report" },
    { "step_id": "critique", "task_type": "critique", "on_success": "report" },
    { "step_id": "report", "task_type": "generate_report" }
  ]
}
```

---

### 6.6 Capabilities (13 tools)

General-purpose tools for agent coordination, infrastructure, and operations.

#### `sandbox_execute`

Execute code in a sandboxed environment with resource limits.

```json
{ "code": "console.log(2 + 2)", "environment": "javascript", "timeout": 10 }
```

**Environments:** `python`, `javascript`

#### `api_request`

Make HTTP requests through the API gateway with caching, rate limiting, and circuit breaking.

```json
{ "url": "https://api.example.com/data", "method": "GET", "cache_ttl": 300, "timeout": 10000 }
```

#### `watcher_create` / `watcher_list` / `watcher_delete`

File system watchers that trigger swarm tasks when files change.

```json
{ "path": "./src", "action_type": "create_task", "task_type": "code_review", "cooldown": 60 }
```

#### `webhook_create` / `webhook_list` / `webhook_delete` / `webhook_test`

Dynamic webhook endpoints that create swarm tasks when called externally.

```json
{ "name": "Deploy Hook", "task_type": "integration", "priority": 1 }
```

#### `workflow_execute`

Execute pre-built workflow templates or custom state machines.

```json
{ "template": "research_report", "input": { "topic": "WebAssembly performance" } }
```

**Built-in templates:** `research_report`, `code_pipeline`, `content_creation`

#### `schedule_task`

Create cron, interval, or one-time scheduled tasks.

```json
{ "action": "create", "name": "Hourly Health Check", "schedule_type": "interval", "expression": "3600000", "task_type": "health_check" }
```

#### `notify`

Send notifications to the system with severity levels.

```json
{ "action": "send", "title": "Build Complete", "body": "All tests passed", "level": "success", "channel": "system" }
```

**Levels:** `info`, `success`, `warning`, `error`

#### `agent_conversation`

Inter-agent messaging with threaded conversations.

```json
{ "action": "create_thread", "participants": ["researcher", "analyst"], "topic": "Architecture Discussion" }
```

#### `agent_dna`

Learned performance profiles that enable adaptive task routing based on historical success rates.

```json
{ "action": "record", "agent_id": "researcher", "task_type": "research", "success": true, "duration_ms": 5000 }
```

#### `reasoning_trace`

Structured audit trail for agent decisions with alternatives analysis.

```json
{ "action": "create", "title": "Model Selection Decision", "task_id": "task-123" }
```

#### `data_stream`

Pub/sub data channels for reactive agent coordination.

```json
{ "action": "create", "stream": "research-findings", "description": "Findings from web research" }
```

#### `goal_tracker`

Persistent project goals with sub-goals, progress tracking, and deadlines.

```json
{ "action": "create", "title": "Ship v3.0", "category": "development", "success_criteria": ["All tests pass", "Docs complete"] }
```

#### `ab_test`

A/B test prompts across different models. Record results and query stats.

```json
{
  "action": "record",
  "task_type": "summarization",
  "prompt": "Summarize this article",
  "winner": "deepseek-r1",
  "results": [
    { "model": "deepseek-r1", "score": 9, "duration_ms": 3000 },
    { "model": "gpt-4o", "score": 7, "duration_ms": 2000 }
  ]
}
```

---

### 6.7 v3.0 Intelligence Layer (6 tools)

These are the **new tools added in v3.0** that provide enhanced intelligence capabilities.

#### `token_budget` ðŸ§®

Track token usage across ALL AI models, enforce configurable budgets, and auto-recommend cheaper models.

**Actions:**

| Action | Description |
|--------|-------------|
| `get_usage` | Current daily/hourly usage with budget warnings |
| `set_budget` | Update daily/hourly spending limits |
| `get_budget` | View current limits and full cost map for all 9 models |
| `check_model` | Check if a specific model call is within budget |
| `get_recommendation` | AI recommends the best model based on remaining budget |
| `get_history` | Per-model, per-day spending history |

```json
// Check if you can afford a DeepSeek R1 call
{ "action": "check_model", "model": "deepseek/deepseek-r1", "estimated_tokens": 8000 }

// Get AI recommendation
{ "action": "get_recommendation" }
// â†’ "Budget healthy â€” use best reasoning model (deepseek/deepseek-r1)"
// or â†’ "Budget at 80% â€” use cheapest API model (deepseek/deepseek-chat)"
// or â†’ "Budget exhausted â€” use free local model (ollama/local)"
```

#### `knowledge_engine` ðŸ§ 

Semantic knowledge base powered by the embedded vector store. Uses **TF-IDF + cosine similarity** for zero-dependency semantic search.

**Actions:**

| Action | Description |
|--------|-------------|
| `search` | Semantic search with similarity scoring |
| `add` | Add content with automatic duplicate detection |
| `batch_add` | Add up to 50 items at once |
| `similar` | Find content similar to a given text |
| `deduplicate` | Find duplicate pairs above a similarity threshold |
| `stats` | Collection sizes and store health |
| `delete` | Remove a specific entry |
| `clear_collection` | Clear all entries from a collection |

**Collections:** `knowledge`, `code_snippets`, `prompt_templates`

```json
// Add knowledge
{ "action": "add", "content": "React hooks must be called at the top level", "collection": "knowledge", "metadata": { "topic": "react", "source": "docs" } }

// Semantic search
{ "action": "search", "query": "React state management patterns", "collection": "knowledge", "limit": 5, "threshold": 0.2 }
```

#### `github_scraper` ðŸ™

Search GitHub for code, repos, and trending projects. Fetch files and generate synthetic knowledge.

**Actions:**

| Action | Description |
|--------|-------------|
| `search_code` | Search GitHub code (files, functions, patterns) |
| `search_repos` | Search repositories by stars, language, topic |
| `search_issues` | Search open issues across GitHub |
| `fetch_file` | Fetch a specific file from a repository |
| `analyze_repo` | Full repo analysis: README, file tree, tech stack |
| `generate_knowledge` | Auto-generate knowledge entries from GitHub search results |
| `trending` | Discover trending repos (daily/weekly/monthly) |

```json
// Search for TypeScript MCP implementations
{ "action": "search_code", "query": "MCP server implementation", "language": "typescript", "per_page": 10, "store_results": true }

// Analyze a repository
{ "action": "analyze_repo", "owner": "modelcontextprotocol", "repo": "servers", "store_results": true }

// Generate knowledge from GitHub
{ "action": "generate_knowledge", "query": "agent swarm architecture", "language": "typescript" }

// Find trending AI projects this week
{ "action": "trending", "language": "python", "since": "weekly" }
```

#### `web_search` ðŸ”

Search the web using **Tavily AI Search** (primary) or **SearXNG** (self-hosted fallback). Includes URL content extraction and summarization.

**Actions:**

| Action | Description |
|--------|-------------|
| `search` | Web search with AI-generated answer summary |
| `read_url` | Extract clean text content from any URL |
| `summarize_url` | Fetch a URL and auto-generate a condensed summary |
| `batch_search` | Run up to 5 search queries in one call |

```json
// Search the web
{ "action": "search", "query": "best practices for MCP server design 2024", "num_results": 5, "search_depth": "advanced", "include_answer": true, "store_results": true }

// Read a URL
{ "action": "read_url", "url": "https://modelcontextprotocol.io/docs", "max_content_length": 5000 }

// Batch search
{ "action": "batch_search", "queries": ["TypeScript best practices", "Node.js performance tips", "SQLite optimization"] }
```

#### `prompt_library` ðŸ“‹

Reusable, token-optimized prompt templates with `{{variable}}` interpolation.

**12 Built-in Templates:**

| Template | Category | Variables |
|----------|----------|-----------|
| `code_review` | coding | `language`, `code` |
| `debug_error` | coding | `language`, `error`, `context`, `expected` |
| `refactor` | coding | `language`, `code`, `goal`, `constraints` |
| `summarize_docs` | research | `content` |
| `security_audit` | security | `target`, `code` |
| `architecture_design` | architecture | `requirement`, `constraints`, `scale`, `stack` |
| `api_design` | architecture | `domain`, `entities`, `operations` |
| `test_generation` | testing | `test_type`, `language`, `code`, `framework` |
| `explain_code` | education | `language`, `code`, `audience` |
| `data_analysis` | analysis | `data`, `questions` |
| `research_synthesis` | research | `topic`, `sources` |
| `weekly_report` | reporting | `report_type`, `accomplishments`, `blockers`, `next_steps`, `metrics` |

**Actions:**

```json
// Use a built-in template
{ "action": "use", "name": "code_review", "variables": { "language": "python", "code": "def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)" } }

// Create custom template
{ "action": "create", "name": "pr_review", "template": "Review this PR for {{repo}}:\n\n{{diff}}\n\nFocus: {{focus}}", "category": "coding" }

// Search templates (keyword + semantic)
{ "action": "search", "query": "security audit" }
```

#### `code_analysis` ðŸ”¬

Static code analysis using regex-based parsing. Much cheaper than sending full source code to a reasoning model.

**Supported languages:** TypeScript, JavaScript, Python, Rust, Go

**Actions:**

| Action | Description |
|--------|-------------|
| `analyze_code` | Full analysis: functions, classes, imports, complexity metrics |
| `get_functions` | Extract all function signatures with params, return types, complexity |
| `get_classes` | Extract class hierarchies, methods, and properties |
| `get_imports` | Map internal and external dependencies |
| `get_complexity` | Cyclomatic complexity per function with refactoring recommendations |
| `get_structure` | Generate a visual ASCII tree of the file structure |

```json
// Full analysis
{ "action": "analyze_code", "code": "...", "language": "typescript", "filename": "api.ts" }

// Get visual structure tree
{ "action": "get_structure", "code": "...", "language": "python", "filename": "main.py" }
// Returns:
// ðŸ“„ main.py (python)
// â”œâ”€â”€ ðŸ“¦ Imports (3)
// â”‚   â”œâ”€â”€ flask â†’ {Flask, request, jsonify}
// â”œâ”€â”€ ðŸ—ï¸ Classes (1)
// â”‚   â”œâ”€â”€ UserService
// â”‚   â”‚   â”œâ”€â”€ __init__()
// â”‚   â”‚   â”œâ”€â”€ get_user()
// â”‚   â”‚   â”œâ”€â”€ create_user()
// â”œâ”€â”€ âš¡ Functions (2)
// â”‚   â”œâ”€â”€ ðŸ“¤ main() [complexity: 3]
// â”‚   â”œâ”€â”€ ðŸ“¤ async validate_input() [complexity: 7]
```

---

## 7. Resources (10)

Resources are **read-only data endpoints** that the AI can query.

| URI | Description |
|-----|-------------|
| `memory://entities` | Browse all entities in the knowledge graph |
| `memory://entities/project-arch` | Entities in the project architecture domain |
| `memory://entities/coding-style` | Coding convention entities |
| `memory://entities/bug-history` | Bug fix history entities |
| `memory://entities/general` | General domain entities |
| `memory://relations` | Browse all entity relationships |
| `swarm://status` | Live swarm status: agents, coordinators |
| `swarm://tasks/active` | Currently queued/running tasks |
| `swarm://metrics/dashboard` | Agent performance dashboard |
| `swarm://triggers` | Registered event triggers |

---

## 8. Prompts (7)

Pre-built **workflow templates** that chain multiple tool calls together.

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `investigate_error` | Sentry â†’ source correlation â†’ fix generation | `issueId` |
| `architecture_review` | Memory graph + codebase structure analysis | â€” |
| `research_pipeline` | Multi-step research with synthesis | `topic`, `depth` |
| `swarm_status_report` | Generate swarm health report | â€” |
| `code_review_pipeline` | Analyze â†’ critique â†’ report | `code`, `language` |
| `content_pipeline` | Research â†’ draft â†’ review â†’ publish | `topic`, `format` |
| `project_planning` | Decompose project into tasks | `project`, `constraints` |

---

## 9. Agent Swarm Architecture

The swarm uses a **Hierarchical-Hybrid** orchestration model: one Orchestrator coordinates three Coordinator groups, each managing specialized agents.

### Agent Roster (10 agents, verified live)

| Agent | Role | Coordinator | Default Model | Specialization |
|-------|------|-------------|---------------|----------------|
| **Researcher** | researcher | Research | DeepSeek R1 | Deep research, literature review, data gathering |
| **Analyst** | analyst | Research | DeepSeek R1 | Data analysis, pattern recognition, trend detection |
| **Writer** | writer | Research | GPT-4o | Content creation, documentation, reports |
| **Coder** | coder | Research | DeepSeek Chat | Code generation, debugging, refactoring |
| **Planner** | planner | Research | Claude 3.5 | Task decomposition, project planning, architecture |
| **Critic** | critic | Quality | DeepSeek R1 | Code critique, quality assessment, risk analysis |
| **Reviewer** | reviewer | Quality | Claude 3.5 | Code review, validation, testing |
| **Integrator** | integrator | Operations | DeepSeek Chat | System integration, deployment, monitoring |
| **Monitor** | monitor | Operations | DeepSeek Chat | Health monitoring, alerting, incident response |
| **Summarizer** | summarizer | Operations | GPT-4o | Report generation, status summaries |

### Task Routing

```
User creates task â†’ Orchestrator assigns coordinator:

research, deep_research, web_research     â†’ Research Coordinator
data_analysis, pattern_analysis           â†’ Research Coordinator
content_creation, documentation           â†’ Research Coordinator (Writer)
code_generation, debugging, refactoring   â†’ Research Coordinator (Coder)
planning, task_decomposition              â†’ Research Coordinator (Planner)
review, validation, testing               â†’ Quality Coordinator
critique, feedback                        â†’ Quality Coordinator
integration, monitoring, health_check     â†’ Operations Coordinator
summarize, generate_report                â†’ Operations Coordinator (Summarizer)
```

---

## 10. Model Support (9 Models)

VegaMCP v3.0 supports 9 models across 4 providers with automatic fallback.

### Provider Priority Chain

```
1. Direct API (DeepSeek, Kimi) â€” lowest latency
2. OpenRouter â€” supports all models, one API key
3. Ollama â€” free local inference, zero latency
```

### Model Comparison

| Model | Provider | Context Window | Input Cost/1K | Output Cost/1K | Best For |
|-------|----------|---------------|---------------|----------------|----------|
| `deepseek/deepseek-r1` | DeepSeek/OpenRouter | 32K | $0.00055 | $0.0022 | Reasoning, chain-of-thought |
| `deepseek/deepseek-chat` | DeepSeek/OpenRouter | 32K | $0.00014 | $0.00028 | Most tasks (very cheap) |
| `anthropic/claude-3.5-sonnet` | OpenRouter | 200K | $0.003 | $0.015 | Code review, architecture |
| `openai/gpt-4o` | OpenRouter | 128K | $0.0025 | $0.01 | Content, documentation |
| `meta-llama/llama-3.1-405b` | OpenRouter | 128K | $0.003 | $0.003 | Open-source |
| `moonshot/kimi-128k` | Kimi Direct | **128K** | $0.00084 | $0.00084 | **Long documents** |
| `moonshot/kimi-32k` | Kimi Direct | 32K | $0.00034 | $0.00034 | Balanced quality/cost |
| `moonshot/kimi-8k` | Kimi Direct | 8K | $0.000017 | $0.000017 | **Ultra-cheap** |
| `ollama/auto` | Local | Varies | **$0.00** | **$0.00** | **Free** inference |

### Auto-Budget Model Selection

When the Token Budget system detects spending approaching limits:

| Budget Used | Recommended Model | Reason |
|-------------|-------------------|--------|
| 0â€“50% | `deepseek/deepseek-r1` | Budget healthy, use best |
| 50â€“80% | `moonshot/kimi-32k` | Balanced cost/quality |
| 80â€“100% | `deepseek/deepseek-chat` | Budget low, cheapest API |
| 100%+ | `ollama/auto` | Budget exhausted, free local |

---

## 11. Security & Guardrails

Every tool call passes through three security layers:

### Path Guard

- Prevents file system operations outside `WORKSPACE_ROOT`
- Blocks access to `.env`, `node_modules`, and system directories
- All file paths are resolved and validated before use

### Rate Limiter (12 categories)

| Category | Per Minute | Per Hour |
|----------|-----------|----------|
| memory | 60 | 500 |
| browser | 30 | 200 |
| sentry | 30 | 150 |
| reasoning | 10 | 50 |
| swarm | 60 | 600 |
| capabilities | 30 | 300 |
| webhooks | 20 | 200 |
| github | 15 | 100 |
| web_search | 20 | 150 |
| knowledge | 60 | 500 |
| code_analysis | 30 | 300 |
| prompt_library | 30 | 300 |

### Input Validator

- Validates all string inputs for length, content, and format
- Entity types are restricted to the allowed enum
- Relation types are validated against allowed values
- URL formats are verified before API requests
- Code execution inputs are size-limited

---

## 12. Database & Storage

### SQLite Database (`data/memory.db`)

Stores all structured data:

| Table | Purpose |
|-------|---------|
| `entities` | Knowledge graph nodes with type, domain, timestamps |
| `observations` | Timestamped facts attached to entities |
| `relations` | Typed relationships between entities |
| `reasoning_usage` | Token usage logs per model per call |
| `prompt_templates` | Prompt library templates with usage stats |
| `audit_log` | Audit trail for all tool operations |

### Embedded Vector Store (`data/vector_store.db`)

Stores semantic embeddings for similarity search:

| Collection | Purpose |
|------------|---------|
| `knowledge` | General knowledge entries from web search, GitHub, manual |
| `code_snippets` | Code patterns and file analyses |
| `prompt_templates` | Semantic-searchable prompt templates |

**How it works:**

1. Text is tokenized into words â†’ converted to TF-IDF vectors
2. Vectors are stored as JSON in SQLite (no external dependencies!)
3. Search queries are vectorized the same way
4. **Cosine similarity** ranks results by relevance
5. Auto-deduplication prevents storing near-identical content

---

## 13. v3.0 Feature Deep-Dives

### Token Budget Manager â€” How Cost Control Works

The Token Budget Manager observes the `reasoning_usage` table (populated by every `route_to_reasoning_model` call) and enforces spending limits:

```
User sets:  TOKEN_DAILY_BUDGET_USD=5.00
            TOKEN_HOURLY_BUDGET_USD=1.00

AI calls reasoning model â†’ budget check:
  â”œâ”€â”€ Budget healthy (< 50%) â†’ Allow, use requested model
  â”œâ”€â”€ Budget moderate (50-80%) â†’ Allow + suggest cheaper model
  â”œâ”€â”€ Budget warning (80-100%) â†’ Allow + force suggest cheapest
  â””â”€â”€ Budget exceeded (100%) â†’ Block + auto-switch to Ollama (free)
```

### Knowledge Engine â€” Zero-Dependency Semantic Search

The Knowledge Engine uses a novel **embedded vector store** that requires no external services:

1. **No API calls needed** â€” all vectorization happens locally using TF-IDF
2. **Character n-gram hashing** for fixed-size vectors (256 dimensions)
3. **Cosine similarity** for ranking search results
4. **Automatic deduplication** â€” new entries are checked against existing content
5. **Three collections** for organizing different types of knowledge

### GitHub Scraper â€” Synthetic Knowledge Generation

The `generate_knowledge` action combines GitHub API search with the Knowledge Engine:

```
Query "React state management" â†’
  â”œâ”€â”€ Search GitHub Code â†’ find relevant implementations
  â”œâ”€â”€ Search GitHub Repos â†’ find popular projects
  â”œâ”€â”€ Extract metadata (stars, language, topics)
  â””â”€â”€ Store as knowledge entries in vector store
      â†’ Available for semantic search in future sessions
```

---

## 14. Workflows & Pipelines

### Built-in Workflow Templates

#### Research Report

```
gather â†’ analyze â†’ synthesize â†’ review â†’ report
```

#### Code Pipeline

```
analyze â†’ generate â†’ review â†’ test â†’ integrate
```

#### Content Creation

```
research â†’ outline â†’ draft â†’ critique â†’ polish
```

### Custom Pipelines

Use `swarm_run_pipeline` to create custom multi-step workflows with conditional branching:

```json
{
  "name": "Security Audit Pipeline",
  "initial_step": "scan",
  "steps": [
    { "step_id": "scan", "task_type": "code_review", "input": { "focus": "security" }, "on_success": "analyze", "on_failure": "report_failure" },
    { "step_id": "analyze", "task_type": "data_analysis", "on_success": "fix", "on_failure": "report_issues" },
    { "step_id": "fix", "task_type": "code_generation", "on_success": "verify" },
    { "step_id": "verify", "task_type": "testing", "on_success": "report_success", "on_failure": "fix" },
    { "step_id": "report_success", "task_type": "generate_report" },
    { "step_id": "report_failure", "task_type": "generate_report" },
    { "step_id": "report_issues", "task_type": "generate_report" }
  ]
}
```

---

## 15. Testing

The test suite uses the MCP SDK client to spawn a real VegaMCP server and test all tools end-to-end.

```bash
# Run all 71 integration tests
node test-server.mjs
```

### Test Coverage (10 sections, 71 tests)

| Section | Tests | Coverage |
|---------|-------|----------|
| 1. Discovery | 3 | Tool/Resource/Prompt listing |
| 2. Memory Module | 5 | Full CRUD lifecycle |
| 3. Swarm Module | 10 | Task lifecycle, agent control, triggers |
| 4. Task Types | 6 | All coordinator task routing |
| 5. Capabilities | 14 | Sandbox, API, webhooks, watchers, scheduling |
| 5b. v3.0 Intelligence | 8 | Token budget, knowledge, prompts, code analysis |
| 6. Resources | 5 | All resource URIs |
| 7. Prompts | 6 | All 7 prompt templates |
| 8. Browser | 2 | Navigate (smoke), close |
| 9. Error Handling | 5 | Invalid inputs, missing entities |
| 10. Cleanup | 2 | Data cleanup verification |

---

## 16. Changelog

### v3.0.0 â€” Enhanced Intelligence Platform (2026-02-23)

**New Tools (6):**
- âœ… `token_budget` â€” Track token usage, enforce budgets, auto-model recommendations
- âœ… `knowledge_engine` â€” Semantic vector search with auto-deduplication
- âœ… `github_scraper` â€” GitHub code/repo search, analysis, knowledge generation
- âœ… `web_search` â€” Tavily + SearXNG web search with URL extraction
- âœ… `prompt_library` â€” 12 built-in templates with variable interpolation
- âœ… `code_analysis` â€” Static analysis for 5 languages

**New Model Support (4):**
- âœ… `moonshot/kimi-128k` â€” 128K context, $0.00084/1K tokens
- âœ… `moonshot/kimi-32k` â€” Cost-effective Kimi model
- âœ… `moonshot/kimi-8k` â€” Ultra-cheap summarization
- âœ… `ollama/auto` â€” Free local inference

**Infrastructure:**
- âœ… Lazy tool loading with 5 profiles (full/minimal/research/coding/ops)
- âœ… Embedded vector store (SQLite-based, zero dependencies)
- âœ… Token budget integration in reasoning router with auto-downgrade
- âœ… 5 new rate limit categories
- âœ… 71 integration tests (up from 63)

### v2.0.0 â€” Agent Swarm Architecture

- 10 specialized agents with task orchestration
- 3 coordinator groups (research, quality, operations)
- Swarm management tools (create/cancel tasks, agent control, metrics)
- Pipeline system for multi-step workflows
- Capabilities: sandbox, webhooks, watchers, schedulers, notifications
- Agent collaboration: conversations, DNA profiles, data streams, goal tracker

### v1.0.0 â€” Foundation

- Memory Graph (SQLite + FTS5)
- Playwright Browser (8 tools)
- Sentry Integration (4 tools)
- Multi-model Reasoning Router (DeepSeek, OpenAI, Claude, Llama)
- Security guardrails (path guard, rate limiter, input validator)

---

## Directory Structure

```
VegaMCP/
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ ARCHITECTURE.md                  # Original architecture doc
â”‚   â”œâ”€â”€ VEGAMCP_COMPLETE_GUIDE.md        # â† THIS FILE
â”‚   â”œâ”€â”€ MEMORY_MODULE.md
â”‚   â”œâ”€â”€ BROWSER_MODULE.md
â”‚   â”œâ”€â”€ SENTRY_MODULE.md
â”‚   â”œâ”€â”€ REASONING_MODULE.md
â”‚   â””â”€â”€ SECURITY.md
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ index.ts                          # Server entry + tool router (v3.0)
â”‚   â”œâ”€â”€ tools/
â”‚   â”‚   â”œâ”€â”€ memory/                       # 6 memory tools
â”‚   â”‚   â”œâ”€â”€ browser/                      # 8 browser tools + session
â”‚   â”‚   â”œâ”€â”€ sentry/                       # 4 sentry tools + client
â”‚   â”‚   â”œâ”€â”€ reasoning/
â”‚   â”‚   â”‚   â””â”€â”€ route-to-model.ts         # Multi-model router (v3.0 enhanced)
â”‚   â”‚   â”œâ”€â”€ swarm/                        # 9 swarm management tools
â”‚   â”‚   â””â”€â”€ capabilities/                 # 19 capability modules
â”‚   â”‚       â”œâ”€â”€ token-budget.ts           # v3.0 âœ¨
â”‚   â”‚       â”œâ”€â”€ knowledge-engine.ts       # v3.0 âœ¨
â”‚   â”‚       â”œâ”€â”€ github-scraper.ts         # v3.0 âœ¨
â”‚   â”‚       â”œâ”€â”€ web-search.ts             # v3.0 âœ¨
â”‚   â”‚       â”œâ”€â”€ prompt-library.ts         # v3.0 âœ¨
â”‚   â”‚       â”œâ”€â”€ code-analysis.ts          # v3.0 âœ¨
â”‚   â”‚       â”œâ”€â”€ sandbox.ts
â”‚   â”‚       â”œâ”€â”€ api-gateway.ts
â”‚   â”‚       â”œâ”€â”€ watchers.ts
â”‚   â”‚       â”œâ”€â”€ webhooks.ts
â”‚   â”‚       â”œâ”€â”€ workflow.ts
â”‚   â”‚       â”œâ”€â”€ schedule.ts
â”‚   â”‚       â”œâ”€â”€ notify.ts
â”‚   â”‚       â”œâ”€â”€ agent-conversations.ts
â”‚   â”‚       â”œâ”€â”€ agent-dna.ts
â”‚   â”‚       â”œâ”€â”€ reasoning-trace.ts
â”‚   â”‚       â”œâ”€â”€ data-streams.ts
â”‚   â”‚       â”œâ”€â”€ goal-tracker.ts
â”‚   â”‚       â””â”€â”€ ab-test.ts
â”‚   â”œâ”€â”€ resources/                        # Resource handlers
â”‚   â”œâ”€â”€ prompts/                          # Prompt templates
â”‚   â”œâ”€â”€ security/                         # Guardrails
â”‚   â”œâ”€â”€ swarm/                            # Orchestrator + agent registry
â”‚   â””â”€â”€ db/
â”‚       â”œâ”€â”€ graph-store.ts                # SQLite database manager
â”‚       â””â”€â”€ vector-store.ts               # v3.0 embedded vector store âœ¨
â”œâ”€â”€ data/                                 # Runtime data (gitignored)
â”œâ”€â”€ build/                                # Compiled JavaScript
â”œâ”€â”€ test-server.mjs                       # Integration test suite (71 tests)
â”œâ”€â”€ .env.example                          # Configuration template
â”œâ”€â”€ package.json                          # v3.0.0
â””â”€â”€ tsconfig.json
```

---

> **VegaMCP v3.0.0** â€” Built with â¤ï¸ as a comprehensive AI agent platform.
> 47 tools â€¢ 10 agents â€¢ 9 models â€¢ 10 resources â€¢ 7 prompts â€¢ 71 tests passing
