/**
 * VegaMCP — Create Relations Tool
 */

import { getEntityByName, createRelation, logAudit } from '../../db/graph-store.js';
import { validateString, validateNumber } from '../../security/input-validator.js';
import { checkRateLimit } from '../../security/rate-limiter.js';

const VALID_RELATION_TYPES = ['depends_on', 'implements', 'uses', 'fixed_by', 'related_to', 'contains', 'overrides'];

export const createRelationsSchema = {
  name: 'create_relations',
  description: 'Create relationships between existing entities in the memory graph. Use this to map dependencies, ownership, inheritance, and causal links between knowledge nodes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      relations: {
        type: 'array',
        description: 'Array of relations to create',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source entity name' },
            to: { type: 'string', description: 'Target entity name' },
            type: { type: 'string', description: 'Relationship type', enum: VALID_RELATION_TYPES },
            strength: { type: 'number', description: 'Confidence weight 0.0-1.0', default: 1.0 },
            context: { type: 'string', description: 'Why this relationship exists' },
          },
          required: ['from', 'to', 'type'],
        },
      },
    },
    required: ['relations'],
  },
};

export async function handleCreateRelations(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  const rateCheck = checkRateLimit('memory');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const relations = args.relations;
    if (!Array.isArray(relations) || relations.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'relations must be a non-empty array' } }) }] };
    }

    const created: Array<{ from: string; to: string; type: string }> = [];
    const errors: string[] = [];

    for (const r of relations) {
      const fromCheck = validateString(r.from, 'entityName', 'from');
      const toCheck = validateString(r.to, 'entityName', 'to');  
      if (!fromCheck.valid || !toCheck.valid) {
        errors.push(fromCheck.error || toCheck.error || 'Invalid from/to names');
        continue;
      }

      if (!VALID_RELATION_TYPES.includes(r.type)) {
        errors.push(`Invalid relation type "${r.type}". Must be one of: ${VALID_RELATION_TYPES.join(', ')}`);
        continue;
      }

      const fromEntity = getEntityByName(r.from);
      const toEntity = getEntityByName(r.to);

      if (!fromEntity) {
        errors.push(`Entity "${r.from}" not found. Create it first with create_entities.`);
        continue;
      }
      if (!toEntity) {
        errors.push(`Entity "${r.to}" not found. Create it first with create_entities.`);
        continue;
      }

      const strength = typeof r.strength === 'number' ? Math.max(0, Math.min(1, r.strength)) : 1.0;
      const success = createRelation(fromEntity.id, toEntity.id, r.type, strength, r.context);

      if (success) {
        created.push({ from: r.from, to: r.to, type: r.type });
      } else {
        errors.push(`Relation ${r.from} -[${r.type}]-> ${r.to} already exists`);
      }
    }

    const result = {
      success: true,
      created,
      createdCount: created.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    logAudit('create_relations', `Created ${created.length} relations`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('create_relations', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
