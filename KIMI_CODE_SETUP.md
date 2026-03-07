# VegaMCP Setup for Kimi Code

## ✅ Installation Complete

VegaMCP has been configured as an MCP server in Kimi Code.

### Configuration Location
```
~/.kimi/mcp.json
```

### What's Configured

| Setting | Value |
|---------|-------|
| **Command** | `node` |
| **Script** | `/path/to/VegaMCP/build/index.js` |
| **Tools** | 65+ tools (full profile) |
| **Profile** | `full` |

### Enabled API Keys
- ✅ DeepSeek API (reasoning models)
- ✅ Kimi API (K2.5 for coding)
- ✅ GitHub Token (5000 req/hr)
- ✅ Tavily API (web search)
- ✅ OpenAlex API (research papers)
- ✅ HuggingFace Token (model hub)

### Auto-Approved Tools
These tools won't prompt for confirmation:
- `memory` — Knowledge graph operations
- `knowledge_engine` — Vector search
- `tool_search` — Natural language tool discovery
- `health_check` — Server status
- `analytics` — Usage statistics

---

## How to Use

### 1. Start a New Chat
Open a new Kimi Code chat session. The MCP server will start automatically.

### 2. Check Available Tools
Type:
```
/mcp
```

You'll see:
```
MCP Servers:
• REDACTED — 65+ tools connected
```

### 3. Use Tools Naturally
Just ask for what you need:

| Request | VegaMCP Tool Used |
|---------|-------------------|
| "Search my memory for React patterns" | `memory` (search action) |
| "Look up latest React docs" | `web_search` + `browser` |
| "Debug this error" | `knowledge_engine` + `code_analysis` |
| "Route to DeepSeek for complex reasoning" | `route_to_reasoning_model` |
| "Create a task for the agent swarm" | `swarm` (create_task action) |
| "Scrape GitHub for similar issues" | `github_scraper` |
| "Search for the best tool to use" | `tool_search` |

---

## Key Tools Available

### 🧠 Intelligence
- `memory` — Knowledge graph (create entities, relations, observations)
- `knowledge_engine` — Vector semantic search
- `route_to_reasoning_model` — Multi-model routing (DeepSeek, Kimi, GPT-4o, etc.)
- `tool_search` — Natural language tool discovery

### 🔧 Capabilities
- `browser` — Playwright automation (navigate, click, screenshot, etc.)
- `github_scraper` — Repository/code/issue search
- `web_search` — Tavily AI search
- `sandbox_testing` — Docker sandbox v5.0 (40 actions, 10 profiles, GPU, Compose)
- `shell` — Terminal commands

### 🐝 Agent Swarm
- `swarm` — Task orchestration with 10 specialized agents
- `agent_intel` — Inter-agent messaging & DNA profiles
- `agent_ops` — Data streams, goal tracking, A/B testing

### 🆕 v6.0 Protocol
- `tool_search` — NL tool search with lazy loading
- `a2a_protocol` — Agent-to-Agent communication
- `agent_graphs` — Hierarchical DAG orchestration
- `agentic_sampling_v2` — Server-side agent loops
- `mcp_apps` — Interactive HTML dashboards

---

## Troubleshooting

### MCP Server Not Connected
```bash
# Test the MCP server manually
cd /path/to/VegaMCP
npm run build
node build/index.js
```

### Update API Keys
Edit `~/.kimi/mcp.json` and restart Kimi Code:
```json
{
  "mcpServers": {
    "REDACTED": {
      "env": {
        "KIMI_API_KEY": "your-new-key"
      }
    }
  }
}
```

### View Server Logs
```bash
# In VegaMCP directory
npm run dev
```

---

## Next Steps

See `docs/V7_UPGRADE_PLAN.md` for the full cross-agent compatibility roadmap.

### v7.0: 17 Unified Capability Clusters (LIVE)

VegaMCP v7.0 condensed 65+ tools into **17 core capability clusters**:

| v6 Tool(s) | v7 Unified Cluster |
|------------|--------------------|
| `browser_*`, `web_search`, `github_scraper` | `web` |
| `sandbox_testing`, `code_analysis`, `shell`, `filesystem`, `git_tools` | `code` |
| `route_to_reasoning_model`, `knowledge_engine`, `graph_rag` | `ai` |
| `watcher_*`, `webhook_*`, `workflow_*`, `schedule` | `ops` |
| `security_scanner`, `sentinel`, `stress_test` | `security` |
| `sandbox_testing` (v5.0) | 40 actions: exec, install, snapshot, compose, export, GPU |

**Benefits:** ~90% reduction in context usage, faster tool selection, better cross-agent compatibility.
