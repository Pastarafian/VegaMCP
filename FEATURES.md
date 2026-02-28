# 🚀 VegaMCP v7.0 Features

VegaMCP is a production-grade MCP (Model Context Protocol) server providing an autonomous AI agent swarm, persistent memory, browser automation, multi-model reasoning, security gateway, agent graphs, zero-trust identity, A2A protocol, and an AI-first testing suite (mobile, web, API, accessibility).

In **v7.0**, VegaMCP consolidated over 65+ granular tools into 15 unified core capability clusters, resulting in a **90% reduction in token context usage** and significantly improved agent selection accuracy.

## The 15 Core Capability Clusters (v7.0)

1. **🧠 MEMORY (6 Actions)**
   - Knowledge graph operations with entity-relationship storage.
   - Actions: `graph` (manipulate and query nodes/relations), `bridge` (unify semantic similarity and structural data).

2. **🌐 WEB (4 Actions)**
   - Browser automation + search + GitHub access.
   - Actions: `browse` (navigate, click, type, screenshot, execute JS), `search` (Tavily/SearXNG engines), `github` (repo search, code fetch), `fetch` (direct HTTP requests).

3. **💻 CODE (7 Actions)**
   - Code execution, static analysis, and file orchestration.
   - Actions: `execute` (sandbox Python/JS), `analyze` (AST metrics), `shell` (terminal commands), `file` (filesystem I/O), `git` (version control), `read` (document parsing), `think` (sequential chain-of-thought).

4. **🤖 AI (6 Actions)**
   - Multi-model reasoning and knowledge retrieval.
   - Actions: `reason` (intelligent model routing/debate), `search` (vector knowledge), `rag` (hybrid graph + vector), `discover` (tool matching), `hypothesize` (generate ideas), `synthesize` (knowledge ingestion).

5. **🐝 SWARM (9 Actions)**
   - Coordinated 10-agent task orchestration queue.
   - Actions: `manage` (create tasks, assign agents, register triggers, pipe workloads, get metrics).

6. **📊 DATA (5 Actions)**
   - Database, analytics, and persistent storage.
   - Actions: `query` (SQLite/JSON), `analytics` (MCP metrics), `ab_test`, `stream`, `vault` (Markdown notes).

7. **🔧 OPS (8 Actions)**
   - Infrastructure, environment, and automation.
   - Actions: `watch` (filesystem events), `webhook`, `workflow` (YAML pipelines), `schedule` (cron jobs), `notify`, `api_request` (gateway routed), `health_check`, `auto_update`.

8. **🛡️ SECURITY (5 Actions)**
   - Scanning, runtime monitoring, and trust enforcement.
   - Actions: `scan` (regex vulnerability discovery), `monitor` (runtime anomaly detection), `test` (chaos engineering / stress testing), `gate` (quality trackers), `trust` (zero-trust identity provisioning).

9. **🎨 CREATE (3 Actions)**
   - Application, prompt, and specialized skill management.
   - Actions: `app` (MCP Apps HTML generation), `prompt` (prompt scaffolding), `skill` (SKILL.md teaching files).

10. **⚡ PROTOCOL (11 Actions)**
    - MCP extensions and advanced transport features.
    - Actions: `elicit`, `task` (SEP-1686 async), `oauth`, `gateway` (injection detection), `session` (resumability), `a2a` (Agent-to-Agent standard), `tool_search`, `agent_graph` (DAGs), `sampling` (Agentic Sampling v2), `multimodal` (embeddings plugin).

11. **🐛 SENTRY (4 Actions)**
    - Error tracking integration.
    - Actions: `search_issues`, `get_detail`, `get_breadcrumbs`, `resolve`.

12. **🎯 INTEL (5 Actions)**
    - Agent analytics and DNA operational data.
    - Actions: `conversation`, `dna` (agent profiling), `reasoning_trace`, `data_stream`, `goal_tracker`.

13. **🌍 WEB_TESTING (10 Actions) [NEW]**
    - Playwright-powered web quality assurance.
    - Actions: `lighthouse`, `visual_regression`, `responsive_test`, `console_audit`, `network_waterfall`, `form_test`, `link_check`, `storage_audit`, `css_coverage`, `core_web_vitals`.

14. **🔌 API_TESTING (8 Actions) [NEW]**
    - API endpoint quality assurance and auditing.
    - Actions: `discover_endpoints`, `contract_test`, `load_test`, `auth_flow`, `validate_response`, `sequence_test`, `mock_server`, `diff_test`.

15. **♿ ACCESSIBILITY (6 Actions) [NEW]**
    - Compliance and structure testing (Playwright).
    - Actions: `wcag_audit`, `contrast_check`, `keyboard_nav`, `aria_audit`, `screen_reader`, `focus_management`.

16. **🖌️ DESIGN_TOOLKIT (16 Actions) [NEW]**
    - Universal design generation, knowledge base, and format conversion.
    - Actions: `color_palette`, `typography`, `component`, `layout`, `design_tokens`, `animation`, `pattern`, `brand_kit`, `design_lint`, `asset_generator`, `compatibility_check`, `format_converter`, `trend_tracker`, `theme_engine`, `efficient_design`, `universal_converter`.

*(Self-Executing mobile-testing features are embedded within protocol actions for testing environments on emulators.)*

---

## Architecture Highlight

VegaMCP uses an advanced **Progressive Disclosure** routing pattern:
- Instead of feeding massive raw parameter lists into context windows, VegaMCP exposes grouped top-level schemas (15 core tools).
- The LLM calls a high-level action via `action` specifiers internally mapping to 65+ underlying granular execution endpoints.
- This creates 100% backward compatibility with v6.0 scripts via `src/compatibility/complete-aliases.ts` alias mapping, while dropping context consumption from over ~12,000 tokens to around ~1,200 tokens baseline limit.

## Cross-Agent Compatibility
Operates identically across universally compatible MCP clients:
- **VS Code** (Roo Code, Cline, Antigravity)
- **Kimi Code** / **Claude Code** / **Codex CLI**
- **Cursor** / **Windsurf**
