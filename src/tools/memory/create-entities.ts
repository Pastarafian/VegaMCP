/**
 * VegaMCP — Create Entities Tool
 */

import { createEntity, addObservation, type EntityRow } from '../../db/graph-store.js';
import { validateString } from '../../security/input-validator.js';
import { checkRateLimit } from '../../security/rate-limiter.js';
import { logAudit } from '../../db/graph-store.js';

const VALID_TYPES = ['service', 'convention', 'pattern', 'bug-fix', 'dependency', 'config', 'concept'];

export const createEntitiesSchema = {
  name: 'create_entities',
  description: 'Create new entities (knowledge nodes) in the persistent memory graph. Use this to record architectural decisions, coding conventions, service definitions, bug patterns, and any other structured knowledge worth remembering across sessions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      entities: {
        type: 'array',
        description: 'Array of entities to create',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Unique name for the entity' },
            type: { type: 'string', description: 'Entity category', enum: VALID_TYPES },
            domain: { type: 'string', description: 'Isolation domain', default: 'general' },
            observations: { type: 'array', items: { type: 'string' }, description: 'Initial facts about this entity' },
          },
          required: ['name', 'type'],
        },
      },
    },
    required: ['entities'],
  },
};

export async function handleCreateEntities(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  // Rate limit check
  const rateCheck = checkRateLimit('memory');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const entities = args.entities;
    if (!Array.isArray(entities) || entities.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'entities must be a non-empty array' } }) }] };
    }

    if (entities.length > 50) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'Maximum 50 entities per call' } }) }] };
    }

    const created: EntityRow[] = [];
    const errors: string[] = [];

    for (const e of entities) {
      // Validate name
      const nameCheck = validateString(e.name, 'entityName', 'entity name');
      if (!nameCheck.valid) {
        errors.push(nameCheck.error!);
        continue;
      }

      // Validate type
      if (!VALID_TYPES.includes(e.type)) {
        errors.push(`Invalid type "${e.type}" for entity "${e.name}". Must be one of: ${VALID_TYPES.join(', ')}`);
        continue;
      }

      // Create entity
      const entity = createEntity(nameCheck.value!, e.type, e.domain || 'general');
      if (entity) {
        created.push(entity);

        // Add initial observations if provided
        if (Array.isArray(e.observations)) {
          for (const obs of e.observations) {
            const obsCheck = validateString(obs, 'observation', 'observation');
            if (obsCheck.valid) {
              addObservation(entity.id, obsCheck.value!);
            }
          }
        }
      }
    }

    const result = {
      success: true,
      created: created.map(e => ({ name: e.name, type: e.type, domain: e.domain })),
      createdCount: created.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    logAudit('create_entities', `Created ${created.length} entities`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('create_entities', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
