/**
 * VegaMCP — Memory Resources
 * Exposes the knowledge graph as browsable MCP resources.
 */

import { getAllEntities, getAllRelations } from '../db/graph-store.js';

export const memoryResources = [
  {
    uri: 'memory://entities',
    name: 'All Memory Entities',
    description: 'Browse all entities in the persistent knowledge graph with observation counts.',
    mimeType: 'application/json',
  },
  {
    uri: 'memory://entities/project-arch',
    name: 'Project Architecture Entities',
    description: 'Entities in the project-arch domain.',
    mimeType: 'application/json',
  },
  {
    uri: 'memory://entities/coding-style',
    name: 'Coding Style Entities',
    description: 'Entities in the coding-style domain.',
    mimeType: 'application/json',
  },
  {
    uri: 'memory://entities/bug-history',
    name: 'Bug History Entities',
    description: 'Entities in the bug-history domain.',
    mimeType: 'application/json',
  },
  {
    uri: 'memory://entities/general',
    name: 'General Entities',
    description: 'Entities in the general domain.',
    mimeType: 'application/json',
  },
  {
    uri: 'memory://relations',
    name: 'All Memory Relations',
    description: 'Browse all relationships between entities in the knowledge graph.',
    mimeType: 'application/json',
  },
];

export function readMemoryResource(uri: string): string {
  if (uri === 'memory://entities') {
    const entities = getAllEntities();
    return JSON.stringify({ entityCount: entities.length, entities }, null, 2);
  }

  if (uri.startsWith('memory://entities/')) {
    const domain = uri.replace('memory://entities/', '');
    const entities = getAllEntities(domain);
    return JSON.stringify({ domain, entityCount: entities.length, entities }, null, 2);
  }

  if (uri === 'memory://relations') {
    const relations = getAllRelations();
    return JSON.stringify({ relationCount: relations.length, relations }, null, 2);
  }

  return JSON.stringify({ error: `Unknown resource URI: ${uri}` });
}
