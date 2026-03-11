# VegaMCP Changelog

## [7.2.0] "The Sovereign Intelligence Update" - 2026-03-07

### 🚀 Major Features & Automations
- **Claw Command Center v8 (Production Integration)**
  - Fully integrated `claw-server.js` into the main repository (`src/vps/claw-server.js`).
  - Implemented the "Dirty-Marker" Chat Sync Protocol for ultra-fast UI rendering.
  - Deployed Nginx reverse-proxy on the VPS with Gzip compression, ETag caching, and SSL configurations.
  - Added full Telegram Bot integration with inline buttons for deep control (Retry, Undo, Cancel, Wait, Approve, Reject).
- **Intelligent Context & Memory**
  - **Context Labelling System**: Messages are now intelligently tracked by `task_id`, `workspace_id`, `project_id`, and freeform `labels` via SQLite.
  - **Expandable Thinking Mechanism**: AI reasoning (`<think>...</think>`) is systematically decoupled from final answers, stored as metadata, and rendered in expandable UI blocks—massively cleaning up chat logs.
  - **Semantic Memory Core** (`semantic_memory`): Migrated from keyword search to vector-based semantic search using local Ollama embeddings (with TF-IDF fallback). Added time-weighted recall and auto-context building.
- **LLM Output Quality Evaluation**
  - Added new `llm_eval` tool (inspired by DeepEval) to score response quality based on 8 key metrics (relevance, coherence, completeness, faithfulness, format, toxicity, hallucination, and custom rubrics).
  - Includes A/B comparison and batch evaluation pipelines.
- **Search Upgrades**
  - Upgraded `web_search` with three quality modes (`speed`, `balanced`, `quality`). The `quality` mode automatically drills into the top 3 results and summarizes them.
  - Added explicit SearXNG fallback integration for privacy-first, anti-tracking meta-searches.
  - Added `domain_filter` for scoped knowledge extraction.
- **New Swarm Capabilities**
  - `context7_docs`: Instantly loads framework documentation directly into agent context.
  - `postgres_client`: Full remote Postgres capabilities natively available to Swarm DB agents.
  - `image_generation`: Local generation pipelines via integrated AI diffusers.

### 🛡️ Security & Integrity
- **Deleted Message Immutability**: All chat deletion endpoints have been disabled. A strict soft-delete/archive system (`archived` boolean) is enforced for data integrity and comprehensive audit trails.
- **XdoTool Hardening & Pivot**: `ide-autoclicker.py` has fully replaced the previous generic MCP tool, shifting to a robust Python-based CDP interface with a persistent overlay UI. Emulation is sandboxed via a definitive whitelist.
- **Provenance Warnings**: `web_search` now aggressively injects `UNVERIFIED_EXTERNAL_DATA` provenance tags onto scraped output to halt implicit prompt injections (IPI) originating from compromised websites.

### 🛠 Omni-Cluster Tool Restructuring
The tool ecosystem is now 78 custom MCP sub-tools deep, categorized into 6 zero-leak Omni-Clusters:
1. `omni_assistant` (15 tools) — Core reasoning, web search, memory graph, semantic memory, context, sequential thinking.
2. `omni_swarm` (9 tools) — Swarm ops, A2A protocols, sampling, multimodal.
3. `omni_automation` (16 tools) — Claw Command Center, VPS, Telegram, webhook, sandbox, file I/O.
4. `omni_systems` (13 tools) — Postgres client, vault, SQLite, gateway, tool search.
5. `omni_research` (11 tools) — LLM evaluation, quality gates, RAG, agentic loops.
6. `omni_testing` (13 tools) — Server testing, security pen-testing, hypothesis generators.

---
