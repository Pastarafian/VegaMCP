# 🔧 Ops & Context Features

The OPS_AND_CONTEXT Omni-Cluster provides the foundational infrastructure that keeps VegaMCP synchronized and updated, and gives it immediate access to vast libraries.

## 1. Context7 Documentation Bridge (`context7_docs`)
One of the most powerful features in v7.2—this tool fetches complete, un-truncated, official developer documentation for major frameworks directly into the agent's context window.

### Built-in Libraries
Next.js, React, Tailwind, Supabase, Stripe, Playwright, Vercel, Node.js, and more.

### Tutorial: Instant Knowledge
1. You are tasked with writing a Stripe webhook handler in Next.js 14.
2. Do NOT search Google and hope for the best.
3. Call `context7_docs` and request the `stripe` and `nextjs` libraries.
4. The tool instantly loads the precise, up-to-date documentation standards from the official sources, preventing you from writing outdated code using legacy patterns.

## 2. Webhooks & Watchers (`webhook`, `watch`)
- **Watchers**: Listen to local filesystem changes. An agent can set a watcher on `src/components`, and automatically run linting or tests every time a user saves a file in the IDE.
- **Webhooks**: Exposes endpoints for third-party services (like GitHub or Vercel) to trigger VegaMCP agents. (e.g., A push to `main` triggers the `reviewer` agent to analyze the diff).

## 3. Workflow Engine (`workflow`)
Define complex multi-step procedures via declarative YAML files (`.agent/workflows/*.yml`).
- Step 1: `execute` bash script.
- Step 2: `notify` Telegram.
- Step 3: `commit` to Git.

The agent easily triggers these pipelines autonomously using the workflow tool.

## 4. System Automation (`auto_update`, `health_check`)
The agent can self-heal. It uses `health_check` to monitor the CPU, memory, and database status of the VPS. If it detects a memory leak, it can `kill` the offending process or trigger the `auto_update` script to safely patch itself from the latest main branch.
