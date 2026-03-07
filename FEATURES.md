# 🚀 VegaMCP v7.2 Features

VegaMCP is a production-grade MCP (Model Context Protocol) server providing an autonomous AI agent swarm, persistent semantic memory, browser automation, multi-model reasoning, security gateway, agent graphs, zero-trust identity, A2A protocol, Docker sandbox v5.0, and an AI-first testing suite (mobile, web, API, accessibility, desktop, database, server, security, visual).

In **v7.2 (The Sovereign Intelligence Update)**, VegaMCP consolidated 78+ granular tools into 6 unified Omni-Clusters, optimizing orchestration for local IDEs and cloud environments.

## The Core Capability Clusters (v7.2 Omni-Clusters)

1. **🧠 MEMORY (8 Actions)**
   - Knowledge graph operations with entity-relationship storage and Semantic Vector Search.
   - Actions: `graph` (manipulate and query nodes/relations), `bridge` (unify semantic similarity and structural data), `semantic_memory` (Ollama embeddings, cosine similarity, TF-IDF fallback, auto-context building).

2. **🌐 WEB (4 Actions)**
   - Browser automation + search + GitHub access.
   - Actions: `browse` (navigate, click, type, screenshot, execute JS), `search` (Tavily/SearXNG engines), `github` (repo search, code fetch), `fetch` (direct HTTP requests).

3. **💻 CODE (7 Actions)**
   - Code execution, static analysis, and file orchestration.
   - Actions: `execute` (Docker sandbox v5.0), `analyze` (AST metrics), `shell` (terminal commands), `file` (filesystem I/O), `git` (version control), `read` (document parsing), `think` (sequential chain-of-thought).

4. **🤖 AI & RESEARCH (8 Actions)**
   - Multi-model reasoning, knowledge retrieval, and output validation.
   - Actions: `reason` (intelligent model routing/debate), `search` (vector knowledge), `rag` (hybrid graph + vector), `discover` (tool matching), `hypothesize` (generate ideas), `synthesize` (knowledge ingestion), `llm_eval` (8-metric evaluation of AI outputs including toxicity/hallucination).

5. **🐝 SWARM (9 Actions)**
   - Coordinated 10-agent task orchestration queue.
   - Actions: `manage` (create tasks, assign agents, register triggers, pipe workloads, get metrics).

6. **📊 DATA (6 Actions)**
   - Database, analytics, and persistent storage with full remote Postgres connectivity.
   - Actions: `query` (SQLite/JSON), `postgres_client` (exec SQL on remote servers), `analytics` (MCP metrics), `ab_test`, `stream`, `vault` (Markdown notes).

7. **🔧 OPS & CONTEXT (9 Actions)**
   - Infrastructure, environment, and 3rd-party library documentation bridging.
   - Actions: `watch` (filesystem events), `webhook`, `workflow` (YAML pipelines), `schedule` (cron jobs), `notify`, `api_request` (gateway routed), `health_check`, `auto_update`, `context7_docs` (load entire framework docs instantly).

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

13. **🌍 WEB_TESTING (10 Actions)**
    - Playwright-powered web quality assurance.
    - Actions: `lighthouse`, `visual_regression`, `responsive_test`, `console_audit`, `network_waterfall`, `form_test`, `link_check`, `storage_audit`, `css_coverage`, `core_web_vitals`.

14. **🔌 API_TESTING (8 Actions)**
    - API endpoint quality assurance and auditing.
    - Actions: `discover_endpoints`, `contract_test`, `load_test`, `auth_flow`, `validate_response`, `sequence_test`, `mock_server`, `diff_test`.

15. **♿ ACCESSIBILITY (6 Actions)**
    - Compliance and structure testing (Playwright).
    - Actions: `wcag_audit`, `contrast_check`, `keyboard_nav`, `aria_audit`, `screen_reader`, `focus_management`.

16. **🖌️ DESIGN_TOOLKIT (16 Actions)**
    - Universal design generation, knowledge base, and format conversion.
    - Actions: `color_palette`, `typography`, `component`, `layout`, `design_tokens`, `animation`, `pattern`, `brand_kit`, `design_lint`, `asset_generator`, `compatibility_check`, `format_converter`, `trend_tracker`, `theme_engine`, `efficient_design`, `universal_converter`.

17. **🐳 SANDBOX v5.0 (40 Actions)**
    - Docker-first sandbox with 10 dev profiles, security hardening, GPU passthrough, and Docker Compose orchestration.
    - **Core:** `status`, `create`, `exec`, `destroy`, `destroy_all`, `list`
    - **Docker:** `docker_run`, `docker_build`, `docker_copy`, `docker_start`
    - **Profiles:** `list_profiles`, `get_profile`, `build_profile`, `create_from_profile` (webdev, api-dev, mobile-dev, security, data-science, desktop-dev, database, devops, performance, full-qa)
    - **Packages:** `install` (apt/pip/npm/apk with safety blocklist)
    - **Lifecycle:** `pause`, `unpause`, `restart`, `snapshot`
    - **Monitoring:** `logs`, `stats`, `diff`, `ports`, `health_check`
    - **Advanced:** `batch_exec`, `set_env`, `dockerfile`
    - **Compose:** `compose_up`, `compose_down`, `compose_status`
    - **Export:** `export`, `import` (.tar containers)
    - **Network:** `network_create`, `network_remove`
    - **Hardware:** `gpu_check` (NVIDIA GPU detection)
    - **Fallbacks:** `vm_run` (V8 isolate), `ps_exec` (PowerShell), `write_file`, `read_file`, `list_files`
    - **Security Levels:** `paranoid` (cap-drop ALL, seccomp, read-only FS, PID 64, non-root), `strict`, `standard`, `relaxed`

18. **🖥️ VPS TESTING SUITE (11 Tiers, 50+ Tools)**
    - Hardware-aware automated deployment of a complete Windows VPS testing fortress.
    - **Tiers:** Core Runtimes (Node/Python/.NET/Java/Rust), CLI Utilities (jq/yq/SQLite/Redis/PostgreSQL), System Forensics (Sysinternals/WinDbg), API Load Testing (k6/Postman/Locust), Visual Regression (FFmpeg/ImageMagick), Browser E2E (Playwright/Cypress/Puppeteer), Desktop GUI (WinAppDriver/FlaUI), Security Pentest (Nmap/Wireshark/Nikto/SQLMap/Hashcat/BurpSuite), Containerization (Docker Desktop), Node Ecosystem (Jest/Mocha/Lighthouse/axe-core/pa11y), VNC Server (localhost-only)
    - **Deployment:** One `.bat` bootstrap → fully automated SSH pipeline via `deploy-vps.js`
    - **Monitoring:** Background telemetry logger with live desktop viewer + auto log rotation/cleanup
    - **Optimization:** Win32 API `EmptyWorkingSet()` memory trimming + service killing + Defender bypass

19. **🦀 VEGASENTINEL GATEWAY v2.1 "The Claw" (25+ Actions, 8 Layers)**
    - Custom Rust binary running as `NT AUTHORITY\SYSTEM` on Windows VPS (port 42015) or root in Docker containers.
    - **Layer 0 — Health:** `ping`, `metrics` (CPU/RAM/Disk/uptime in real-time)
    - **Layer 1 — Execution:** `exec`, `exec_ps` (any command as SYSTEM, zero UAC)
    - **Layer 2 — Processes:** `process_list`, `kill`, `kill_by_name` (full enumeration + instant termination)
    - **Layer 3 — Memory:** `trim_memory` (Win32 `psapi.dll EmptyWorkingSet()` across ALL processes)
    - **Layer 4 — CUA Vision:** `screenshot` (desktop → Base64 PNG), `mouse_move`, `mouse_click`, `type_text`, `send_key` (AI sees and controls the VPS)
    - **Layer 5 — Filesystem:** `read_file`, `write_file`, `list_dir` (SYSTEM privilege)
    - **Layer 6 — Services:** `service_status/start/stop`, `reg_read` (Windows Service + Registry control)
    - **Layer 7 — Network:** `netstat`, `firewall_rules` (port listeners + firewall inspection)
    - **Layer 8 — MCP-to-MCP Relay:** `relay_post`, `relay_poll`, `relay_peek`, `relay_channels`, `relay_clear` (cross-machine agent communication via named channels)
    - **Docker variant:** Linux gateway using `xdotool` + `scrot` + `Xvfb` virtual display — identical API, disposable containers

20. **🔗 MCP-TO-MCP RELAY (6 Actions)**
    - Filesystem-backed channel system for same-machine inter-instance communication.
    - Multiple VegaMCP instances (different IDEs, different AI models) exchange structured JSON messages.
    - **Actions:** `post` (send), `poll` (receive + remove), `peek` (read-only), `channels` (list active), `clear` (remove), `status` (health check)
    - **Modes:** Local filesystem relay (instant, persistent), VPS gateway relay (cross-machine), Docker gateway relay (containerized)

21. **🦾 THE CLAW ORCHESTRATOR (22 Actions, Vision AI + Learning)**
    - Intelligent multi-agent visual orchestrator that controls AI agents across multiple machines/IDEs.
    - **Vision Analysis:** Tiered — (1) Ollama local models (llava/moondream, free+fast), (2) OpenRouter cloud, (3) OpenAI, (4) heuristic fallback
    - **Core:** `register`, `unregister`, `list`, `prompt` (type→submit→watch→capture), `screenshot`, `click`, `find_element` (vision-based UI detection), `type`, `key`, `status`
    - **Intelligence:** `dispatch` (learning-based agent routing), `learn` (query persistent performance ledger), `plan` (AI task decomposition), `run_plan` (execute a plan across agents)
    - **Novel — Consensus:** Send same prompt to N agents, compare answers, pick the best (ensemble AI)
    - **Novel — Race:** Competitive coding — all agents race, fastest correct answer wins with leaderboard
    - **Novel — Chain:** Pipeline — output of Agent A becomes input of Agent B automatically
    - **Novel — Handoff:** Auto-retry failed tasks on the next available agent (fault tolerance)
    - **Novel — Screen Diff:** Compare two screenshots with vision AI to detect what changed
    - **Novel — Record/Replay:** Save an agent's task sequence as a replayable workflow (OpenAdapt-style)
    - **Learning Ledger:** Persistent JSON log of every task outcome — success rates, durations, keyword profiling — used to intelligently route future tasks
    - **Observability:** `SystemMonitor` emitting SIGHT/THOUGHT/ACTION/ERROR events in real-time, `reflect` for AI self-reflection on recent memory
    - **IDE Knowledge Base:** Template-inherited IDE profiles (VS Code, Cursor, Windsurf) with panel locations, shortcuts, and visual landmarks
    - **Control Bridge:** HTTP server on port 42019 for real-time GUI ↔ orchestrator communication (`/logs`, `/status`, `/command`, `/memory`, `/brainstorm`)

22. **🧠 PROJECT MEMORY ENGINE (12 Actions, Cross-Project Intelligence)**
    - Persistent, cross-session memory that tracks milestones, decisions, bugs, ideas, insights, and observations per project.
    - **Storage:** JSON files in `~/.claw-memory/` per project (memories.json, brainstorms.json, context.json)
    - **Core:** `memory_init`, `memory_record`, `memory_recall`, `memory_context`, `memory_archive`
    - **Brainstorming:** `memory_brainstorm` (autonomous AI idea generation with scoring), `memory_evolve` (mutate ideas into 10x/MVP/pivot variants)
    - **Cross-Project:** `memory_cross_pollinate` (remix patterns from all projects), `memory_cross_search` (search across entire portfolio), `memory_bootstrap` (start new projects pre-loaded with inspiration)
    - **Auto-Journal:** Automatically records significant Claw actions as memory entries
    - **LLM Tiering:** Uses Adaptive Fleet Model Router for intelligent model selection across all fleet nodes and cloud APIs

23. **📱 WHATSAPP CONVERSATIONAL AI BRIDGE**
    - Fully conversational AI assistant in WhatsApp that controls The Claw fleet via natural language.
    - **NOT a command parser** — uses a full LLM conversation loop with per-user history
    - **Capabilities:** Fleet control, memory management, brainstorming, IDE automation, file operations — all through casual conversation
    - **Security:** Authorized number whitelist, local-only auth session, no data to third parties
    - **Mobile Development:** Enables light programming work from your phone → WhatsApp → The Claw → VPS IDE
    - **Protocol:** Baileys (WhatsApp Web API), no browser dependency

24. **🖥️ CLAW CONTROL PANEL (Tauri + React Desktop App)**
    - Native desktop application for managing The Claw fleet.
    - **Tabs:** AI Orchestrator Chat, Memory & Ideas, Fleet Dashboard, Task Manager, System Settings
    - **Live Telemetry:** Real-time polling of fleet status, system logs, and agent states
    - **Memory Tab:** Project timeline view, idea cards with confidence scores, brainstorm interface with cross-pollination toggle
    - **Stack:** Tauri (Rust) + React + Vite + Tailwind CSS on port 42018
    - **Glassmorphism UI:** Dark theme with backdrop blur, custom scrollbars, and micro-animations

25. **🔀 ADAPTIVE FLEET MODEL ROUTER (10 Cloud Providers, Unified Scoring)**
    - Intelligently routes every LLM request to the best available model — local, fleet, or cloud.
    - **Hardware Probing:** CPU cores, RAM, GPU VRAM, Ollama model inventory per fleet node
    - **Cloud API Registry:** DeepSeek, OpenRouter, OpenAI (GPT-5.4, o3, o4-mini), Anthropic (Claude Opus/Sonnet 4.6), Google (Gemini 3.1 Pro), Groq (Llama 4 Scout), Mistral (Large 3, Codestral), Together, xAI (Grok 4.1), Kimi
    - **Unified Scoring:** Local Ollama models, remote fleet models, and cloud APIs all compete in a single ranked leaderboard per task type (code, conversation, brainstorm, vision, general)
    - **Task-Aware Routing:** Coding tasks prefer Claude Opus 4.6 (score 185), brainstorming prefers reasoning models, vision routes to multimodal models
    - **Temperature Control:** 0.3 for code (precise), 0.7 for conversation, 0.85 for brainstorming
    - **Fallback Chain:** Best fleet model → best cloud API → error (never silently fails)
    - **Integration:** Wired into `the-claw.ts` (route_model, fleet_capabilities actions + /capabilities endpoint), `whatsapp-bridge.ts` (replaces hardcoded LLM calls)

---

## Architecture Highlight

VegaMCP uses an advanced **Progressive Disclosure** routing pattern:
- Instead of feeding massive raw parameter lists into context windows, VegaMCP exposes grouped top-level schemas (17 core capability areas).
- The LLM calls a high-level action via `action` specifiers internally mapping to 65+ underlying granular execution endpoints.
- This creates 100% backward compatibility with v6.0 scripts via `src/compatibility/complete-aliases.ts` alias mapping, while dropping context consumption from over ~12,000 tokens to around ~1,200 tokens baseline limit.

## Cross-Agent Compatibility
Operates identically across universally compatible MCP clients:
- **VS Code** (Roo Code, Cline, Antigravity)
- **Kimi Code** / **Claude Code** / **Codex CLI**
- **Cursor** / **Windsurf**
- **WhatsApp** (via Conversational AI Bridge)
