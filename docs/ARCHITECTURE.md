# VegaMCP â€” Master Architecture Document

> **Version:** 1.0.0  
> **Last Updated:** 2026-02-23  
> **Transport:** stdio (local, zero-latency)  
> **Runtime:** Node.js + TypeScript  
> **SDK:** `@modelcontextprotocol/sdk`

---

## 1. System Overview

VegaMCP is a multi-tool MCP (Model Context Protocol) server designed for Google Antigravity.  
It operates on a **Hub-and-Spoke** model optimized for agentic IDE workflows.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  ANTIGRAVITY (Host)                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Gemini 3   â”‚â—„â”€â”€â–ºâ”‚  Built-in MCP Client          â”‚  â”‚
â”‚  â”‚ Pro Agent   â”‚    â”‚  (routes tool calls via stdio) â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                  â”‚ stdio (stdin/stdout)
                                  â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚               VEGAMCP SERVER (The Hub)                â”‚
â”‚                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ Memory  â”‚  â”‚ Browser  â”‚  â”‚ Sentry â”‚  â”‚Reason- â”‚ â”‚
â”‚  â”‚ Graph   â”‚  â”‚Playwrightâ”‚  â”‚Observ- â”‚  â”‚  ing   â”‚ â”‚
â”‚  â”‚ Module  â”‚  â”‚ Module   â”‚  â”‚ability â”‚  â”‚ Router â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”¬â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”¬â”€â”€â”€â”€â”˜ â”‚
â”‚       â”‚            â”‚            â”‚            â”‚      â”‚
â”‚  â”Œâ”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â” â”‚
â”‚  â”‚          Security Guardrails Layer             â”‚ â”‚
â”‚  â”‚  (Path Guard Â· Rate Limiter Â· Input Validator) â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚   SQLite Graph    â”‚  â”‚     .env (API Keys)      â”‚ â”‚
â”‚  â”‚   (memory.db)     â”‚  â”‚  DeepSeek Â· Sentry Â· etc â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 2. MCP Primitives Exposed

VegaMCP exposes all three MCP primitive types:

### 2.1 Tools (Actions the AI Can Invoke)

| Module        | Tool Name                  | Purpose                                        |
| ------------- | -------------------------- | ---------------------------------------------- |
| **Memory**    | `create_entities`          | Create new knowledge nodes                     |
| **Memory**    | `create_relations`         | Link entities with typed relationships         |
| **Memory**    | `add_observations`         | Append timestamped facts to entities           |
| **Memory**    | `search_graph`             | Full-text + fuzzy search across the graph      |
| **Memory**    | `open_nodes`               | Retrieve specific entities by name             |
| **Memory**    | `delete_entities`          | Remove entities and their relations            |
| **Browser**   | `browser_navigate`         | Navigate to a URL                              |
| **Browser**   | `browser_click`            | Click an element by selector or text           |
| **Browser**   | `browser_type`             | Type text into an input field                  |
| **Browser**   | `browser_screenshot`       | Capture a PNG screenshot                       |
| **Browser**   | `browser_snapshot`         | Get accessibility tree snapshot                |
| **Browser**   | `browser_execute_js`       | Execute JavaScript in the page                 |
| **Browser**   | `browser_console_logs`     | Retrieve captured console output               |
| **Browser**   | `browser_close`            | Close the browser session                      |
| **Sentry**    | `sentry_search_issues`     | Search/filter production issues                |
| **Sentry**    | `sentry_get_issue_detail`  | Get full stack trace + metadata                |
| **Sentry**    | `sentry_get_breadcrumbs`   | Get user navigation trail                      |
| **Sentry**    | `sentry_resolve_issue`     | Mark issue as resolved (requires confirmation) |
| **Reasoning** | `route_to_reasoning_model` | Send complex problems to external models       |

### 2.2 Resources (Read-Only Data)

| Resource URI                 | Description                                |
| ---------------------------- | ------------------------------------------ |
| `memory://entities`          | Browse all entities in the knowledge graph |
| `memory://entities/{domain}` | Browse entities filtered by domain         |
| `memory://relations`         | Browse all relationships                   |
| `sentry://issues/recent`     | Live feed of recent production errors      |

### 2.3 Prompts (Pre-Built Workflow Templates)

| Prompt Name           | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `investigate_error`   | Chains: Sentry lookup â†’ source correlation â†’ fix generation |
| `architecture_review` | Queries memory graph + analyzes codebase structure          |

---

## 3. Module Specifications

Each module has its own detailed specification document:

- **[Memory Module](./MEMORY_MODULE.md)** â€” Persistent knowledge graph with SQLite + FTS5
- **[Browser Module](./BROWSER_MODULE.md)** â€” Playwright-powered headless browser automation
- **[Sentry Module](./SENTRY_MODULE.md)** â€” Live production error observability
- **[Reasoning Module](./REASONING_MODULE.md)** â€” Multi-model intelligence routing
- **[Security](./SECURITY.md)** â€” Guardrails, rate limiting, and input validation

---

## 4. Data Flow

### 4.1 Typical Debugging Workflow

```
User: "There's a crash in production, investigate and fix it."

1. AI calls `sentry_search_issues({ query: "crash", status: "unresolved" })`
2. Server queries Sentry API â†’ returns top 5 issues
3. AI calls `sentry_get_issue_detail({ issue_id: "PROJ-1234" })`
4. Server fetches full stack trace + environment + tags
5. AI calls `sentry_get_breadcrumbs({ issue_id: "PROJ-1234" })`
6. Server returns user navigation path before crash
7. AI cross-references stack trace with local codebase
8. If logic is complex, AI calls `route_to_reasoning_model({ ... })`
9. AI drafts the fix and applies it
10. AI calls `create_entities` + `add_observations` to record the fix
11. AI calls `browser_navigate` + `browser_click` to verify the fix
12. AI calls `sentry_resolve_issue({ issue_id: "PROJ-1234" })`
```

### 4.2 Memory-First Workflow

```
User: "Remember that we use camelCase for all API endpoints."

1. AI calls `create_entities({ entities: [{ name: "API Style Guide", type: "convention", domain: "coding-style" }] })`
2. AI calls `add_observations({ entity: "API Style Guide", observations: ["All API endpoints use camelCase naming"] })`

--- Next Session ---

User: "Create a new user preferences endpoint."

1. AI checks `search_graph({ query: "API style convention" })`
2. Memory returns: "All API endpoints use camelCase naming"
3. AI creates endpoint following the stored convention
```

---

## 5. Technology Stack

| Component   | Technology                  | Rationale                                  |
| ----------- | --------------------------- | ------------------------------------------ |
| Runtime     | Node.js 20+                 | First-class MCP SDK support                |
| Language    | TypeScript 5.x              | Type safety for tool schemas               |
| MCP SDK     | `@modelcontextprotocol/sdk` | Official SDK                               |
| Database    | better-sqlite3 + FTS5       | Zero-config, fast, persistent              |
| Browser     | Playwright                  | Industry standard, headless, multi-browser |
| HTTP Client | Node fetch (built-in)       | Sentry & DeepSeek API calls                |
| Validation  | Zod                         | Runtime schema validation                  |
| Transport   | stdio                       | Zero-latency local communication           |

---

## 6. Directory Structure

```
VegaMCP/
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ ARCHITECTURE.md          # This document
â”‚   â”œâ”€â”€ MEMORY_MODULE.md         # Memory module specification
â”‚   â”œâ”€â”€ BROWSER_MODULE.md        # Browser module specification
â”‚   â”œâ”€â”€ SENTRY_MODULE.md         # Sentry module specification
â”‚   â”œâ”€â”€ REASONING_MODULE.md      # Reasoning module specification
â”‚   â”œâ”€â”€ SECURITY.md              # Security specification
â”‚   â””â”€â”€ SETUP.md                 # Setup and configuration guide
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ index.ts                 # Server entry point + tool router
â”‚   â”œâ”€â”€ tools/
â”‚   â”‚   â”œâ”€â”€ memory/
â”‚   â”‚   â”‚   â”œâ”€â”€ create-entities.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ create-relations.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ add-observations.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ search-graph.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ open-nodes.ts
â”‚   â”‚   â”‚   â””â”€â”€ delete-entities.ts
â”‚   â”‚   â”œâ”€â”€ browser/
â”‚   â”‚   â”‚   â”œâ”€â”€ navigate.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ click.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ type.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ screenshot.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ snapshot.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ execute-js.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ console-logs.ts
â”‚   â”‚   â”‚   â””â”€â”€ close.ts
â”‚   â”‚   â”œâ”€â”€ sentry/
â”‚   â”‚   â”‚   â”œâ”€â”€ search-issues.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ get-issue-detail.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ get-breadcrumbs.ts
â”‚   â”‚   â”‚   â””â”€â”€ resolve-issue.ts
â”‚   â”‚   â””â”€â”€ reasoning/
â”‚   â”‚       â””â”€â”€ route-to-model.ts
â”‚   â”œâ”€â”€ resources/
â”‚   â”‚   â”œâ”€â”€ memory-resources.ts
â”‚   â”‚   â””â”€â”€ sentry-resources.ts
â”‚   â”œâ”€â”€ prompts/
â”‚   â”‚   â”œâ”€â”€ investigate-error.ts
â”‚   â”‚   â””â”€â”€ architecture-review.ts
â”‚   â”œâ”€â”€ security/
â”‚   â”‚   â”œâ”€â”€ path-guard.ts
â”‚   â”‚   â”œâ”€â”€ rate-limiter.ts
â”‚   â”‚   â””â”€â”€ input-validator.ts
â”‚   â””â”€â”€ db/
â”‚       â””â”€â”€ graph-store.ts
â”œâ”€â”€ data/                        # Runtime data (gitignored)
â”œâ”€â”€ .env.example
â”œâ”€â”€ .gitignore
â”œâ”€â”€ package.json
â””â”€â”€ tsconfig.json
```

---

## 7. Antigravity Integration

### 7.1 MCP Configuration

Add to your Antigravity `mcp_config.json`:

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

### 7.2 Environment Variables

All secrets are stored in `.env` at the project root:

```env
SENTRY_AUTH_TOKEN=your_sentry_token
SENTRY_ORG=your_org_slug
SENTRY_PROJECT=your_project_slug
DEEPSEEK_API_KEY=your_deepseek_key
OPENROUTER_API_KEY=your_openrouter_key
WORKSPACE_ROOT=/path/to/VegaMCP
```

---

## 8. Build & Run

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run server (stdio mode â€” called by Antigravity)
npm start

# Development mode with hot reload
npm run dev
```
