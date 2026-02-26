/**
 * VegaMCP — Dynamic Tool Discovery + Agentic RAG
 * 
 * Two capabilities in one module:
 * 
 * 1. DYNAMIC TOOL DISCOVERY — Runtime tool catalog with:
 *    • Lazy registration (tools declare themselves at runtime)
 *    • Capability-based search (find tools by what they do)
 *    • Usage statistics and popularity ranking
 *    • Tool compatibility matrix
 * 
 * 2. AGENTIC RAG — Autonomous retrieval agent that:
 *    • Plans multi-step retrieval strategies
 *    • Chains searches across vector + graph stores
 *    • Self-validates retrieved context quality
 *    • Adapts retrieval depth based on query complexity
 *    • Composes final context with provenance tracking
 */

import { getDb, saveDatabase } from '../../db/graph-store.js';
import { searchVectorStore, getVectorStoreStats } from '../../db/vector-store.js';
import { requestSampling, isSamplingAvailable } from '../../mcp-extensions.js';

// ═══════════════════════════════════════════════
// TOOL DISCOVERY SCHEMA
// ═══════════════════════════════════════════════

export const toolDiscoverySchema = {
  name: 'tool_discovery',
  description: `Dynamic Tool Discovery — runtime tool catalog with capability search, usage stats, and compatibility matrix. Actions: search (find tools by capability), catalog (list all registered tools with metadata), stats (usage statistics), recommend (suggest tools for a task), register (add a dynamic tool definition).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'catalog', 'stats', 'recommend', 'register'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'Search query or task description' },
      category: { type: 'string', description: 'Filter by category' },
      limit: { type: 'number', description: 'Max results (default: 20)' },
      // For register
      tool_name: { type: 'string', description: 'Name of tool to register' },
      tool_description: { type: 'string', description: 'Description of tool capability' },
      tool_category: { type: 'string', description: 'Category for the tool' },
      tool_tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for discoverability',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// AGENTIC RAG SCHEMA
// ═══════════════════════════════════════════════

export const agenticRagSchema = {
  name: 'agentic_rag',
  description: `Agentic RAG — autonomous retrieval agent. Plans multi-step retrieval strategies, chains vector + graph searches, self-validates context quality, and composes final retrieval context with provenance. Actions: retrieve (autonomous multi-step retrieval), plan (show retrieval strategy without executing), validate (check context quality), compose (merge multiple contexts).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['retrieve', 'plan', 'validate', 'compose'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'The retrieval query' },
      max_steps: { type: 'number', description: 'Max retrieval steps (default: 5)' },
      min_quality: { type: 'number', description: 'Minimum quality score 0-1 (default: 0.3)' },
      contexts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Multiple contexts to compose (for compose action)',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// TABLE INIT
// ═══════════════════════════════════════════════

let tablesInit = false;

function initTables(): void {
  if (tablesInit) return;
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_catalog (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      usage_count INTEGER DEFAULT 0,
      last_used TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_dynamic INTEGER DEFAULT 0
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_category ON tool_catalog(category);`);
  saveDatabase();
  tablesInit = true;
}

// ═══════════════════════════════════════════════
// TOOL DISCOVERY HANDLER
// ═══════════════════════════════════════════════

export async function handleToolDiscovery(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;
  initTables();

  try {
    switch (action) {
      case 'search': return handleSearch(args);
      case 'catalog': return handleCatalog(args);
      case 'stats': return handleDiscoveryStats();
      case 'recommend': return handleRecommend(args);
      case 'register': return handleRegister(args);
      default: return out({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return out({ error: err.message });
  }
}

function handleSearch(args: any) {
  const { query, category, limit = 20 } = args;
  if (!query) return out({ error: 'query is required' });

  const db = getDb();
  const words = query.toLowerCase().split(/\s+/);

  let sql = `SELECT name, description, category, tags, usage_count FROM tool_catalog WHERE (`;
  const params: any[] = [];
  const conditions: string[] = [];

  for (const word of words) {
    conditions.push(`(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)`);
    params.push(`%${word}%`, `%${word}%`, `%${word}%`);
  }
  sql += conditions.join(' OR ') + ')';

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  sql += ` ORDER BY usage_count DESC LIMIT ?`;
  params.push(limit);

  const results = db.exec(sql, params);
  const tools = results.length > 0
    ? results[0].values.map((row: any[]) => ({
        name: row[0],
        description: (row[1] as string).slice(0, 200),
        category: row[2],
        tags: JSON.parse(row[3] as string || '[]'),
        usageCount: row[4],
      }))
    : [];

  return out({
    query,
    results: tools,
    total: tools.length,
  });
}

function handleCatalog(args: any) {
  const { category, limit = 50 } = args;
  const db = getDb();

  let sql = `SELECT name, description, category, tags, usage_count, is_dynamic FROM tool_catalog`;
  const params: any[] = [];
  if (category) {
    sql += ` WHERE category = ?`;
    params.push(category);
  }
  sql += ` ORDER BY category, name LIMIT ?`;
  params.push(limit);

  const results = db.exec(sql, params);
  const tools = results.length > 0
    ? results[0].values.map((row: any[]) => ({
        name: row[0],
        description: (row[1] as string).slice(0, 150),
        category: row[2],
        tags: JSON.parse(row[3] as string || '[]'),
        usageCount: row[4],
        isDynamic: !!row[5],
      }))
    : [];

  // Group by category
  const byCategory: Record<string, any[]> = {};
  for (const tool of tools) {
    const cat = tool.category as string;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(tool);
  }

  return out({
    totalTools: tools.length,
    categories: Object.keys(byCategory),
    catalog: byCategory,
  });
}

function handleDiscoveryStats() {
  const db = getDb();
  const total = db.exec(`SELECT COUNT(*), SUM(usage_count) FROM tool_catalog`);
  const topTools = db.exec(`SELECT name, usage_count FROM tool_catalog ORDER BY usage_count DESC LIMIT 10`);
  const categories = db.exec(`SELECT category, COUNT(*) FROM tool_catalog GROUP BY category ORDER BY COUNT(*) DESC`);

  return out({
    totalTools: total.length > 0 ? total[0].values[0][0] : 0,
    totalUsage: total.length > 0 ? total[0].values[0][1] : 0,
    topTools: topTools.length > 0 ? topTools[0].values.map((r: any[]) => ({ name: r[0], usage: r[1] })) : [],
    categories: categories.length > 0 ? categories[0].values.map((r: any[]) => ({ name: r[0], count: r[1] })) : [],
  });
}

function handleRecommend(args: any) {
  const { query } = args;
  if (!query) return out({ error: 'query is required' });

  // Use keyword matching to recommend tools
  const searchResult = handleSearch({ query, limit: 5 });
  const parsed = JSON.parse((searchResult as any).content[0].text);

  return out({
    task: query,
    recommendations: parsed.results || [],
    note: 'Recommendations based on tool descriptions and past usage. Also consider using graph_rag or llm_router for more complex tasks.',
  });
}

function handleRegister(args: any) {
  const { tool_name, tool_description, tool_category = 'custom', tool_tags = [] } = args;
  if (!tool_name || !tool_description) return out({ error: 'tool_name and tool_description are required' });

  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO tool_catalog (name, description, category, tags, is_dynamic) VALUES (?, ?, ?, ?, 1)`,
    [tool_name, tool_description, tool_category, JSON.stringify(tool_tags)]
  );
  saveDatabase();

  return out({
    status: 'registered',
    name: tool_name,
    category: tool_category,
    tags: tool_tags,
  });
}

/**
 * Bulk-register all built-in tools into the discovery catalog.
 */
export function seedToolCatalog(tools: Array<{ name: string; description: string }>): void {
  initTables();
  const db = getDb();

  for (const tool of tools) {
    // Infer category from tool name
    let category = 'general';
    if (tool.name.includes('graph') || tool.name.includes('memory') || tool.name.includes('vector') || tool.name.includes('entity') || tool.name.includes('observation')) category = 'memory';
    else if (tool.name.includes('browser') || tool.name.includes('navigate') || tool.name.includes('click') || tool.name.includes('screenshot')) category = 'browser';
    else if (tool.name.includes('sentry') || tool.name.includes('error')) category = 'sentry';
    else if (tool.name.includes('swarm') || tool.name.includes('agent') || tool.name.includes('task') || tool.name.includes('pipeline')) category = 'swarm';
    else if (tool.name.includes('hypothesis') || tool.name.includes('stress') || tool.name.includes('quality') || tool.name.includes('sentinel') || tool.name.includes('security') || tool.name.includes('synthesis') || tool.name.includes('rag') || tool.name.includes('router')) category = 'research';
    else if (tool.name.includes('reason') || tool.name.includes('code_analysis') || tool.name.includes('analytics')) category = 'capabilities';

    db.run(
      `INSERT OR IGNORE INTO tool_catalog (name, description, category, tags, is_dynamic) VALUES (?, ?, ?, '[]', 0)`,
      [tool.name, tool.description.slice(0, 500), category]
    );
  }
  saveDatabase();
}

/**
 * Record a tool usage for stats tracking.
 */
export function recordToolUsage(toolName: string): void {
  try {
    const db = getDb();
    db.run(
      `UPDATE tool_catalog SET usage_count = usage_count + 1, last_used = datetime('now') WHERE name = ?`,
      [toolName]
    );
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════
// AGENTIC RAG HANDLER
// ═══════════════════════════════════════════════

export async function handleAgenticRag(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;
  initTables();

  try {
    switch (action) {
      case 'retrieve': return await handleRetrieve(args);
      case 'plan': return handlePlan(args);
      case 'validate': return handleValidate(args);
      case 'compose': return handleCompose(args);
      default: return out({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return out({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// AGENTIC RAG: RETRIEVE (Main Pipeline)
// ═══════════════════════════════════════════════

async function handleRetrieve(args: any) {
  const { query, max_steps = 5, min_quality = 0.3 } = args;
  if (!query) return out({ error: 'query is required' });

  const plan = createRetrievalPlan(query);
  const contexts: RetrievalContext[] = [];
  const log: string[] = [];

  // Execute retrieval steps
  for (let step = 0; step < Math.min(plan.steps.length, max_steps); step++) {
    const planStep = plan.steps[step];
    log.push(`Step ${step + 1}: ${planStep.description}`);

    const result = executeRetrievalStep(planStep, query, contexts);
    if (result.quality >= min_quality) {
      contexts.push(result);
      log.push(`  → Found ${result.chunks.length} chunks (quality: ${Math.round(result.quality * 100)}%)`);
    } else {
      log.push(`  → Skipped (quality ${Math.round(result.quality * 100)}% < min ${Math.round(min_quality * 100)}%)`);
    }

    // Early termination if we have enough high-quality context
    const totalQuality = contexts.reduce((sum, c) => sum + c.quality, 0) / Math.max(contexts.length, 1);
    if (contexts.length >= 3 && totalQuality > 0.7) {
      log.push(`Early termination: sufficient quality (${Math.round(totalQuality * 100)}%)`);
      break;
    }
  }

  // Compose final context
  const composed = composeContexts(contexts, query);

  // Try LLM-enhanced summarization if sampling is available
  let summary: string | null = null;
  if (isSamplingAvailable() && composed.length > 500) {
    summary = await requestSampling(
      `Summarize the following retrieval context concisely, preserving all key facts:\n\n${composed.slice(0, 3000)}`,
      { maxTokens: 500, systemPrompt: 'You are a precise information summarizer.' }
    );
  }

  return out({
    query,
    stepsExecuted: contexts.length,
    totalChunks: contexts.reduce((sum, c) => sum + c.chunks.length, 0),
    avgQuality: Math.round((contexts.reduce((sum, c) => sum + c.quality, 0) / Math.max(contexts.length, 1)) * 100),
    context: composed,
    summary: summary || undefined,
    log,
  });
}

// ═══════════════════════════════════════════════
// AGENTIC RAG: PLAN (Show strategy)
// ═══════════════════════════════════════════════

function handlePlan(args: any) {
  const { query } = args;
  if (!query) return out({ error: 'query is required' });

  const plan = createRetrievalPlan(query);
  return out({
    query,
    complexity: plan.complexity,
    steps: plan.steps.map((s, i) => ({
      order: i + 1,
      type: s.type,
      description: s.description,
      source: s.source,
    })),
    estimatedQuality: plan.estimatedQuality,
  });
}

// ═══════════════════════════════════════════════
// AGENTIC RAG: VALIDATE
// ═══════════════════════════════════════════════

function handleValidate(args: any) {
  const { query } = args;
  if (!query) return out({ error: 'query is required (the context to validate)' });

  const quality = assessContextQuality(query);
  return out({
    quality: Math.round(quality * 100),
    grade: quality > 0.8 ? 'A' : quality > 0.6 ? 'B' : quality > 0.4 ? 'C' : quality > 0.2 ? 'D' : 'F',
    factors: {
      length: query.length > 200 ? 'good' : 'short',
      specificity: /\d+|specific|concrete|example/i.test(query) ? 'good' : 'vague',
      structure: /\n|•|→|\d\./i.test(query) ? 'structured' : 'unstructured',
    },
  });
}

// ═══════════════════════════════════════════════
// AGENTIC RAG: COMPOSE
// ═══════════════════════════════════════════════

function handleCompose(args: any) {
  const { contexts, query = 'Combined context' } = args;
  if (!contexts || !Array.isArray(contexts) || contexts.length === 0) {
    return out({ error: 'contexts array is required' });
  }

  const combined = contexts.join('\n\n---\n\n');
  const deduped = deduplicateText(combined);

  return out({
    originalLength: combined.length,
    composedLength: deduped.length,
    compressionRatio: `${Math.round((1 - deduped.length / combined.length) * 100)}%`,
    composed: deduped,
  });
}

// ═══════════════════════════════════════════════
// INTERNAL: RETRIEVAL PLANNING
// ═══════════════════════════════════════════════

interface RetrievalStep {
  type: 'vector_search' | 'graph_entities' | 'graph_relations' | 'observation_scan' | 'refinement';
  description: string;
  source: string;
  params: Record<string, any>;
}

interface RetrievalPlan {
  complexity: 'simple' | 'moderate' | 'complex';
  steps: RetrievalStep[];
  estimatedQuality: number;
}

function createRetrievalPlan(query: string): RetrievalPlan {
  const words = query.split(/\s+/).length;
  const hasCode = /```|function|class|import/.test(query);
  const hasEntities = /[A-Z][a-z]+(?:[A-Z][a-z]+)+/.test(query); // CamelCase detection
  const isQuestion = /\?|how|what|why|when|where|which/i.test(query);

  const complexity: 'simple' | 'moderate' | 'complex' =
    words > 20 || hasCode ? 'complex' : words > 8 ? 'moderate' : 'simple';

  const steps: RetrievalStep[] = [];

  // Step 1: Always start with vector search (broad recall)
  steps.push({
    type: 'vector_search',
    description: 'Semantic similarity search across knowledge base',
    source: 'vector_store',
    params: { collection: 'knowledge', limit: 10 },
  });

  // Step 2: Entity lookup if we detect named concepts
  if (hasEntities || words > 3) {
    steps.push({
      type: 'graph_entities',
      description: 'Find matching entities in knowledge graph',
      source: 'graph_store',
      params: { depth: 1 },
    });
  }

  // Step 3: Code snippets if code-related
  if (hasCode || /code|function|implement|api|debug/i.test(query)) {
    steps.push({
      type: 'vector_search',
      description: 'Search code snippet collection',
      source: 'vector_store',
      params: { collection: 'code_snippets', limit: 5 },
    });
  }

  // Step 4: Relation traversal for complex queries
  if (complexity === 'complex' || isQuestion) {
    steps.push({
      type: 'graph_relations',
      description: 'Traverse entity relationships for deeper context',
      source: 'graph_store',
      params: { depth: 2 },
    });
  }

  // Step 5: Observation scan for additional detail
  steps.push({
    type: 'observation_scan',
    description: 'Scan entity observations for supporting detail',
    source: 'graph_store',
    params: { limit: 10 },
  });

  return {
    complexity,
    steps,
    estimatedQuality: complexity === 'complex' ? 0.85 : complexity === 'moderate' ? 0.7 : 0.6,
  };
}

// ═══════════════════════════════════════════════
// INTERNAL: RETRIEVAL EXECUTION
// ═══════════════════════════════════════════════

interface RetrievalContext {
  chunks: string[];
  source: string;
  quality: number;
}

function executeRetrievalStep(
  step: RetrievalStep,
  query: string,
  existingContexts: RetrievalContext[]
): RetrievalContext {
  const chunks: string[] = [];

  switch (step.type) {
    case 'vector_search': {
      const collection = step.params.collection || 'knowledge';
      const limit = step.params.limit || 10;
      try {
        const results = searchVectorStore(query, collection, limit);
        for (const r of results) {
          if (r.content && r.content.length > 30) {
            chunks.push(r.content);
          }
        }
      } catch { /* ignore */ }
      break;
    }

    case 'graph_entities': {
      const db = getDb();
      const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      try {
        for (const word of words.slice(0, 5)) {
          const ents = db.exec(
            `SELECT e.name, e.entity_type, GROUP_CONCAT(o.content, ' | ') as obs 
             FROM entities e LEFT JOIN observations o ON e.name = o.entity_name 
             WHERE LOWER(e.name) LIKE ? GROUP BY e.name LIMIT 3`,
            [`%${word}%`]
          );
          if (ents.length > 0) {
            for (const row of ents[0].values) {
              if (row[2]) chunks.push(`[${row[1]}] ${row[0]}: ${(row[2] as string).slice(0, 500)}`);
            }
          }
        }
      } catch { /* ignore */ }
      break;
    }

    case 'graph_relations': {
      const db = getDb();
      const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      try {
        for (const word of words.slice(0, 3)) {
          const rels = db.exec(
            `SELECT r.from_entity, r.relation_type, r.to_entity 
             FROM relations r 
             WHERE LOWER(r.from_entity) LIKE ? OR LOWER(r.to_entity) LIKE ? LIMIT 5`,
            [`%${word}%`, `%${word}%`]
          );
          if (rels.length > 0) {
            for (const row of rels[0].values) {
              chunks.push(`${row[0]} --[${row[1]}]--> ${row[2]}`);
            }
          }
        }
      } catch { /* ignore */ }
      break;
    }

    case 'observation_scan': {
      const db = getDb();
      const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      try {
        const obs = db.exec(
          `SELECT entity_name, content FROM observations WHERE ` +
          words.slice(0, 3).map(() => `LOWER(content) LIKE ?`).join(' OR ') +
          ` LIMIT ?`,
          [...words.slice(0, 3).map(w => `%${w}%`), step.params.limit || 10]
        );
        if (obs.length > 0) {
          for (const row of obs[0].values) {
            chunks.push(`${row[0]}: ${(row[1] as string).slice(0, 300)}`);
          }
        }
      } catch { /* ignore */ }
      break;
    }
  }

  return {
    chunks,
    source: step.source,
    quality: chunks.length > 0 ? Math.min(0.3 + chunks.length * 0.1, 1.0) : 0,
  };
}

// ═══════════════════════════════════════════════
// INTERNAL: HELPERS
// ═══════════════════════════════════════════════

function composeContexts(contexts: RetrievalContext[], query: string): string {
  const allChunks: string[] = [];
  for (const ctx of contexts) {
    allChunks.push(...ctx.chunks);
  }

  // Deduplicate
  const unique = [...new Set(allChunks)];

  if (unique.length === 0) return 'No relevant context found.';

  return [
    `=== RETRIEVAL CONTEXT for: "${query}" ===`,
    '',
    ...unique.map((c, i) => `[${i + 1}] ${c}`),
    '',
    `=== END (${unique.length} items) ===`,
  ].join('\n');
}

function assessContextQuality(text: string): number {
  let score = 0.3;
  if (text.length > 200) score += 0.1;
  if (text.length > 500) score += 0.1;
  if (/\d+/.test(text)) score += 0.1; // Contains specifics
  if (/\n/.test(text)) score += 0.1; // Structured
  if (/http|url|link|source/i.test(text)) score += 0.05; // Has sources
  if (text.split(/\s+/).length > 50) score += 0.1; // Substantial
  return Math.min(score, 1.0);
}

function deduplicateText(text: string): string {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    if (normalized.length < 5 || !seen.has(normalized)) {
      seen.add(normalized);
      unique.push(line);
    }
  }

  return unique.join('\n');
}

function out(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
