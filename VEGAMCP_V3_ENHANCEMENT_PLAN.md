# VegaMCP v3.0 — Enhancement Implementation Plan

## Confirmed Features (10 total)

### Phase 1: Core Infrastructure (Build First)
These are foundational — other features depend on them.

---

#### 1. 🧮 Token Budget Manager (`src/tools/capabilities/token-budget.ts`)
**Priority:** P0 | **Effort:** Low | **New Tool:** `token_budget`

**What it does:**
- Tracks total tokens consumed across ALL reasoning calls (per model, per session, per day)
- Configurable daily/hourly/session budgets via `.env` or tool parameters
- Auto-switches to cheaper models when budget is 80%+ used
- New SQLite table: `token_usage` with columns: `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `session_id`, `timestamp`
- New resource: `tokens://usage` → returns budget dashboard

**Actions:** `get_usage`, `set_budget`, `get_budget`, `reset_session`, `get_model_recommendation`

**Dependencies:** Hooks into existing `logReasoningUsage()` in `graph-store.ts`

---

#### 2. 🌙 Kimi API Integration (`route-to-model.ts` modification)
**Priority:** P0 | **Effort:** Low | **Modifies:** `src/tools/reasoning/route-to-model.ts`

**What it does:**
- Add `moonshot/kimi` to `VALID_MODELS` array
- Add `KIMI_API_KEY` env var support in `getApiConfig()` (Moonshot API is OpenAI-compatible)
- API base: `https://api.moonshot.cn/v1/chat/completions`
- Models: `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`
- Add to `COST_MAP` with Moonshot pricing
- Auto-detect available providers: OpenRouter → DeepSeek → Kimi (fallback chain)

**Config:**
```env
KIMI_API_KEY=sk-xxxxxxxxxxxxx
```

---

#### 3. 🧠 ChromaDB Knowledge Engine (`src/db/chroma-store.ts` + `src/tools/capabilities/knowledge-engine.ts`)
**Priority:** P1 | **Effort:** Medium-High | **New Tool:** `knowledge_engine`

**What it does:**
- Embedded ChromaDB vector database alongside SQLite
- Auto-generates embeddings for ALL entity observations using local `all-MiniLM-L6-v2` model (via `onnxruntime-node`) or API fallback
- Hybrid search: keyword (SQLite LIKE) + semantic (ChromaDB cosine similarity)
- Stores code snippets from GitHub scraper with metadata tags
- Stores prompt templates for quick retrieval
- Deduplication: embedding similarity > 0.95 = duplicate → skip

**Collections:**
- `knowledge` — entity observations, general knowledge
- `code_snippets` — scraped/synthetic code examples
- `prompt_templates` — reusable prompt patterns

**Actions:** `search`, `add`, `similar`, `deduplicate`, `stats`, `clear_collection`

**Dependencies:** `chromadb` npm package, `onnxruntime-node` for local embeddings

---

### Phase 2: External Intelligence (Build After Phase 1)

---

#### 4. 🐙 GitHub Scraper + AI Analyzer (`src/tools/capabilities/github-scraper.ts`)
**Priority:** P1 | **Effort:** Medium | **New Tool:** `github_scraper`

**What it does:**
- **Search GitHub** code, repos, issues via GitHub REST API v3
- **Fetch files** from repos (raw content via `raw.githubusercontent.com`)
- **AI Analysis**: Send scraped code to reasoning model → extract patterns, best practices, architecture insights
- **Synthetic Knowledge Generation**: AI analyzes code → generates structured knowledge entries → stores in ChromaDB
- **Trending Repos**: Scrape GitHub trending for language/timeframe
- Rate limiting via existing API gateway (60/hr unauthenticated, 5000/hr with GITHUB_TOKEN)

**Actions:** `search_code`, `search_repos`, `fetch_file`, `analyze_repo`, `generate_knowledge`, `trending`

**Pipeline example:**
```
github_scraper(search_code, "websocket reconnection typescript")
  → top 5 snippets
  → route_to_reasoning_model("Analyze these patterns...")
  → knowledge_engine(add, { collection: "code_snippets", ... })
  → Returns: structured analysis + stored in ChromaDB
```

**Config:**
```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx  # Optional, increases rate limit
```

---

#### 5. 🔍 Web Search Engine (`src/tools/capabilities/web-search.ts`)
**Priority:** P1 | **Effort:** Medium | **New Tool:** `web_search`

**What it does:**
- **Tavily API** (primary) — designed for AI agent search, returns clean summaries
- **SearXNG fallback** — self-hosted search aggregator (if `SEARXNG_URL` is set)
- **Content extraction**: Fetches URLs and converts to clean markdown (using `@mozilla/readability` + `turndown`)
- Auto-summary: If content > 2000 tokens, summarize using cheapest available model
- Caches search results in API gateway cache (configurable TTL)

**Actions:** `search`, `read_url`, `summarize_url`, `batch_search`

**Config:**
```env
TAVILY_API_KEY=tvly-xxxxxxxxxxxxx
SEARXNG_URL=http://localhost:8080  # Optional self-hosted
```

---

### Phase 3: Optimization Features (Build After Phase 2)

---

#### 6b. 📋 Prompt Template Library (`src/tools/capabilities/prompt-library.ts`)
**Priority:** P2 | **Effort:** Low-Medium | **New Tool:** `prompt_library`

**What it does:**
- Pre-built, token-optimized prompt templates for common tasks
- Templates stored in ChromaDB `prompt_templates` collection
- Variable interpolation: `{{file}}`, `{{language}}`, `{{context}}`
- AI can add new templates on-the-fly
- Built-in templates: code_review, debug_error, summarize_docs, refactor, security_audit, etc.

**Actions:** `use`, `create`, `list`, `search`, `delete`, `get`

---

#### 6c. 🔄 Result Deduplication Engine (integrated into ChromaDB)
**Priority:** P2 | **Effort:** Low | **Integrated into:** `knowledge-engine.ts`

**What it does:**
- Before storing any new knowledge, check ChromaDB for embedding similarity
- Threshold: > 0.92 cosine similarity = duplicate
- Merge strategy: append new unique info to existing entry
- Exposes dedup stats in `knowledge_engine(stats)` output

---

#### 6d. 🎯 Lazy Tool Loading (`src/index.ts` modification)
**Priority:** P2 | **Effort:** Medium | **Modifies:** `index.ts`

**What it does:**
- New env var: `VEGAMCP_TOOL_PROFILE` = `full` | `minimal` | `research` | `coding` | `ops`
- Profiles determine which tools are registered:
  - `minimal`: Memory + Reasoning only (8 tools → saves ~2K tokens in schema)
  - `research`: Memory + Reasoning + Web Search + GitHub + Browser (18 tools)
  - `coding`: Memory + Reasoning + GitHub + Sandbox + Code Analysis (15 tools)
  - `ops`: Memory + Swarm + Watchers + Webhooks + Scheduling (20 tools)
  - `full`: Everything (default, backwards compatible)

---

#### 6e. 📡 Streaming Responses (reasoning model enhancement)
**Priority:** P2 | **Effort:** Medium | **Modifies:** `route-to-model.ts`

**What it does:**
- Add `stream: true` option to reasoning model calls
- Stream partial results back as they arrive
- Reduces perceived latency for long reasoning tasks
- Fall back to non-streaming if the MCP transport doesn't support it

---

#### 6f. 🏠 Local LLM Fallback (Ollama) (`src/tools/reasoning/ollama-fallback.ts`)
**Priority:** P2 | **Effort:** Low | **Modifies:** `route-to-model.ts`

**What it does:**
- Auto-detect local Ollama at `http://localhost:11434`
- Add `ollama/` prefixed models to the model list (e.g., `ollama/llama3`, `ollama/codellama`)
- Zero cost, near-zero latency for simple tasks (summarization, classification, extraction)
- Used by token budget manager as "free fallback" when budget is exhausted

**Config:**
```env
OLLAMA_URL=http://localhost:11434  # Default
```

---

#### 6g. 🔮 Smart Prefetching (pipeline enhancement)
**Priority:** P3 | **Effort:** Medium | **Modifies:** `triggers-pipeline.ts`

**What it does:**
- When a pipeline is created, analyze the step DAG
- Predict which resources will be needed at each step
- Prefetch in parallel: memory entities, web searches, GitHub code
- Cache prefetched results for the pipeline's lifetime
- Reduces total pipeline execution time by 30-50%

---

#### 6h. 🔬 Code Analysis Engine (`src/tools/capabilities/code-analysis.ts`)
**Priority:** P2 | **Effort:** Medium | **New Tool:** `code_analysis`

**What it does:**
- Static analysis: parse code files and extract structure
- Uses regex-based parsing (fast, no external deps) for: TypeScript, JavaScript, Python, Rust, Go
- Outputs: function signatures, class hierarchies, import graphs, complexity metrics (LOC, cyclomatic)
- Integration: feeds results into ChromaDB for semantic code search
- Lighter alternative to sending full files through reasoning models

**Actions:** `analyze_file`, `analyze_directory`, `get_imports`, `get_complexity`, `search_definitions`

---

## New Dependencies

```json
{
  "chromadb": "^1.8.0",
  "onnxruntime-node": "^1.17.0",
  "@mozilla/readability": "^0.5.0",
  "turndown": "^7.1.0"
}
```

## New Environment Variables

```env
# Kimi / Moonshot AI
KIMI_API_KEY=sk-xxxxxxxxxxxxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx

# Web Search
TAVILY_API_KEY=tvly-xxxxxxxxxxxxx
SEARXNG_URL=http://localhost:8080

# Ollama
OLLAMA_URL=http://localhost:11434

# Token Budget
TOKEN_DAILY_BUDGET_USD=5.00
TOKEN_HOURLY_BUDGET_USD=1.00

# Tool Profile
VEGAMCP_TOOL_PROFILE=full
```

## New SQLite Tables

```sql
-- Token budget tracking (extends reasoning_usage)
CREATE TABLE IF NOT EXISTS token_budget (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_type TEXT NOT NULL,  -- 'daily', 'hourly', 'session'
  budget_limit_usd REAL NOT NULL,
  current_usage_usd REAL NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,
  period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- GitHub scraper cache
CREATE TABLE IF NOT EXISTS github_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  result_type TEXT NOT NULL,  -- 'code', 'repo', 'file', 'trending'
  data TEXT NOT NULL,  -- JSON
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Prompt templates (SQLite backup, primary in ChromaDB)
CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  template TEXT NOT NULL,
  variables TEXT,  -- JSON array of variable names
  category TEXT NOT NULL DEFAULT 'general',
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Updated Tool Count

| Category | Current | New | Total |
|----------|---------|-----|-------|
| Memory | 6 | 0 | 6 |
| Browser | 8 | 0 | 8 |
| Sentry | 4 | 0 | 4 |
| Reasoning | 1 | 0 | 1 (enhanced with Kimi + Ollama) |
| Swarm | 9 | 0 | 9 (enhanced prefetching) |
| Capabilities | 13 | 6 | 19 |
| **Total** | **41** | **6** | **47 tools** |

New tools: `token_budget`, `knowledge_engine`, `github_scraper`, `web_search`, `prompt_library`, `code_analysis`

## Architecture Diagram (v3.0)

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
│  ┌─────────── NEW v3.0 Layer ──────────────────────────────────┐ │
│  │                                                              │ │
│  │  🧮 Token Budget    🔍 Web Search     🐙 GitHub Scraper    │ │
│  │  📋 Prompt Library  🔬 Code Analysis  🧠 Knowledge Engine  │ │
│  │  🏠 Ollama Fallback 📡 Streaming      🎯 Lazy Loading      │ │
│  │  🔄 Deduplication   🔮 Smart Prefetch                      │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │              Agent Swarm Orchestrator (10 agents)          │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌────────────────┐  ┌──────────────────────────────────────┐    │
│  │  SQLite Database │  │  ChromaDB Vector Store               │    │
│  │  Memory + Audit  │  │  knowledge | code_snippets | prompts │    │
│  └────────────────┘  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Build Order

1. Token Budget Manager (standalone, no new deps)
2. Kimi API Integration (modify existing file only)
3. ChromaDB Knowledge Engine (new dep, foundational)
4. GitHub Scraper (depends on ChromaDB for storage)
5. Web Search (depends on ChromaDB for caching knowledge)
6. Prompt Library (depends on ChromaDB)
7. Code Analysis Engine (standalone with ChromaDB integration)
8. Lazy Tool Loading (modify index.ts)
9. Ollama Fallback (modify route-to-model.ts)
10. Streaming + Smart Prefetching (enhancements to existing)

## Version
**VegaMCP v3.0.0** — Enhanced Intelligence Platform
