<p align="center">
  <h1 align="center">🚀 VegaMCP v7.0</h1>
  <p align="center">
    <strong>Full Spectrum Testing Edition — AI Agent Swarm Platform</strong>
  </p>
  <p align="center">
    <a href="FEATURES.md">Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#configuration">Configuration</a>
  </p>
</p>

---

> **VegaMCP** is a production-grade MCP (Model Context Protocol) server providing an autonomous AI agent swarm, persistent memory, browser automation, multi-model reasoning, security gateway, agent graphs, zero-trust identity, A2A protocol, AI-first testing suite (mobile, web, API, accessibility), and 65+ tools — all accessible via any MCP-compatible client.
> 
> *Version 7.0 introduces aggressive semantic token savings by functionally shrinking 60+ uncompressed tools into 15 high-level unified capability clusters—dynamically saving up to 90%+ context window consumption.*

## 📖 Complete Features
**Read [FEATURES.md](./FEATURES.md) for a comprehensive list of all the 15 unified V7 capability clusters.**

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
    "vegamcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/VegaMCP/build/index.js"],
      "cwd": "/path/to/VegaMCP"
    }
  }
}
```

> **Note:** API keys can be set in the `env` block of `mcp.json` or in the `.env` file (`dotenv` is loaded automatically).

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
│   ├── mcp-protocol/               # v6.0 / v7.0 protocol modules
│   ├── db/                          # SQLite + vector store
│   ├── swarm/                       # Agent swarm (10 agents)
│   ├── tools/                       # All tool implementations
│   ├── resources/                   # MCP resource providers
│   ├── prompts/                     # MCP prompt templates
│   └── security/                    # Rate limiter, validator, guard
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
