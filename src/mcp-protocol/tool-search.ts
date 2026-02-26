/**
 * VegaMCP — Tool Search / Lazy Loading
 * Meta-tool that searches the tool catalog and returns full schemas on demand.
 * Reduces context window usage by 10x — only relevant tool schemas are loaded.
 */

export interface ToolEntry {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  tags: string[];
  essential: boolean;  // Always load full schema
  usageCount: number;
}

const toolRegistry = new Map<string, ToolEntry>();

/**
 * Register a tool in the search index
 */
export function registerSearchableTool(
  name: string,
  description: string,
  inputSchema: Record<string, any>,
  tags: string[] = [],
  essential: boolean = false
): void {
  toolRegistry.set(name, { name, description, inputSchema, tags, essential, usageCount: 0 });
}

/**
 * Bulk register tools from the tool registry
 */
export function registerAllSearchableTools(tools: { schema: { name: string; description: string; inputSchema: any } }[]): void {
  const essentialTools = new Set([
    'search_graph', 'create_entities', 'graph_rag', 'tool_search',
    'llm_router', 'mcp_tasks', 'a2a_protocol',
  ]);

  for (const tool of tools) {
    const tags = inferTags(tool.schema.name, tool.schema.description);
    registerSearchableTool(
      tool.schema.name,
      tool.schema.description,
      tool.schema.inputSchema,
      tags,
      essentialTools.has(tool.schema.name)
    );
  }
}

/**
 * Search tools by natural language query
 * Returns matching tools with FULL schemas
 */
export function searchTools(query: string, limit: number = 5): ToolEntry[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  const scored: { tool: ToolEntry; score: number }[] = [];

  for (const tool of toolRegistry.values()) {
    let score = 0;
    const nameLower = tool.name.toLowerCase();
    const descLower = tool.description.toLowerCase();

    // Exact name match
    if (nameLower === queryLower) score += 100;

    // Name contains query
    if (nameLower.includes(queryLower)) score += 50;

    // Query contains tool name
    if (queryLower.includes(nameLower)) score += 30;

    // Word-level matching
    for (const word of queryWords) {
      if (nameLower.includes(word)) score += 15;
      if (descLower.includes(word)) score += 10;
      if (tool.tags.some(t => t.includes(word))) score += 20;
    }

    // Tag matching
    for (const tag of tool.tags) {
      if (queryLower.includes(tag)) score += 25;
    }

    // Usage frequency bonus
    score += Math.min(tool.usageCount * 0.5, 10);

    if (score > 0) scored.push({ tool, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.tool);
}

/**
 * Get essential tools (always load full schema)
 */
export function getEssentialTools(): ToolEntry[] {
  return Array.from(toolRegistry.values()).filter(t => t.essential);
}

/**
 * Get minimal tool listing (name + description only, no inputSchema)
 * For initial ListTools response to reduce context size
 */
export function getMinimalToolList(): { name: string; description: string }[] {
  return Array.from(toolRegistry.values()).map(t => ({
    name: t.name,
    description: t.description,
  }));
}

/**
 * Get full schema for a specific tool
 */
export function getToolSchema(toolName: string): ToolEntry | null {
  return toolRegistry.get(toolName) || null;
}

/**
 * Track tool usage for search relevance
 */
export function trackToolUsage(toolName: string): void {
  const tool = toolRegistry.get(toolName);
  if (tool) tool.usageCount++;
}

/** Infer tags from tool name and description */
function inferTags(name: string, description: string): string[] {
  const tags: string[] = [];
  const text = `${name} ${description}`.toLowerCase();

  const tagMap: Record<string, string[]> = {
    'memory': ['memory', 'graph', 'entity', 'relation', 'observation', 'knowledge'],
    'search': ['search', 'find', 'query', 'lookup', 'discover'],
    'browser': ['browser', 'navigate', 'screenshot', 'click', 'web', 'page'],
    'code': ['code', 'analysis', 'lint', 'syntax', 'language', 'debug'],
    'security': ['security', 'scan', 'vulnerability', 'threat', 'injection'],
    'swarm': ['swarm', 'agent', 'orchestrat', 'pipeline', 'task'],
    'research': ['research', 'hypothesis', 'synthesis', 'evolution'],
    'file': ['file', 'filesystem', 'directory', 'read', 'write'],
    'ai': ['llm', 'model', 'routing', 'sampling', 'rag', 'reasoning'],
    'data': ['data', 'database', 'analytics', 'metrics', 'stats'],
    'test': ['test', 'stress', 'benchmark', 'quality', 'ab_test'],
  };

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(k => text.includes(k))) tags.push(tag);
  }

  return tags;
}

// ── Tool Schema & Handler ──

export const toolSearchSchema = {
  name: 'tool_search',
  description: 'Search for VegaMCP tools by natural language query. Returns matching tools with full input schemas. Use this to find the right tool for a task without loading all tool definitions upfront. Reduces context by 10x.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['search', 'list_all', 'get_schema', 'essential', 'stats'] },
      query: { type: 'string', description: 'Natural language search query (for search)' },
      tool_name: { type: 'string', description: 'Tool name (for get_schema)' },
      limit: { type: 'number', description: 'Max results (default: 5)' },
    },
    required: ['action'],
  },
};

export function handleToolSearch(args: any): string {
  try {
    switch (args.action) {
      case 'search': {
        if (!args.query) return JSON.stringify({ success: false, error: 'query required' });
        const results = searchTools(args.query, args.limit || 5);
        return JSON.stringify({
          success: true,
          tools: results.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            tags: t.tags,
          })),
          count: results.length,
          totalAvailable: toolRegistry.size,
        });
      }
      case 'list_all': {
        return JSON.stringify({
          success: true,
          tools: getMinimalToolList(),
          count: toolRegistry.size,
          note: 'Use search or get_schema to get full inputSchema for specific tools',
        });
      }
      case 'get_schema': {
        if (!args.tool_name) return JSON.stringify({ success: false, error: 'tool_name required' });
        const tool = getToolSchema(args.tool_name);
        if (!tool) return JSON.stringify({ success: false, error: `Tool not found: ${args.tool_name}` });
        return JSON.stringify({ success: true, tool: { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, tags: tool.tags } });
      }
      case 'essential': {
        const essential = getEssentialTools();
        return JSON.stringify({
          success: true,
          tools: essential.map(t => ({ name: t.name, description: t.description, tags: t.tags })),
          count: essential.length,
        });
      }
      case 'stats': {
        const allTools = Array.from(toolRegistry.values());
        const tagCounts: Record<string, number> = {};
        for (const t of allTools) {
          for (const tag of t.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        return JSON.stringify({
          success: true,
          totalTools: toolRegistry.size,
          essentialTools: allTools.filter(t => t.essential).length,
          tagDistribution: tagCounts,
          mostUsed: allTools.sort((a, b) => b.usageCount - a.usageCount).slice(0, 5).map(t => ({ name: t.name, usageCount: t.usageCount })),
        });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
