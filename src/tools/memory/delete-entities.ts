/**
 * VegaMCP — Delete Entities Tool
 */

import { deleteEntity, getEntityByName, logAudit } from '../../db/graph-store.js';
import { validateString } from '../../security/input-validator.js';
import { checkRateLimit } from '../../security/rate-limiter.js';

export const deleteEntitiesSchema = {
  name: 'delete_entities',
  description: 'Delete entities from the memory graph. This also removes all relationships and observations associated with the deleted entities. Use sparingly — only when information is confirmed wrong or obsolete.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      names: { type: 'array', items: { type: 'string' }, description: 'Array of entity names to delete' },
    },
    required: ['names'],
  },
};

export async function handleDeleteEntities(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
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

    const deleted: string[] = [];
    const notFound: string[] = [];

    for (const name of names) {
      const nameCheck = validateString(name, 'entityName', 'name');
      if (!nameCheck.valid) {
        notFound.push(name);
        continue;
      }

      const success = deleteEntity(nameCheck.value!);
      if (success) {
        deleted.push(nameCheck.value!);
      } else {
        notFound.push(nameCheck.value!);
      }
    }

    const result = {
      success: true,
      deleted,
      deletedCount: deleted.length,
      notFound: notFound.length > 0 ? notFound : undefined,
      warning: deleted.length > 0 ? '⚠️ Deleted entities and all their observations and relationships. This cannot be undone.' : undefined,
    };

    logAudit('delete_entities', `Deleted ${deleted.length} entities: ${deleted.join(', ')}`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('delete_entities', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
