/**
 * VegaMCP — Add Observations Tool
 */

import { getEntityByName, addObservation, logAudit } from '../../db/graph-store.js';
import { validateString } from '../../security/input-validator.js';
import { checkRateLimit } from '../../security/rate-limiter.js';

export const addObservationsSchema = {
  name: 'add_observations',
  description: 'Add new observations (facts) to an existing entity. Observations are append-only — they never overwrite previous facts, creating a changelog of knowledge over time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      entity: { type: 'string', description: 'Name of the entity to add observations to' },
      observations: { type: 'array', items: { type: 'string' }, description: 'Array of fact strings to append' },
    },
    required: ['entity', 'observations'],
  },
};

export async function handleAddObservations(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  const rateCheck = checkRateLimit('memory');
  if (!rateCheck.allowed) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: rateCheck.message } }) }] };
  }

  try {
    const nameCheck = validateString(args.entity, 'entityName', 'entity');
    if (!nameCheck.valid) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: nameCheck.error } }) }] };
    }

    const entity = getEntityByName(nameCheck.value!);
    if (!entity) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'ENTITY_NOT_FOUND', message: `Entity "${nameCheck.value}" not found. Create it first with create_entities.` } }) }] };
    }

    const observations = args.observations;
    if (!Array.isArray(observations) || observations.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INVALID_INPUT', message: 'observations must be a non-empty array of strings' } }) }] };
    }

    const added: string[] = [];
    const errors: string[] = [];

    for (const obs of observations) {
      const obsCheck = validateString(obs, 'observation', 'observation');
      if (obsCheck.valid) {
        addObservation(entity.id, obsCheck.value!);
        added.push(obsCheck.value!);
      } else {
        errors.push(obsCheck.error!);
      }
    }

    const result = {
      success: true,
      entity: entity.name,
      addedCount: added.length,
      added,
      errors: errors.length > 0 ? errors : undefined,
    };

    logAudit('add_observations', `Added ${added.length} observations to "${entity.name}"`, true, undefined, Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    logAudit('add_observations', err.message, false, 'INTERNAL_ERROR', Date.now() - start);
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }) }] };
  }
}
