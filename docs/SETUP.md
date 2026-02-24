# Setup & Configuration Guide

> **Prerequisites:** Node.js 20+, npm 9+  
> **Platform:** Windows 10/11  
> **IDE:** Google Antigravity

---

## 1. Quick Start

```bash
# Clone/navigate to the project
cd /path/to/VegaMCP

# Install dependencies
npm install

# Copy environment template
copy .env.example .env

# Edit .env with your API keys (see Section 3)
notepad .env

# Build the TypeScript source
npm run build

# Test the server starts correctly
npm start
```

---

## 2. Antigravity Configuration

### 2.1 Register the MCP Server

Open your Antigravity settings and locate the `mcp_config.json` file.  
Add the VegaMCP server entry:

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

### 2.2 Verify Connection

After saving, restart Antigravity. You should see VegaMCP listed in  
the Agent Manager with all tools, resources, and prompts available.

---

## 3. Environment Variables

Create a `.env` file in the project root:

```env
# ========================================
# VEGAMCP CONFIGURATION
# ========================================

# Workspace root â€” the AI can only access files under this path
WORKSPACE_ROOT=/path/to/VegaMCP

# ----------------------------------------
# SENTRY MODULE (Optional â€” disable by leaving blank)
# ----------------------------------------
# Get your auth token at: https://sentry.io/settings/auth-tokens/
# Required scopes: project:read, event:read, event:write
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# ----------------------------------------
# REASONING MODULE (Optional â€” disable by leaving blank)
# ----------------------------------------
# OpenRouter API key (recommended â€” gives access to multiple models)
# Get yours at: https://openrouter.ai/keys
OPENROUTER_API_KEY=

# Direct DeepSeek API key (fallback if OpenRouter is not set)
# Get yours at: https://platform.deepseek.com/api_keys
DEEPSEEK_API_KEY=

# ----------------------------------------
# BROWSER MODULE SETTINGS
# ----------------------------------------
# Allow browser to navigate to external URLs (default: false)
BROWSER_ALLOW_EXTERNAL=false

# Browser inactivity timeout in milliseconds (default: 300000 = 5 minutes)
BROWSER_INACTIVITY_TIMEOUT=300000

# ----------------------------------------
# GENERAL SETTINGS
# ----------------------------------------
# Log level: debug, info, warn, error
LOG_LEVEL=info

# Data directory for SQLite databases
DATA_DIR=./data
```

---

## 4. Module Availability

Modules are automatically enabled/disabled based on their configuration:

| Module | Required Config | Auto-Enabled |
|--------|----------------|-------------|
| **Memory** | None (uses local SQLite) | âœ… Always |
| **Browser** | None (uses local Playwright) | âœ… Always |
| **Sentry** | `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | Only if configured |
| **Reasoning** | `OPENROUTER_API_KEY` or `DEEPSEEK_API_KEY` | Only if configured |

If a module's required config is missing, its tools simply won't be registered  
with the MCP server â€” they won't appear in Antigravity's tool list.

---

## 5. Development Mode

```bash
# Run with hot-reload during development
npm run dev

# This uses tsx to watch for TypeScript changes
# The server restarts automatically on file save
```

---

## 6. Playwright Setup

Playwright browsers must be installed once:

```bash
# Install Chromium browser binary
npx playwright install chromium
```

This downloads a sandboxed Chromium binary (~200MB) to your local Playwright cache.  
No system-level browser installation is required.

---

## 7. Data Storage

All persistent data is stored in the `data/` directory:

```
data/
â”œâ”€â”€ memory.db          # Knowledge graph (SQLite)
â””â”€â”€ (created at runtime)
```

This directory is gitignored by default. Back it up if you want to preserve  
your knowledge graph across machine migrations.

---

## 8. Troubleshooting

### Server won't start
```bash
# Check Node.js version (must be 20+)
node --version

# Rebuild
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### Playwright browser won't launch
```bash
# Reinstall browser binaries
npx playwright install chromium

# Check if running in a restricted environment
npx playwright install --with-deps chromium
```

### Sentry returns 401
- Verify your auth token at https://sentry.io/settings/auth-tokens/
- Ensure the token has `project:read`, `event:read`, `event:write` scopes
- Check that `SENTRY_ORG` and `SENTRY_PROJECT` match your Sentry dashboard slugs

### Memory database is locked
- Ensure only one instance of VegaMCP is running
- Check for zombie Node.js processes: `tasklist | findstr node`
- Delete `data/memory.db-journal` if it exists (crash recovery file)
