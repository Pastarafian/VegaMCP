/**
 * VegaMCP — Knowledge Engine
 * 
 * Semantic knowledge base powered by the embedded vector store.
 * Provides semantic search, deduplication, and knowledge management
 * across collections: knowledge, code_snippets, prompt_templates.
 * MCP Tool: knowledge_engine
 */

import { logAudit } from '../../db/graph-store.js';
import {
  addToVectorStore,
  searchVectorStore,
  deleteFromVectorStore,
  getVectorStoreStats,
  clearVectorStore,
  findDuplicates,
  type VectorEntry,
} from '../../db/vector-store.js';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const knowledgeEngineSchema = {
  name: 'knowledge_engine',
  description: 'Semantic knowledge base with vector search. Store and search knowledge, code snippets, and prompt templates using AI-powered similarity matching. Supports automatic deduplication. Collections: knowledge, code_snippets, prompt_templates.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'add', 'similar', 'deduplicate', 'stats', 'delete', 'clear_collection', 'batch_add'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'Search query (for search, similar)' },
      content: { type: 'string', description: 'Content to add (for add)' },
      id: { type: 'string', description: 'Entry ID (for add, delete). Auto-generated if not provided.' },
      collection: {
        type: 'string',
        enum: ['knowledge', 'code_snippets', 'prompt_templates', 'exploratory_tips'],
        description: 'Collection to operate on',
        default: 'knowledge',
      },
      metadata: { type: 'object', description: 'Metadata to attach (for add)', properties: {} },
      limit: { type: 'number', description: 'Max results (for search)', default: 10 },
      threshold: { type: 'number', description: 'Minimum similarity threshold 0.0-1.0 (for search)', default: 0.15 },
      items: {
        type: 'array',
        description: 'Array of items to add (for batch_add). Each item: { id?, content, metadata? }',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            metadata: { type: 'object', properties: {} },
          },
        },
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleKnowledgeEngine(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {
      case 'search': {
        if (!args.query) {
          return result({ success: false, error: 'Provide a query to search for' });
        }

        const entries = searchVectorStore(
          args.query,
          args.collection || undefined,
          args.limit || 10,
          args.threshold || 0.15
        );

        logAudit('knowledge_engine', `search: "${args.query}" → ${entries.length} results`, true, undefined, Date.now() - start);
        return result({
          success: true,
          query: args.query,
          collection: args.collection || 'all',
          results: entries.map(e => ({
            id: e.id,
            collection: e.collection,
            content: e.content.length > 500 ? e.content.slice(0, 500) + '...' : e.content,
            similarity: Math.round((e.similarity || 0) * 1000) / 1000,
            metadata: e.metadata,
          })),
          totalResults: entries.length,
        });
      }

      case 'add': {
        if (!args.content) {
          return result({ success: false, error: 'Provide content to add' });
        }

        const collection = args.collection || 'knowledge';
        const id = args.id || `${collection}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const addResult = await addToVectorStore(id, args.content, collection, args.metadata || {});

        if (addResult.duplicate) {
          logAudit('knowledge_engine', `add: duplicate detected (similar to ${addResult.similarId})`, true, undefined, Date.now() - start);
          return result({
            success: true,
            action: 'skipped_duplicate',
            message: `Content too similar to existing entry: ${addResult.similarId}`,
            existingId: addResult.similarId,
          });
        }

        logAudit('knowledge_engine', `add: ${id} → ${collection}`, true, undefined, Date.now() - start);
        return result({
          success: true,
          action: 'added',
          id: addResult.id,
          collection,
          contentLength: args.content.length,
        });
      }

      case 'batch_add': {
        if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
          return result({ success: false, error: 'Provide items array with { content, id?, metadata? } entries' });
        }

        const collection = args.collection || 'knowledge';
        const results: any[] = [];
        let added = 0;
        let duplicates = 0;

        for (const item of args.items.slice(0, 50)) { // Max 50 items per batch
          if (!item.content) continue;

          const id = item.id || `${collection}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const addRes = await addToVectorStore(id, item.content, collection, item.metadata || {});

          if (addRes.duplicate) {
            duplicates++;
            results.push({ id, status: 'duplicate', similarId: addRes.similarId });
          } else {
            added++;
            results.push({ id: addRes.id, status: 'added' });
          }
        }

        logAudit('knowledge_engine', `batch_add: ${added} added, ${duplicates} duplicates → ${collection}`, true, undefined, Date.now() - start);
        return result({
          success: true,
          action: 'batch_add',
          collection,
          added,
          duplicates,
          total: args.items.length,
          details: results,
        });
      }

      case 'similar': {
        if (!args.query) {
          return result({ success: false, error: 'Provide content to find similar entries for' });
        }

        const entries = searchVectorStore(
          args.query,
          args.collection || undefined,
          args.limit || 5,
          args.threshold || 0.3
        );

        logAudit('knowledge_engine', `similar: found ${entries.length} matches`, true, undefined, Date.now() - start);
        return result({
          success: true,
          query: args.query.slice(0, 100) + (args.query.length > 100 ? '...' : ''),
          similarEntries: entries.map(e => ({
            id: e.id,
            collection: e.collection,
            similarity: Math.round((e.similarity || 0) * 1000) / 1000,
            contentPreview: e.content.slice(0, 200),
            metadata: e.metadata,
          })),
        });
      }

      case 'deduplicate': {
        const collection = args.collection || 'knowledge';
        const threshold = args.threshold || 0.92;
        const dupes = findDuplicates(collection, threshold);

        logAudit('knowledge_engine', `deduplicate: found ${dupes.length} duplicate pairs in ${collection}`, true, undefined, Date.now() - start);
        return result({
          success: true,
          collection,
          threshold,
          duplicatePairs: dupes.slice(0, 20).map(d => ({
            entry1: d.id1,
            entry2: d.id2,
            similarity: Math.round(d.similarity * 1000) / 1000,
          })),
          totalDuplicates: dupes.length,
        });
      }

      case 'stats': {
        const stats = getVectorStoreStats();
        logAudit('knowledge_engine', 'stats', true, undefined, Date.now() - start);
        return result({
          success: true,
          ...stats,
        });
      }

      case 'delete': {
        if (!args.id) {
          return result({ success: false, error: 'Provide entry id to delete' });
        }
        const deleted = deleteFromVectorStore(args.id);
        logAudit('knowledge_engine', `delete: ${args.id} → ${deleted}`, deleted, undefined, Date.now() - start);
        return result({ success: deleted, id: args.id, deleted });
      }

      case 'clear_collection': {
        const collection = args.collection;
        if (!collection) {
          return result({ success: false, error: 'Provide collection name to clear' });
        }
        const count = clearVectorStore(collection);
        logAudit('knowledge_engine', `clear: ${collection} → ${count} entries removed`, true, undefined, Date.now() - start);
        return result({ success: true, collection, entriesRemoved: count });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}. Use: search, add, batch_add, similar, deduplicate, stats, delete, clear_collection` });
    }
  } catch (err: any) {
    logAudit('knowledge_engine', err.message, false, 'ERROR', Date.now() - start);
    return result({ success: false, error: err.message });
  }
}

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
