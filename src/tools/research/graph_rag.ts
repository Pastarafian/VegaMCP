/**
 * VegaMCP — GraphRAG Hybrid Retrieval Engine
 * 
 * Combines the graph knowledge base (entities, relations, observations)
 * with the vector store (TF-IDF similarity) to build rich retrieval context.
 * 
 * Three retrieval strategies:
 * 1. VECTOR — Pure similarity search (fast, broad)
 * 2. GRAPH — Structured entity traversal (precise, relational)
 * 3. HYBRID — Both combined, de-duplicated, re-ranked (best quality)
 * 
 * Output is structured context ready to feed into an LLM prompt.
 */

import { getDb } from '../../db/graph-store.js';
import { searchVectorStore, getVectorStoreStats } from '../../db/vector-store.js';

// ═══════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════

export const graphRagSchema = {
  name: 'graph_rag',
  description: `GraphRAG — Hybrid retrieval combining knowledge graph traversal with vector similarity search. Builds rich retrieval context for LLM queries by fusing structured entity-relation data with semantic similarity results. Strategies: vector (fast), graph (precise), hybrid (best). Returns formatted context blocks with provenance.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'The retrieval query' },
      strategy: {
        type: 'string',
        enum: ['vector', 'graph', 'hybrid'],
        description: 'Retrieval strategy (default: hybrid)',
      },
      max_results: { type: 'number', description: 'Max results per source (default: 10)' },
      depth: { type: 'number', description: 'Graph traversal depth for entity relations (default: 2)' },
      collections: {
        type: 'array',
        items: { type: 'string' },
        description: 'Vector collections to search (default: all)',
      },
      format: {
        type: 'string',
        enum: ['context', 'json', 'markdown'],
        description: 'Output format (default: context)',
      },
    },
    required: ['query'],
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleGraphRag(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    query,
    strategy = 'hybrid',
    max_results = 10,
    depth = 2,
    collections,
    format = 'context',
  } = args;

  if (!query) return out({ error: 'query is required' });

  try {
    const results: RetrievalResult[] = [];

    // Vector retrieval
    if (strategy === 'vector' || strategy === 'hybrid') {
      const vectorResults = retrieveFromVector(query, max_results, collections);
      results.push(...vectorResults);
    }

    // Graph retrieval
    if (strategy === 'graph' || strategy === 'hybrid') {
      const graphResults = retrieveFromGraph(query, max_results, depth);
      results.push(...graphResults);
    }

    // De-duplicate and re-rank
    const deduplicated = deduplicateResults(results);
    const ranked = rankResults(deduplicated, query);
    const top = ranked.slice(0, max_results);

    // Format output
    const formatted = formatOutput(top, format, query);

    return out({
      query,
      strategy,
      totalRetrioved: top.length,
      sources: {
        vector: results.filter(r => r.source === 'vector').length,
        graph: results.filter(r => r.source === 'graph').length,
      },
      context: formatted,
    });
  } catch (err: any) {
    return out({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// RETRIEVAL ENGINES
// ═══════════════════════════════════════════════

interface RetrievalResult {
  content: string;
  source: 'vector' | 'graph';
  relevance: number;
  metadata: Record<string, any>;
  id: string;
}

function retrieveFromVector(
  query: string,
  limit: number,
  collections?: string[]
): RetrievalResult[] {
  const results: RetrievalResult[] = [];

  // Search specified collections or default ones
  const targetCollections = collections || ['knowledge', 'code_snippets'];
  for (const collection of targetCollections) {
    try {
      const vectorResults = searchVectorStore(query, collection, Math.ceil(limit / targetCollections.length));
      for (const entry of vectorResults) {
        results.push({
          content: entry.content,
          source: 'vector',
          relevance: entry.similarity || 0.5,
          metadata: { collection, ...entry.metadata },
          id: entry.id,
        });
      }
    } catch { /* collection might not exist */ }
  }

  return results;
}

function retrieveFromGraph(
  query: string,
  limit: number,
  depth: number
): RetrievalResult[] {
  const db = getDb();
  const results: RetrievalResult[] = [];
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  try {
    // 1. Find matching entities
    const entities = db.exec(
      `SELECT name, entity_type FROM entities WHERE ` +
      queryWords.map(() => `LOWER(name) LIKE ?`).join(' OR ') +
      ` LIMIT ?`,
      [...queryWords.map(w => `%${w}%`), limit]
    );

    if (entities.length > 0) {
      const matchedNames: string[] = [];
      for (const row of entities[0].values) {
        const name = row[0] as string;
        const type = row[1] as string;
        matchedNames.push(name);

        // Get observations for this entity
        try {
          const obs = db.exec(
            `SELECT content FROM observations WHERE entity_name = ? LIMIT 5`,
            [name]
          );
          if (obs.length > 0) {
            const obsText = obs[0].values.map(r => r[0]).join(' | ');
            results.push({
              content: `[${type}] ${name}: ${obsText}`,
              source: 'graph',
              relevance: 0.8,
              metadata: { entityName: name, entityType: type, depth: 0 },
              id: `graph:entity:${name}`,
            });
          }
        } catch { /* ignore */ }
      }

      // 2. Traverse relations (up to specified depth)
      if (depth > 0 && matchedNames.length > 0) {
        const visited = new Set(matchedNames);
        let frontier = [...matchedNames];

        for (let d = 1; d <= depth && frontier.length > 0; d++) {
          const nextFrontier: string[] = [];
          for (const entityName of frontier) {
            try {
              const relations = db.exec(
                `SELECT from_entity, to_entity, relation_type FROM relations WHERE from_entity = ? OR to_entity = ? LIMIT 10`,
                [entityName, entityName]
              );
              if (relations.length > 0) {
                for (const rel of relations[0].values) {
                  const from = rel[0] as string;
                  const to = rel[1] as string;
                  const relType = rel[2] as string;
                  const connected = from === entityName ? to : from;

                  if (!visited.has(connected)) {
                    visited.add(connected);
                    nextFrontier.push(connected);

                    results.push({
                      content: `${from} --[${relType}]--> ${to}`,
                      source: 'graph',
                      relevance: 0.7 / d, // decay with depth
                      metadata: { relationType: relType, depth: d },
                      id: `graph:rel:${from}:${relType}:${to}`,
                    });
                  }
                }
              }
            } catch { /* ignore */ }
          }
          frontier = nextFrontier;
        }
      }
    }

    // 3. Search observations directly
    if (results.length < limit) {
      const obsSearch = db.exec(
        `SELECT o.entity_name, o.content, e.entity_type FROM observations o LEFT JOIN entities e ON o.entity_name = e.name WHERE ` +
        queryWords.map(() => `LOWER(o.content) LIKE ?`).join(' OR ') +
        ` LIMIT ?`,
        [...queryWords.map(w => `%${w}%`), limit - results.length]
      );
      if (obsSearch.length > 0) {
        for (const row of obsSearch[0].values) {
          const eid = `graph:obs:${row[0]}`;
          if (!results.find(r => r.id === eid)) {
            results.push({
              content: `[${row[2] || 'entity'}] ${row[0]}: ${row[1]}`,
              source: 'graph',
              relevance: 0.6,
              metadata: { entityName: row[0] as string, entityType: row[2] as string },
              id: eid,
            });
          }
        }
      }
    }
  } catch { /* graph tables might not exist */ }

  return results;
}

// ═══════════════════════════════════════════════
// RANKING & DEDUP
// ═══════════════════════════════════════════════

function deduplicateResults(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Map<string, RetrievalResult>();
  for (const r of results) {
    const key = r.content.slice(0, 100).toLowerCase();
    const existing = seen.get(key);
    if (!existing || r.relevance > existing.relevance) {
      seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

function rankResults(results: RetrievalResult[], query: string): RetrievalResult[] {
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  return results
    .map(r => {
      const contentLower = r.content.toLowerCase();
      let bonus = 0;
      // Exact match bonus
      if (contentLower.includes(query.toLowerCase())) bonus += 0.3;
      // Word match bonus
      for (const word of queryWords) {
        if (contentLower.includes(word)) bonus += 0.1;
      }
      // Source diversity bonus (graph gets boost in hybrid)
      if (r.source === 'graph') bonus += 0.05;
      return { ...r, relevance: Math.min(r.relevance + bonus, 1.0) };
    })
    .sort((a, b) => b.relevance - a.relevance);
}

function formatOutput(results: RetrievalResult[], format: string, query: string): string {
  if (results.length === 0) return 'No relevant context found.';

  switch (format) {
    case 'json':
      return JSON.stringify(results, null, 2);

    case 'markdown':
      return results
        .map((r, i) => `### ${i + 1}. [${r.source}] (${Math.round(r.relevance * 100)}% relevant)\n${r.content}`)
        .join('\n\n');

    case 'context':
    default:
      return [
        `--- RETRIEVAL CONTEXT for: "${query}" ---`,
        '',
        ...results.map((r, i) =>
          `[${i + 1}/${results.length}] (${r.source}, ${Math.round(r.relevance * 100)}%) ${r.content}`
        ),
        '',
        `--- END CONTEXT (${results.length} results) ---`,
      ].join('\n');
  }
}

function out(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
