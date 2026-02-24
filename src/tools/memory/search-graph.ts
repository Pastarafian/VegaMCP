/**
 * VegaMCP — Search Graph Tool
 */

import { searchEntities, logAudit } from '../../db/graph-store.js';
import { validateString } from '../../security/input-validator.js';
import { checkRateLimit } from '../../security/rate-limiter.js';

export const searchGraphSchema = {
  name: 'search_graph',
  description: 'Search the memory graph using text matching. Searches entity names, types, domains, and observation content. Returns matching entities with their observations and relations. Use this to recall past decisions, find related concepts, or check if something has been recorded before.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query text' },
      domain: { type: 'string', description: 'Optional domain filter to narrow results' },
      type: { type: 'string', description: 'Optional entity type filter' },
      limit: { type: 'number', description: 'Maximum number of results', default: 10 },
    },
    required: ['query'],
  },
};

export async function handleSearchGraph(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  const rateCheck = checkRateLimit('memory');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const queryCheck = validateString(args.query, 'searchQuery', 'query');
    if (!queryCheck.valid) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: queryCheck.error } }) }] };
    }

    const limit = Math.min(Math.max(1, args.limit || 10), 50);
    const results = searchEntities(queryCheck.value!, args.domain, args.type, limit);

    const result = {
      success: true,
      query: queryCheck.value,
      resultCount: results.length,
      results: results.map(e => ({
        name: e.name,
        type: e.type,
        domain: e.domain,
        observations: e.observations,
        relations: e.relations.map(r => ({
          direction: r.direction,
          relatedEntity: r.relatedEntity,
          type: r.type,
          strength: r.strength,
          context: r.context,
        })),
      })),
    };

    logAudit('search_graph', `Query: "${queryCheck.value}" → ${results.length} results`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('search_graph', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
