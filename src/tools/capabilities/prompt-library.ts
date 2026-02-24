/**
 * VegaMCP — Prompt Template Library v3.2
 * 
 * Major upgrade: Auto-prompt system that detects context and selects optimal prompts.
 * All prompts are token-optimized, direct, and structured for maximum quality.
 * Inspired by: Briskli commands (Optimize/Secure/Document), Claude Code agent templates,
 * and Anthropic skills auto-activation triggers.
 * 
 * Features:
 * - Auto-select: detects task context → picks best prompt automatically
 * - Token-optimized: every prompt minimizes tokens while maximizing quality
 * - Structured output: prompts enforce structured, actionable responses
 * - Variable interpolation: {{variable}} support with auto-detection
 * - Usage tracking: most-used prompts bubble to top
 */

import { getDb, saveDatabase, logAudit } from '../../db/graph-store.js';
import { addToVectorStore, searchVectorStore } from '../../db/vector-store.js';

let initialized = false;

function initPromptLibrary(): void {
  if (initialized) return;
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      template TEXT NOT NULL,
      variables TEXT DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'general',
      description TEXT DEFAULT '',
      triggers TEXT DEFAULT '[]',
      usage_count INTEGER NOT NULL DEFAULT 0,
      avg_quality_score REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_usage ON prompt_templates(usage_count DESC);`);

  // Migration: add triggers column if missing (existing databases)
  try { db.run(`ALTER TABLE prompt_templates ADD COLUMN triggers TEXT DEFAULT '[]';`); } catch { /* column already exists */ }

  saveDatabase();

  const count = db.exec(`SELECT COUNT(*) FROM prompt_templates`);
  if (count.length > 0 && (count[0].values[0][0] as number) === 0) {
    seedTemplates();
  }
  initialized = true;
}

// ═══════════════════════════════════════════════
// BUILT-IN TEMPLATES — Token-optimized, direct, structured
// ═══════════════════════════════════════════════

function seedTemplates(): void {
  const templates = [
    // ── CODING ──
    {
      name: 'review',
      template: `Review this {{language}} code. Return ONLY:

## Critical
[bugs, security holes, data races — things that WILL break]

## Improve  
[performance, readability, maintainability fixes]

## Score: X/10

\`\`\`{{language}}
{{code}}
\`\`\``,
      variables: ['language', 'code'],
      category: 'coding',
      description: 'Concise code review — critical issues first, then improvements',
      triggers: ['review', 'code review', 'check this code', 'audit code'],
    },
    {
      name: 'fix',
      template: `Fix this {{language}} error. Be direct.

**Error:** {{error}}
**Code:** \`\`\`{{language}}\n{{code}}\n\`\`\`

Return: 1) Root cause (one sentence) 2) Fixed code 3) Why it works`,
      variables: ['language', 'error', 'code'],
      category: 'coding',
      description: 'Direct error fix — root cause + solution',
      triggers: ['fix', 'debug', 'error', 'not working', 'broken', 'crash'],
    },
    {
      name: 'implement',
      template: `Implement this in {{language}}:

**Task:** {{task}}
**Constraints:** {{constraints}}

Requirements: production-ready, error handling, typed, documented. No placeholders — complete working code only.`,
      variables: ['language', 'task', 'constraints'],
      category: 'coding',
      description: 'Full implementation from spec — no placeholders',
      triggers: ['implement', 'build', 'create', 'write code', 'code this'],
    },
    {
      name: 'refactor',
      template: `Refactor for {{goal}}:

\`\`\`{{language}}
{{code}}
\`\`\`

Return ONLY the refactored code. Add a brief comment at top explaining what changed and why.`,
      variables: ['language', 'code', 'goal'],
      category: 'coding',
      description: 'Refactor with specific goal — return code only',
      triggers: ['refactor', 'clean up', 'simplify', 'restructure', 'decouple'],
    },
    {
      name: 'optimize',
      template: `Optimize this {{language}} code for speed and memory:

\`\`\`{{language}}
{{code}}
\`\`\`

Return:
1. **Before:** O(?) time, O(?) space
2. **After:** O(?) time, O(?) space  
3. **Optimized code** (complete, drop-in replacement)
4. **What changed** (one line per optimization)`,
      variables: ['language', 'code'],
      category: 'coding',
      description: 'Performance optimization with complexity analysis',
      triggers: ['optimize', 'performance', 'slow', 'faster', 'speed up', 'efficient'],
    },
    {
      name: 'test',
      template: `Generate {{framework}} tests for:

\`\`\`{{language}}
{{code}}
\`\`\`

Cover: ✅ happy path, ⚠️ edge cases (empty, null, overflow, concurrent), ❌ error paths. Name tests descriptively. No mocks unless essential.`,
      variables: ['language', 'code', 'framework'],
      category: 'testing',
      description: 'Complete test suite — happy, edge, error paths',
      triggers: ['test', 'unit test', 'write tests', 'test coverage', 'spec'],
    },

    // ── SECURITY ──
    {
      name: 'secure',
      template: `Security audit of {{target}}:

\`\`\`{{language}}
{{code}}
\`\`\`

For each finding:
| Severity | Issue | Line | Fix |
|----------|-------|------|-----|

Check: injection, XSS, CSRF, auth bypass, data exposure, path traversal, command injection, insecure crypto, hardcoded secrets.`,
      variables: ['target', 'language', 'code'],
      category: 'security',
      description: 'Security audit with severity table',
      triggers: ['security', 'audit', 'vulnerab', 'secure this', 'pentest'],
    },

    // ── ARCHITECTURE ──
    {
      name: 'design',
      template: `Design: {{requirement}}

Constraints: {{constraints}}
Scale: {{scale}}

Return:
1. **Architecture** (ASCII diagram)
2. **Components** (name → responsibility, one line each)  
3. **Data flow** (step-by-step)
4. **Trade-offs** (what you chose and what you gave up)
5. **Risks** (top 3)`,
      variables: ['requirement', 'constraints', 'scale'],
      category: 'architecture',
      description: 'System design with trade-off analysis',
      triggers: ['architect', 'design system', 'system design', 'how to build'],
    },
    {
      name: 'api',
      template: `Design REST API for {{domain}}:

Entities: {{entities}}

For each endpoint:
| Method | Path | Req Body | Res Body | Auth | Status Codes |
|--------|------|----------|----------|------|-------------|

Include: pagination strategy, error format, versioning, rate limits.`,
      variables: ['domain', 'entities'],
      category: 'architecture',
      description: 'API design with full endpoint spec',
      triggers: ['api', 'endpoint', 'rest api', 'api design'],
    },

    // ── ANALYSIS ──
    {
      name: 'explain',
      template: `Explain this {{language}} code. Audience: {{audience}}.

\`\`\`{{language}}
{{code}}
\`\`\`

Structure: What → Why → How. Use analogies. Flag any non-obvious behavior.`,
      variables: ['language', 'code', 'audience'],
      category: 'education',
      description: 'Code explanation calibrated to audience',
      triggers: ['explain', 'what does', 'how does', 'understand', 'teach'],
    },
    {
      name: 'document',
      template: `Document this {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

Generate: JSDoc/docstring for every public function (params, returns, throws, examples). Add a module-level overview comment. Keep comments concise — no fluff.`,
      variables: ['language', 'code'],
      category: 'documentation',
      description: 'Auto-generate documentation for code',
      triggers: ['document', 'jsdoc', 'docstring', 'add comments', 'annotate'],
    },
    {
      name: 'summarize',
      template: `Summarize concisely:

{{content}}

Return:
- **TL;DR** (one sentence)
- **Key points** (max 5, bullet points)
- **Action items** (if any)
- **Gotchas** (things easily missed)`,
      variables: ['content'],
      category: 'research',
      description: 'Concise summary with actionable takeaways',
      triggers: ['summarize', 'tldr', 'key points', 'summary', 'digest'],
    },

    // ── PLANNING ──
    {
      name: 'plan',
      template: `Plan implementation of: {{task}}

Stack: {{stack}}
Constraints: {{constraints}}

Return a numbered task list. Each task:
- [ ] **Task name** — what to do (est: Xmin)

Group by phase: Setup → Core → Edge Cases → Polish. Total estimate at bottom.`,
      variables: ['task', 'stack', 'constraints'],
      category: 'planning',
      description: 'Implementation plan with time estimates',
      triggers: ['plan', 'roadmap', 'break down', 'decompose', 'how to approach'],
    },
    {
      name: 'debug_strategy',
      template: `Debug this systematically:

**Symptom:** {{symptom}}
**Expected:** {{expected}}
**Context:** {{context}}

Return:
1. **Hypotheses** (ranked by likelihood)
2. **For each:** what to check, expected result, commands/code to run
3. **Most likely cause** and fix`,
      variables: ['symptom', 'expected', 'context'],
      category: 'debugging',
      description: 'Hypothesis-driven debugging strategy',
      triggers: ['debug strategy', 'investigate', 'root cause', 'why is this'],
    },

    // ── QUICK ACTIONS (inspired by Briskli) ──
    {
      name: 'quick_optimize',
      template: `Optimize this code. Return ONLY the optimized version — no explanation:\n\n\`\`\`\n{{code}}\n\`\`\``,
      variables: ['code'],
      category: 'quick',
      description: 'Quick optimize — code only, zero explanation',
      triggers: ['quick optimize'],
    },
    {
      name: 'quick_secure',
      template: `Find security issues in this code. List ONLY the issues, one per line, with severity:\n\n\`\`\`\n{{code}}\n\`\`\``,
      variables: ['code'],
      category: 'quick',
      description: 'Quick security scan — issues only',
      triggers: ['quick secure'],
    },
    {
      name: 'quick_doc',
      template: `Add documentation to this code. Return the code with docs added — nothing else:\n\n\`\`\`\n{{code}}\n\`\`\``,
      variables: ['code'],
      category: 'quick',
      description: 'Quick document — return annotated code only',
      triggers: ['quick doc'],
    },
    {
      name: 'quick_types',
      template: `Add TypeScript types to this code. Return typed version only:\n\n\`\`\`\n{{code}}\n\`\`\``,
      variables: ['code'],
      category: 'quick',
      description: 'Quick type — add types, return code only',
      triggers: ['add types', 'type this'],
    },

    // ── META / AGENT ──
    {
      name: 'decompose',
      template: `Break this into independent subtasks that can be solved in parallel:

{{problem}}

For each subtask: name, input, output, dependencies. Return as JSON array.`,
      variables: ['problem'],
      category: 'agent',
      description: 'Decompose problem for parallel agent execution',
      triggers: ['decompose', 'parallelize', 'break into tasks'],
    },
    {
      name: 'critique',
      template: `Critique this answer ruthlessly:

**Question:** {{question}}
**Answer:** {{answer}}

Find: errors, unstated assumptions, missing edge cases, better alternatives. Rate confidence 1-10.`,
      variables: ['question', 'answer'],
      category: 'agent',
      description: 'Self-critique prompt for answer improvement',
      triggers: ['critique', 'review answer', 'is this right'],
    },
    {
      name: 'chain_prompt',
      template: `You are step {{step}} of {{total}} in a reasoning chain.

Previous context: {{context}}
Your task: {{task}}

Complete your task. Output structured data for the next step. Be precise.`,
      variables: ['step', 'total', 'context', 'task'],
      category: 'agent',
      description: 'Chain-of-thought step prompt for multi-step reasoning',
      triggers: ['chain step'],
    },
  ];

  const db = getDb();
  for (const t of templates) {
    try {
      db.run(
        `INSERT INTO prompt_templates (name, template, variables, category, description, triggers) VALUES (?, ?, ?, ?, ?, ?)`,
        [t.name, t.template, JSON.stringify(t.variables), t.category, t.description, JSON.stringify(t.triggers)]
      );
    } catch { /* ignore duplicates */ }
  }
  saveDatabase();
}

// ═══════════════════════════════════════════════
// AUTO-SELECT ENGINE — Matches context to best prompt
// ═══════════════════════════════════════════════

function autoSelectPrompt(context: string): string | null {
  initPromptLibrary();
  const db = getDb();
  const lower = context.toLowerCase();

  // Load all templates with triggers
  const result = db.exec(`SELECT name, triggers, usage_count FROM prompt_templates ORDER BY usage_count DESC`);
  if (!result.length || !result[0].values.length) return null;

  let bestMatch: { name: string; score: number } | null = null;

  for (const row of result[0].values) {
    const name = row[0] as string;
    const triggers = JSON.parse((row[1] as string) || '[]') as string[];
    const usageBonus = Math.min((row[2] as number) / 100, 0.3); // slight boost for popular templates

    let score = 0;
    for (const trigger of triggers) {
      if (lower.includes(trigger)) {
        score += trigger.length / 3; // longer trigger = more specific = better match
      }
    }
    score += usageBonus;

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { name, score };
    }
  }

  return bestMatch?.name || null;
}

// ═══════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════

export const promptLibrarySchema = {
  name: 'prompt_library',
  description: 'Automated prompt system with 20+ token-optimized templates. Auto-selects best prompt from context. Actions: auto (auto-pick from context), use (run named template), create, list, search, get, delete, update. Categories: coding, testing, security, architecture, education, documentation, research, planning, debugging, quick, agent.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['auto', 'use', 'create', 'list', 'search', 'get', 'delete', 'update'] as const,
        description: 'Action. "auto" = auto-select best prompt from context.',
      },
      name: { type: 'string' as const, description: 'Template name (for use, get, delete, update)' },
      context: { type: 'string' as const, description: 'Task context for auto-selection (for auto)' },
      variables: { type: 'object' as const, description: 'Variable values for interpolation (for use, auto)', properties: {} as Record<string, any> },
      template: { type: 'string' as const, description: 'Template text with {{variable}} placeholders (for create, update)' },
      variable_names: { type: 'array' as const, items: { type: 'string' as const }, description: 'Variable names (for create)' },
      category: { type: 'string' as const, description: 'Category filter (for create, list)' },
      description: { type: 'string' as const, description: 'Template description (for create)' },
      triggers: { type: 'array' as const, items: { type: 'string' as const }, description: 'Auto-activation trigger phrases (for create)' },
      query: { type: 'string' as const, description: 'Search query (for search)' },
    },
    required: ['action'] as const,
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export function handlePromptLibrary(args: any): string {
  initPromptLibrary();
  const start = Date.now();
  const db = getDb();

  try {
    switch (args.action) {

      case 'auto': {
        if (!args.context) return err('Provide context for auto-selection');
        const selectedName = autoSelectPrompt(args.context);
        if (!selectedName) return err('No matching prompt found. Try search or use a named template.');

        // Run the selected template
        return handlePromptLibrary({ action: 'use', name: selectedName, variables: args.variables || {} });
      }

      case 'use': {
        if (!args.name) return err('Provide template name');

        const result = db.exec(`SELECT * FROM prompt_templates WHERE name = ?`, [args.name]);
        if (result.length === 0 || result[0].values.length === 0) return err(`Template "${args.name}" not found`);

        const row = result[0].values[0];
        let prompt = row[2] as string;
        const templateVars = JSON.parse((row[3] as string) || '[]');

        const vars = args.variables || {};
        for (const varName of templateVars) {
          const value = vars[varName] || `[${varName}]`;
          prompt = prompt.replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'g'), value);
        }

        db.run(`UPDATE prompt_templates SET usage_count = usage_count + 1, updated_at = datetime('now') WHERE name = ?`, [args.name]);
        saveDatabase();

        const missingVars = templateVars.filter((v: string) => !vars[v]);
        logAudit('prompt_library', `use: ${args.name}`, true, undefined, Date.now() - start);
        return JSON.stringify({
          success: true,
          name: args.name,
          category: row[4],
          prompt,
          tokenEstimate: Math.ceil(prompt.length / 4),
          missingVariables: missingVars.length > 0 ? missingVars : undefined,
        }, null, 2);
      }

      case 'create': {
        if (!args.name || !args.template) return err('Provide name and template');

        const detectedVars: string[] = [];
        const varRegex = /\{\{(\w+)\}\}/g;
        let match;
        while ((match = varRegex.exec(args.template)) !== null) {
          if (!detectedVars.includes(match[1])) detectedVars.push(match[1]);
        }

        const variables = args.variable_names || detectedVars;
        const category = args.category || 'custom';
        const triggers = args.triggers || [];

        db.run(
          `INSERT INTO prompt_templates (name, template, variables, category, description, triggers) VALUES (?, ?, ?, ?, ?, ?)`,
          [args.name, args.template, JSON.stringify(variables), category, args.description || '', JSON.stringify(triggers)]
        );
        saveDatabase();

        addToVectorStore(
          `prompt_${args.name}`,
          `Prompt: ${args.name}\n${args.description || ''}\n${args.template}`,
          'prompt_templates',
          { name: args.name, category, variables }
        ).catch(() => {});

        logAudit('prompt_library', `create: ${args.name}`, true, undefined, Date.now() - start);
        return JSON.stringify({ success: true, name: args.name, category, variables, triggers, tokenEstimate: Math.ceil(args.template.length / 4) }, null, 2);
      }

      case 'list': {
        let sql = `SELECT name, category, description, usage_count, triggers, created_at FROM prompt_templates`;
        const params: any[] = [];
        if (args.category) { sql += ` WHERE category = ?`; params.push(args.category); }
        sql += ` ORDER BY usage_count DESC`;

        const result = db.exec(sql, params);
        const templates = result.length > 0 ? result[0].values.map((row: any[]) => ({
          name: row[0], category: row[1], description: row[2], usageCount: row[3],
          triggers: JSON.parse((row[4] as string) || '[]'),
        })) : [];

        return JSON.stringify({ success: true, templates, count: templates.length }, null, 2);
      }

      case 'search': {
        if (!args.query) return err('Provide search query');
        const likeQuery = `%${args.query}%`;
        const sqlResult = db.exec(
          `SELECT name, category, description, usage_count, triggers FROM prompt_templates
           WHERE name LIKE ? OR description LIKE ? OR template LIKE ? OR category LIKE ? OR triggers LIKE ?
           ORDER BY usage_count DESC LIMIT 10`,
          [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery]
        );

        const results = sqlResult.length > 0 ? sqlResult[0].values.map((row: any[]) => ({
          name: row[0], category: row[1], description: row[2], usageCount: row[3],
          triggers: JSON.parse((row[4] as string) || '[]'),
        })) : [];

        const vectorResults = searchVectorStore(args.query, 'prompt_templates', 5, 0.2);
        return JSON.stringify({ success: true, query: args.query, results, semanticResults: vectorResults.map(v => ({ name: v.metadata?.name, similarity: v.similarity })) }, null, 2);
      }

      case 'get': {
        if (!args.name) return err('Provide template name');
        const result = db.exec(`SELECT * FROM prompt_templates WHERE name = ?`, [args.name]);
        if (result.length === 0 || result[0].values.length === 0) return err(`Template "${args.name}" not found`);

        const row = result[0].values[0];
        return JSON.stringify({
          success: true,
          template: {
            name: row[1], text: row[2], variables: JSON.parse((row[3] as string) || '[]'),
            category: row[4], description: row[5], triggers: JSON.parse((row[6] as string) || '[]'),
            usageCount: row[7], avgQuality: row[8], created: row[9], updated: row[10],
          },
        }, null, 2);
      }

      case 'delete': {
        if (!args.name) return err('Provide template name');
        db.run(`DELETE FROM prompt_templates WHERE name = ?`, [args.name]);
        saveDatabase();
        return JSON.stringify({ success: true, deleted: args.name });
      }

      case 'update': {
        if (!args.name) return err('Provide template name');
        const updates: string[] = [];
        const params: any[] = [];

        if (args.template) {
          updates.push(`template = ?`);
          params.push(args.template);
          const vars: string[] = [];
          const regex = /\{\{(\w+)\}\}/g;
          let m;
          while ((m = regex.exec(args.template)) !== null) { if (!vars.includes(m[1])) vars.push(m[1]); }
          updates.push(`variables = ?`);
          params.push(JSON.stringify(vars));
        }
        if (args.description) { updates.push(`description = ?`); params.push(args.description); }
        if (args.category) { updates.push(`category = ?`); params.push(args.category); }
        if (args.triggers) { updates.push(`triggers = ?`); params.push(JSON.stringify(args.triggers)); }
        if (updates.length === 0) return err('No updates provided');

        updates.push(`updated_at = datetime('now')`);
        params.push(args.name);
        db.run(`UPDATE prompt_templates SET ${updates.join(', ')} WHERE name = ?`, params);
        saveDatabase();
        return JSON.stringify({ success: true, updated: args.name });
      }

      default:
        return err(`Unknown action: ${args.action}`);
    }
  } catch (e: any) {
    logAudit('prompt_library', e.message, false, 'ERROR', Date.now() - start);
    return JSON.stringify({ success: false, error: e.message });
  }
}

function err(message: string): string {
  return JSON.stringify({ success: false, error: message });
}
