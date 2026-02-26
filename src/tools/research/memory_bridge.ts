/**
 * VegaMCP — Memory Bridge Tool
 * 
 * MCP tool interface to the Vector-Graph Bridge (Memory-Augmented Graph).
 * Provides cross-modal memory operations: learn, recall, consolidate, stats.
 */

import {
  learn,
  recall,
  recallFailures,
  recallConstraints,
  consolidateMemory,
  getBridgeStats,
  type LearnInput,
} from '../../db/vector-graph-bridge.js';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const memoryBridgeSchema = {
  name: 'memory_bridge',
  description: `Cross-Modal Memory Bridge — unifies Vector Store (semantic) and Graph Store (structural) into a single intelligent memory system. Learn new knowledge (dual-writes to both stores), recall with merged results, query past failures, access learned constraints, consolidate memories. This is the foundation of the "Memory-Augmented Graph" architecture.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['learn', 'recall', 'recall_failures', 'recall_constraints', 'consolidate', 'stats'],
        description: 'Action to perform',
      },
      content: {
        type: 'string',
        description: 'Content to learn (for learn action)',
      },
      entity_name: {
        type: 'string',
        description: 'Entity name for graph storage (for learn action)',
      },
      entity_type: {
        type: 'string',
        enum: ['concept', 'hypothesis', 'fact', 'constraint', 'method', 'tool', 'pattern', 'failure'],
        description: 'Type of knowledge entity',
      },
      domain: {
        type: 'string',
        description: 'Knowledge domain (e.g., research, engineering, science)',
      },
      source: {
        type: 'string',
        description: 'Source of knowledge (e.g., user, agent:visionary, arxiv, wolfram)',
      },
      confidence: {
        type: 'number',
        description: 'Initial confidence score 0.0-1.0 (default: 0.5)',
      },
      query: {
        type: 'string',
        description: 'Search query (for recall actions)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 20)',
      },
      related_to: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entity_name: { type: 'string' },
            relation_type: { type: 'string' },
            strength: { type: 'number' },
          },
        },
        description: 'Related entities to link (for learn action)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization',
      },
      is_constraint: {
        type: 'boolean',
        description: 'Whether this is a learned guardrail/constraint',
      },
      is_failure: {
        type: 'boolean',
        description: 'Whether this is a past failure record',
      },
      min_confidence: {
        type: 'number',
        description: 'Minimum confidence threshold for results (default: 0.0)',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleMemoryBridge(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;

  try {
    switch (action) {
      case 'learn':
        return await handleLearn(args);
      case 'recall':
        return handleRecall(args);
      case 'recall_failures':
        return handleRecallFailures(args);
      case 'recall_constraints':
        return handleRecallConstraints(args);
      case 'consolidate':
        return handleConsolidate();
      case 'stats':
        return handleStats();
      default:
        return result({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return result({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════

async function handleLearn(args: any) {
  const { content, entity_name, entity_type, domain, source, confidence, 
          related_to, tags, is_constraint, is_failure } = args;
  
  if (!content) return result({ error: 'content is required for learning' });
  if (!entity_name) return result({ error: 'entity_name is required for learning' });

  const input: LearnInput = {
    content,
    entityName: entity_name,
    entityType: entity_type || 'concept',
    domain: domain || 'general',
    source: source || 'user',
    confidence: confidence || 0.5,
    relatedTo: related_to?.map((r: any) => ({
      entityName: r.entity_name,
      relationType: r.relation_type || 'related_to',
      strength: r.strength || 1.0,
    })),
    tags: tags || [],
    isConstraint: is_constraint || false,
    isFailure: is_failure || false,
  };

  const memory = await learn(input);
  return result({
    status: 'learned',
    id: memory.id,
    source: memory.source,
    confidence: memory.confidenceScore,
    graphEntity: memory.graphEntity ? {
      name: memory.graphEntity.name,
      type: memory.graphEntity.type,
      domain: memory.graphEntity.domain,
      observations: memory.graphEntity.observations.length,
      relations: memory.graphEntity.relations.length,
    } : null,
    metadata: memory.metadata,
  });
}

function handleRecall(args: any) {
  const { query, domain, entity_type, limit, min_confidence } = args;
  if (!query) return result({ error: 'query is required for recall' });

  const results = recall(query, {
    domain,
    entityType: entity_type,
    limit: limit || 20,
    minConfidence: min_confidence || 0.0,
  });

  return result({
    query,
    queryTime: results.queryTime,
    vectorHits: results.vectorHits,
    graphHits: results.graphHits,
    crossLinks: results.crossLinks,
    memories: results.memories.map(m => ({
      id: m.id,
      content: m.content.slice(0, 500),
      source: m.source,
      relevance: Math.round(m.relevanceScore * 100) / 100,
      confidence: Math.round(m.confidenceScore * 100) / 100,
      relations: m.relations.slice(0, 5),
      accessCount: m.accessCount,
    })),
  });
}

function handleRecallFailures(args: any) {
  const { query, limit } = args;
  if (!query) return result({ error: 'query is required' });

  const failures = recallFailures(query, limit || 10);
  return result({
    query,
    count: failures.length,
    failures: failures.map(f => ({
      id: f.id,
      content: f.content.slice(0, 500),
      confidence: f.confidenceScore,
    })),
  });
}

function handleRecallConstraints(args: any) {
  const { query, limit } = args;
  if (!query) return result({ error: 'query is required' });

  const constraints = recallConstraints(query, limit || 10);
  return result({
    query,
    count: constraints.length,
    constraints: constraints.map(c => ({
      id: c.id,
      content: c.content.slice(0, 500),
      confidence: c.confidenceScore,
    })),
  });
}

function handleConsolidate() {
  const report = consolidateMemory();
  return result({
    status: 'consolidation_complete',
    report,
  });
}

function handleStats() {
  const stats = getBridgeStats();
  return result(stats);
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}
