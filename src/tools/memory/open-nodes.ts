/**
 * VegaMCP — Open Nodes Tool
 */

import { getEntityWithDetails, logAudit } from '../../db/graph-store.js';
import { validateString } from '../../security/input-validator.js';
import { checkRateLimit } from '../../security/rate-limiter.js';

export const openNodesSchema = {
  name: 'open_nodes',
  description: 'Retrieve one or more specific entities by their exact names, including all their observations and relationships. Use this when you know the exact entity name and need its full context.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      names: { type: 'array', items: { type: 'string' }, description: 'Array of entity names to retrieve' },
    },
    required: ['names'],
  },
};

export async function handleOpenNodes(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  const rateCheck = checkRateLimit('memory');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const names = args.names;
    if (!Array.isArray(names) || names.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'names must be a non-empty array' } }) }] };
    }

    const found: any[] = [];
    const notFound: string[] = [];

    for (const name of names) {
      const nameCheck = validateString(name, 'entityName', 'name');
      if (!nameCheck.valid) {
        notFound.push(name);
        continue;
      }

      const entity = getEntityWithDetails(nameCheck.value!);
      if (entity) {
        found.push({
          name: entity.name,
          type: entity.type,
          domain: entity.domain,
          created: entity.created_at,
          updated: entity.updated_at,
          observations: entity.observations,
          relations: entity.relations,
        });
      } else {
        notFound.push(nameCheck.value!);
      }
    }

    const result = {
      success: true,
      foundCount: found.length,
      entities: found,
      notFound: notFound.length > 0 ? notFound : undefined,
    };

    logAudit('open_nodes', `Opened ${found.length}/${names.length} nodes`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('open_nodes', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
