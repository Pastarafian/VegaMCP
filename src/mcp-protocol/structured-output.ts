/**
 * VegaMCP — Structured Tool Output (MCP 2025-06-18)
 * Tools declare outputSchema and return structuredContent alongside text.
 * Enables machine-readable tool composition and agent-to-agent data flow.
 */

export interface OutputSchemaEntry {
  toolName: string;
  outputSchema: Record<string, any>;  // JSON Schema
}

const schemaRegistry = new Map<string, Record<string, any>>();

/** Register an output schema for a tool */
export function registerOutputSchema(toolName: string, schema: Record<string, any>): void {
  schemaRegistry.set(toolName, schema);
}

/** Get the output schema for a tool (if registered) */
export function getOutputSchema(toolName: string): Record<string, any> | undefined {
  return schemaRegistry.get(toolName);
}

/** Check if a tool has a registered output schema */
export function hasOutputSchema(toolName: string): boolean {
  return schemaRegistry.has(toolName);
}

/** Wrap a tool response with structuredContent if the tool has an outputSchema */
export function wrapStructuredResponse(
  toolName: string,
  textContent: string,
  structuredData?: Record<string, any>
): { content: { type: string; text: string }[]; structuredContent?: Record<string, any> } {
  const response: any = {
    content: [{ type: 'text', text: textContent }],
  };

  if (structuredData && schemaRegistry.has(toolName)) {
    response.structuredContent = structuredData;
  }

  return response;
}

/** Get all registered schemas (for ListTools) */
export function getAllOutputSchemas(): Map<string, Record<string, any>> {
  return new Map(schemaRegistry);
}

/** Register schemas for all built-in tools that return structured data */
export function registerBuiltinSchemas(): void {
  registerOutputSchema('search_graph', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      entities: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, entityType: { type: 'string' },
        observations: { type: 'array', items: { type: 'string' } }
      }}},
      relations: { type: 'array', items: { type: 'object', properties: {
        from: { type: 'string' }, to: { type: 'string' }, relationType: { type: 'string' }
      }}},
      totalResults: { type: 'number' },
    },
  });

  registerOutputSchema('graph_rag', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      strategy: { type: 'string', enum: ['vector', 'graph', 'hybrid'] },
      results: { type: 'array', items: { type: 'object', properties: {
        content: { type: 'string' }, source: { type: 'string' },
        score: { type: 'number' }, metadata: { type: 'object' }
      }}},
      totalResults: { type: 'number' },
    },
  });

  registerOutputSchema('llm_router', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      selectedModel: { type: 'string' },
      provider: { type: 'string' },
      complexity: { type: 'number' },
      reasoning: { type: 'string' },
      response: { type: 'string' },
    },
  });

  registerOutputSchema('code_analysis', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      language: { type: 'string' },
      issues: { type: 'array', items: { type: 'object', properties: {
        severity: { type: 'string' }, message: { type: 'string' },
        line: { type: 'number' }, rule: { type: 'string' }
      }}},
      metrics: { type: 'object' },
    },
  });

  registerOutputSchema('analytics', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      period: { type: 'string' },
      totalCalls: { type: 'number' },
      successRate: { type: 'number' },
      topTools: { type: 'array', items: { type: 'object' } },
    },
  });

  registerOutputSchema('health_check', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
      checks: { type: 'object' },
      uptime: { type: 'number' },
    },
  });

  registerOutputSchema('ab_test', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      testId: { type: 'string' },
      winner: { type: 'string' },
      stats: { type: 'object' },
    },
  });

  registerOutputSchema('tool_discovery', {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      tools: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, description: { type: 'string' },
        usageCount: { type: 'number' }, lastUsed: { type: 'string' }
      }}},
      totalTools: { type: 'number' },
    },
  });
}
