/**
 * VegaMCP — Semantic Memory Engine
 * 
 * Vector-based memory system using Ollama embeddings for intelligent recall.
 * Stores memories with embeddings and retrieves them using cosine similarity
 * instead of keyword matching. Supports tagging, time-weighted recall,
 * and automatic context building.
 * MCP Tool: semantic_memory
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

const MEMORY_DIR = path.join(os.homedir(), '.claw-memory', 'semantic');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memories.json');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const semanticMemorySchema = {
  name: 'semantic_memory',
  description: 'Intelligent memory system with vector embeddings for semantic search. Stores and recalls information using meaning-based similarity instead of exact keywords. Uses Ollama embeddings locally (no cloud). Falls back to TF-IDF if Ollama unavailable.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['store', 'recall', 'search', 'list', 'tag', 'forget', 'context_build', 'stats'],
        description: 'Action: store (save memory), recall (semantic search), search (keyword fallback), list, tag, forget (archive), context_build (build relevant context for a task), stats',
      },
      content: { type: 'string', description: 'Memory content to store or query to recall' },
      key: { type: 'string', description: 'Optional key/name for the memory' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization (e.g. ["project:vega", "type:decision"])',
      },
      filter_tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only return memories matching these tags',
      },
      limit: { type: 'number', description: 'Max results to return (default: 10)' },
      min_similarity: { type: 'number', description: 'Minimum similarity score 0.0-1.0 (default: 0.3)' },
      time_weight: { type: 'boolean', description: 'Weight recent memories higher (default: true)' },
      task_description: { type: 'string', description: 'For context_build: describe the task to build context for' },
      project: { type: 'string', description: 'Project scope for filtering' },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// MEMORY STORE
// ═══════════════════════════════════════════════

interface Memory {
  id: string;
  key: string;
  content: string;
  embedding: number[] | null;
  tags: string[];
  project: string | null;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  archived: boolean;
}

function ensureDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function loadMemories(): Memory[] {
  ensureDir();
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch { return []; }
}

function saveMemories(memories: Memory[]): void {
  ensureDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
}

// ═══════════════════════════════════════════════
// EMBEDDING ENGINE
// ═══════════════════════════════════════════════

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 2000) }),
    });
    if (!response.ok) return null;
    const data: any = await response.json();
    return data.embedding || null;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// TF-IDF fallback when embeddings aren't available
function tfidfSimilarity(query: string, content: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const contentWords = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const contentSet = new Set(contentWords);
  
  let overlap = 0;
  for (const word of queryWords) {
    if (contentSet.has(word)) overlap++;
  }
  
  // Normalize by query size and content length
  const queryScore = queryWords.size > 0 ? overlap / queryWords.size : 0;
  const density = contentWords.length > 0 ? overlap / Math.sqrt(contentWords.length) : 0;
  
  return (queryScore * 0.7 + Math.min(density, 1.0) * 0.3);
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleSemanticMemory(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  
  try {
    switch (args.action) {
      case 'store': {
        if (!args.content) return res({ success: false, error: 'Provide content to store' });
        
        const memories = loadMemories();
        const embedding = await getEmbedding(args.content);
        
        const memory: Memory = {
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          key: args.key || args.content.slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, '').trim(),
          content: args.content,
          embedding,
          tags: args.tags || [],
          project: args.project || null,
          timestamp: Date.now(),
          accessCount: 0,
          lastAccessed: Date.now(),
          archived: false,
        };
        
        memories.push(memory);
        saveMemories(memories);
        
        return res({
          success: true,
          id: memory.id,
          key: memory.key,
          hasEmbedding: !!embedding,
          embeddingDimensions: embedding?.length || 0,
          tags: memory.tags,
          totalMemories: memories.filter(m => !m.archived).length,
          durationMs: Date.now() - start,
        });
      }
      
      case 'recall':
      case 'search': {
        if (!args.content) return res({ success: false, error: 'Provide query to recall' });
        
        const memories = loadMemories();
        const active = memories.filter(m => !m.archived);
        
        if (active.length === 0) return res({ success: true, results: [], message: 'No memories stored yet' });
        
        const queryEmbedding = args.action === 'recall' ? await getEmbedding(args.content) : null;
        const limit = args.limit || 10;
        const minSim = args.min_similarity || 0.3;
        const useTimeWeight = args.time_weight !== false;
        
        // Score all memories
        const scored = active.map(mem => {
          let similarity: number;
          
          if (queryEmbedding && mem.embedding) {
            // Vector similarity (primary)
            similarity = cosineSimilarity(queryEmbedding, mem.embedding);
          } else {
            // TF-IDF fallback
            similarity = tfidfSimilarity(args.content, mem.content);
          }
          
          // Time weighting: recent memories get a boost
          if (useTimeWeight) {
            const ageHours = (Date.now() - mem.timestamp) / (1000 * 60 * 60);
            const timeFactor = Math.exp(-ageHours / (24 * 30)); // Decay over ~30 days
            similarity = similarity * 0.85 + timeFactor * 0.15;
          }
          
          // Access frequency boost (frequently accessed = likely important)
          const accessBoost = Math.min(0.05, mem.accessCount * 0.005);
          similarity += accessBoost;
          
          return { memory: mem, similarity: Math.min(1.0, similarity) };
        });
        
        // Filter by tags if specified
        let filtered = scored;
        if (args.filter_tags && args.filter_tags.length > 0) {
          filtered = scored.filter(s => 
            args.filter_tags.some((tag: string) => s.memory.tags.includes(tag))
          );
        }
        if (args.project) {
          filtered = filtered.filter(s => s.memory.project === args.project);
        }
        
        // Sort by similarity, filter by threshold, limit
        const results = filtered
          .filter(s => s.similarity >= minSim)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);
        
        // Update access counts
        for (const r of results) {
          const idx = memories.findIndex(m => m.id === r.memory.id);
          if (idx >= 0) {
            memories[idx].accessCount++;
            memories[idx].lastAccessed = Date.now();
          }
        }
        saveMemories(memories);
        
        return res({
          success: true,
          query: args.content,
          method: queryEmbedding ? 'vector_similarity' : 'tfidf_fallback',
          results: results.map(r => ({
            id: r.memory.id,
            key: r.memory.key,
            content: r.memory.content,
            similarity: Math.round(r.similarity * 1000) / 1000,
            tags: r.memory.tags,
            project: r.memory.project,
            age: formatAge(r.memory.timestamp),
            accessCount: r.memory.accessCount,
          })),
          totalSearched: filtered.length,
          durationMs: Date.now() - start,
        });
      }
      
      case 'list': {
        const memories = loadMemories();
        const active = memories.filter(m => !m.archived);
        let filtered = active;
        
        if (args.filter_tags && args.filter_tags.length > 0) {
          filtered = active.filter(m => args.filter_tags.some((t: string) => m.tags.includes(t)));
        }
        if (args.project) {
          filtered = filtered.filter(m => m.project === args.project);
        }
        
        const limit = args.limit || 50;
        const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
        
        return res({
          success: true,
          total: active.length,
          showing: sorted.length,
          memories: sorted.map(m => ({
            id: m.id,
            key: m.key,
            preview: m.content.slice(0, 100) + (m.content.length > 100 ? '...' : ''),
            tags: m.tags,
            project: m.project,
            age: formatAge(m.timestamp),
            accessCount: m.accessCount,
            hasEmbedding: !!m.embedding,
          })),
        });
      }
      
      case 'tag': {
        if (!args.key && !args.content) return res({ success: false, error: 'Provide key or content to identify memory' });
        if (!args.tags) return res({ success: false, error: 'Provide tags to add' });
        
        const memories = loadMemories();
        const target = memories.find(m => 
          !m.archived && (m.id === args.key || m.key === args.key || m.content.includes(args.content || ''))
        );
        
        if (!target) return res({ success: false, error: 'Memory not found' });
        
        const newTags = Array.from(new Set([...target.tags, ...args.tags]));
        target.tags = newTags;
        if (args.project) target.project = args.project;
        saveMemories(memories);
        
        return res({ success: true, id: target.id, tags: newTags, project: target.project });
      }
      
      case 'forget': {
        if (!args.key && !args.content) return res({ success: false, error: 'Provide key or id to archive' });
        
        const memories = loadMemories();
        const target = memories.find(m => m.id === args.key || m.key === args.key);
        
        if (!target) return res({ success: false, error: 'Memory not found' });
        
        target.archived = true;
        saveMemories(memories);
        
        return res({ success: true, archived: target.id, key: target.key, message: 'Memory archived (not deleted)' });
      }
      
      case 'context_build': {
        if (!args.task_description) return res({ success: false, error: 'Provide task_description to build context for' });
        
        const memories = loadMemories();
        const active = memories.filter(m => !m.archived);
        
        if (active.length === 0) return res({ success: true, context: '', message: 'No memories to build context from' });
        
        const queryEmbedding = await getEmbedding(args.task_description);
        
        // Score all memories for relevance to the task
        const scored = active.map(mem => {
          let similarity: number;
          if (queryEmbedding && mem.embedding) {
            similarity = cosineSimilarity(queryEmbedding, mem.embedding);
          } else {
            similarity = tfidfSimilarity(args.task_description, mem.content);
          }
          return { memory: mem, similarity };
        });
        
        // Apply project filter if specified
        let filtered = scored;
        if (args.project) {
          filtered = scored.filter(s => s.memory.project === args.project);
        }
        
        // Get top relevant memories
        const topMemories = filtered
          .filter(s => s.similarity >= 0.25)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, args.limit || 15);
        
        // Build context string
        const contextParts = topMemories.map((r, i) => 
          `[Memory ${i + 1} — ${r.memory.key} (${Math.round(r.similarity * 100)}% match)]:\n${r.memory.content}`
        );
        
        const context = contextParts.join('\n\n---\n\n');
        
        return res({
          success: true,
          task: args.task_description,
          memoriesUsed: topMemories.length,
          totalAvailable: active.length,
          context,
          contextLength: context.length,
          method: queryEmbedding ? 'vector' : 'tfidf',
          topMatches: topMemories.slice(0, 5).map(r => ({
            key: r.memory.key,
            similarity: Math.round(r.similarity * 100),
            tags: r.memory.tags,
          })),
          durationMs: Date.now() - start,
        });
      }
      
      case 'stats': {
        const memories = loadMemories();
        const active = memories.filter(m => !m.archived);
        const archived = memories.filter(m => m.archived);
        const withEmbeddings = active.filter(m => m.embedding);
        
        // Tag distribution
        const tagCounts: { [key: string]: number } = {};
        for (const m of active) {
          for (const tag of m.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        
        // Project distribution
        const projectCounts: { [key: string]: number } = {};
        for (const m of active) {
          const p = m.project || '(untagged)';
          projectCounts[p] = (projectCounts[p] || 0) + 1;
        }
        
        const totalAccesses = active.reduce((sum, m) => sum + m.accessCount, 0);
        const avgAge = active.length > 0
          ? (Date.now() - active.reduce((sum, m) => sum + m.timestamp, 0) / active.length) / (1000 * 60 * 60 * 24)
          : 0;
        
        return res({
          success: true,
          active: active.length,
          archived: archived.length,
          withEmbeddings: withEmbeddings.length,
          embeddingCoverage: active.length > 0 ? `${Math.round(withEmbeddings.length / active.length * 100)}%` : '0%',
          embeddingModel: EMBED_MODEL,
          totalAccesses,
          averageAgeDays: Math.round(avgAge * 10) / 10,
          topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
          projects: projectCounts,
          storageFile: MEMORY_FILE,
          storageSizeKB: fs.existsSync(MEMORY_FILE)
            ? Math.round(fs.statSync(MEMORY_FILE).size / 1024)
            : 0,
        });
      }
      
      default:
        return res({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return res({ success: false, error: err.message });
  }
}

function formatAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
