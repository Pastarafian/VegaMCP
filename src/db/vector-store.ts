/**
 * VegaMCP — Embedded Vector Store (v2.0)
 * 
 * Enhanced vector database with:
 * - In-memory vector cache for fast search (no SQLite on every query)
 * - LRU embedding cache to reduce API calls
 * - DeepSeek embeddings support
 * - Batch embedding API for faster ingestion
 * - Hybrid search: dense vectors + BM25 keyword scoring with RRF
 * - Metadata filtering in search
 * - Result highlighting
 * 
 * Backwards-compatible: all existing exports unchanged.
 */

import { getDb, saveDatabase } from './graph-store.js';

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

const VECTOR_DIM = 384;           // Fixed vector dimensions (hash-based)
const NGRAM_SIZE = 3;              // Character n-gram size
const MAX_RESULTS = 20;            // Default max search results
const SIMILARITY_THRESHOLD = 0.15; // Minimum cosine similarity to return
const EMBEDDING_CACHE_MAX = 2000;  // Max entries in embedding cache
const BM25_K1 = 1.5;              // BM25 term frequency saturation
const BM25_B = 0.75;              // BM25 length normalization
const RRF_K = 60;                  // Reciprocal Rank Fusion constant

// English stopwords for filtering
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'and', 'but', 'or', 'if', 'while', 'about',
  'up', 'out', 'off', 'over', 'it', 'its', 'this', 'that', 'these',
  'those', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my', 'your',
  'his', 'her', 'our', 'their', 'what', 'which', 'who', 'whom',
]);

// ═══════════════════════════════════════════════
// IN-MEMORY VECTOR CACHE
// ═══════════════════════════════════════════════

interface CachedEntry {
  id: string;
  collection: string;
  content: string;
  vector: number[];
  metadata: Record<string, any>;
  created_at: string;
  // Pre-computed for BM25
  tokens: string[];
  tokenCount: number;
}

// The cache — all vectors live here after first load
const vectorCache: Map<string, CachedEntry> = new Map();
let cacheLoaded = false;

// Average document length for BM25 (updated on cache load)
let avgDocLength = 0;

/**
 * Load all vectors from SQLite into memory cache.
 * Called once at startup, then cache is maintained incrementally.
 */
function loadVectorCache(): void {
  if (cacheLoaded) return;
  const db = getDb();
  const result = db.exec(`SELECT id, collection, content, vector, metadata, created_at FROM vector_store`);
  if (result.length > 0) {
    let totalTokens = 0;
    for (const row of result[0].values) {
      const content = row[2] as string;
      const tokens = tokenize(content);
      const entry: CachedEntry = {
        id: row[0] as string,
        collection: row[1] as string,
        content,
        vector: JSON.parse(row[3] as string),
        metadata: JSON.parse((row[4] as string) || '{}'),
        created_at: row[5] as string,
        tokens,
        tokenCount: tokens.length,
      };
      vectorCache.set(entry.id, entry);
      totalTokens += tokens.length;
    }
    avgDocLength = vectorCache.size > 0 ? totalTokens / vectorCache.size : 0;
  }
  cacheLoaded = true;
}

// ═══════════════════════════════════════════════
// EMBEDDING CACHE (LRU)
// ═══════════════════════════════════════════════

const embeddingCache: Map<string, number[]> = new Map();

function getCachedEmbedding(text: string): number[] | undefined {
  const key = text.slice(0, 300).toLowerCase().trim();
  const cached = embeddingCache.get(key);
  if (cached) {
    // Move to end (most recently used)
    embeddingCache.delete(key);
    embeddingCache.set(key, cached);
  }
  return cached;
}

function setCachedEmbedding(text: string, embedding: number[]): void {
  const key = text.slice(0, 300).toLowerCase().trim();
  // Evict oldest if at capacity
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest !== undefined) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, embedding);
}

// ═══════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════

let initialized = false;

export function initVectorStore(): void {
  if (initialized) return;
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS vector_store (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL DEFAULT 'knowledge',
      content TEXT NOT NULL,
      vector TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_vector_collection ON vector_store(collection);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_vector_created ON vector_store(created_at);`);
  saveDatabase();
  initialized = true;

  // Load all vectors into memory cache
  loadVectorCache();
}

// ═══════════════════════════════════════════════
// TOKENIZATION & VECTORIZATION
// ═══════════════════════════════════════════════

/**
 * Tokenize text into cleaned words.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Generate character n-grams from text.
 */
function charNgrams(text: string, n: number = NGRAM_SIZE): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ngrams: string[] = [];
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.push(cleaned.substring(i, i + n));
  }
  return ngrams;
}

/**
 * Hash a string to a fixed index using FNV-1a hash.
 */
function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/**
 * Create a fixed-size vector from text using character n-gram hashing.
 * This is a locality-sensitive hashing approach — similar texts produce similar vectors.
 */
export function textToVector(text: string): number[] {
  const vector = new Float64Array(VECTOR_DIM);
  
  // Word-level features
  const words = tokenize(text);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const idx = fnv1aHash(word) % VECTOR_DIM;
    vector[idx] += 1.0;
    
    // Also hash word bigrams for context
    if (i > 0) {
      const bigramIdx = fnv1aHash(`${words[i - 1]}_${word}`) % VECTOR_DIM;
      vector[bigramIdx] += 0.5;
    }
  }

  // Character n-gram features (captures subword patterns)
  const ngrams = charNgrams(text);
  for (const ng of ngrams) {
    const idx = fnv1aHash(ng) % VECTOR_DIM;
    vector[idx] += 0.3;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < VECTOR_DIM; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ═══════════════════════════════════════════════
// BM25 KEYWORD SCORING
// ═══════════════════════════════════════════════

/**
 * Compute BM25 score for a document against a query.
 * Uses pre-tokenized content from cache for speed.
 */
function bm25Score(queryTokens: string[], docTokens: string[], docLength: number): number {
  if (docTokens.length === 0 || queryTokens.length === 0) return 0;

  // Build document term frequency map
  const tf: Map<string, number> = new Map();
  for (const token of docTokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Calculate IDF approximation using collection size
  const N = vectorCache.size || 1;
  let score = 0;

  for (const qterm of queryTokens) {
    const termFreq = tf.get(qterm) || 0;
    if (termFreq === 0) continue;

    // Count documents containing this term (approximate with sampling for speed)
    let df = 0;
    for (const [, entry] of vectorCache) {
      if (entry.tokens.includes(qterm)) df++;
      if (df > N / 2) break; // Early exit optimization
    }
    df = Math.max(df, 1);

    // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    // TF component with saturation
    const tfNorm = (termFreq * (BM25_K1 + 1)) /
      (termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / (avgDocLength || 1))));

    score += idf * tfNorm;
  }

  return score;
}

/**
 * Reciprocal Rank Fusion — merge two ranked lists into one.
 */
function reciprocalRankFusion(
  vectorResults: Array<{ id: string; score: number }>,
  bm25Results: Array<{ id: string; score: number }>,
  limit: number
): string[] {
  const scores: Map<string, number> = new Map();

  for (let i = 0; i < vectorResults.length; i++) {
    const id = vectorResults[i].id;
    scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + i + 1));
  }

  for (let i = 0; i < bm25Results.length; i++) {
    const id = bm25Results[i].id;
    scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + i + 1));
  }

  // Sort by combined RRF score
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

// ═══════════════════════════════════════════════
// RESULT HIGHLIGHTING
// ═══════════════════════════════════════════════

/**
 * Highlight matching query terms in content using **bold** markers.
 */
function highlightMatches(content: string, queryTokens: string[]): string {
  if (queryTokens.length === 0) return content;
  
  // Build regex from query tokens (escape special chars)
  const escaped = queryTokens
    .filter(t => t.length > 2)
    .slice(0, 10) // Limit to avoid regex explosion
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  
  if (escaped.length === 0) return content;
  
  const pattern = new RegExp(`\\b(${escaped.join('|')})`, 'gi');
  return content.replace(pattern, '**$1**');
}

// ═══════════════════════════════════════════════
// API EMBEDDINGS (OpenAI, DeepSeek, Kimi)
// ═══════════════════════════════════════════════

let embeddingApiConfig: { url: string; apiKey: string; model: string } | null = null;

function getEmbeddingApiConfig(): typeof embeddingApiConfig {
  if (embeddingApiConfig) return embeddingApiConfig;

  if (process.env.OPENAI_API_KEY) {
    embeddingApiConfig = {
      url: 'https://api.openai.com/v1/embeddings',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    };
  } else if (process.env.DEEPSEEK_API_KEY) {
    // DeepSeek embeddings — uses OpenAI-compatible API
    embeddingApiConfig = {
      url: 'https://api.deepseek.com/v1/embeddings',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: 'deepseek-chat',
    };
  } else if (process.env.KIMI_API_KEY) {
    embeddingApiConfig = {
      url: 'https://api.moonshot.cn/v1/embeddings',
      apiKey: process.env.KIMI_API_KEY,
      model: 'moonshot-v1-embedding',
    };
  }

  return embeddingApiConfig;
}

/**
 * Get embeddings from API (with LRU cache), fallback to local TF-IDF.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  // Check LRU cache first
  const cached = getCachedEmbedding(text);
  if (cached) return cached;

  const config = getEmbeddingApiConfig();
  if (!config) {
    const local = textToVector(text);
    setCachedEmbedding(text, local);
    return local;
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      const local = textToVector(text);
      setCachedEmbedding(text, local);
      return local;
    }

    const data: any = await response.json();
    const embedding = data.data?.[0]?.embedding || textToVector(text);
    setCachedEmbedding(text, embedding);
    return embedding;
  } catch {
    const local = textToVector(text);
    setCachedEmbedding(text, local);
    return local;
  }
}

/**
 * Batch embedding API call — embed multiple texts in one request.
 * Falls back to individual calls if batch fails.
 */
export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const config = getEmbeddingApiConfig();
  if (!config) {
    return texts.map(t => {
      const cached = getCachedEmbedding(t);
      if (cached) return cached;
      const vec = textToVector(t);
      setCachedEmbedding(t, vec);
      return vec;
    });
  }

  // Check cache first, only API-call for uncached
  const results: (number[] | null)[] = texts.map(t => getCachedEmbedding(t) || null);
  const uncachedIndices = results
    .map((r, i) => (r === null ? i : -1))
    .filter(i => i >= 0);

  if (uncachedIndices.length === 0) return results as number[][];

  try {
    const uncachedTexts = uncachedIndices.map(i => texts[i].slice(0, 8000));
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: uncachedTexts,
      }),
    });

    if (response.ok) {
      const data: any = await response.json();
      const embeddings: number[][] = data.data?.map((d: any) => d.embedding) || [];
      for (let j = 0; j < uncachedIndices.length; j++) {
        const idx = uncachedIndices[j];
        const emb = embeddings[j] || textToVector(texts[idx]);
        results[idx] = emb;
        setCachedEmbedding(texts[idx], emb);
      }
    } else {
      // Fallback to local for failed batch
      for (const idx of uncachedIndices) {
        const local = textToVector(texts[idx]);
        results[idx] = local;
        setCachedEmbedding(texts[idx], local);
      }
    }
  } catch {
    // Fallback to local on error
    for (const idx of uncachedIndices) {
      const local = textToVector(texts[idx]);
      results[idx] = local;
      setCachedEmbedding(texts[idx], local);
    }
  }

  // Fill any remaining nulls
  return results.map((r, i) => r || textToVector(texts[i]));
}

// ═══════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════

export interface VectorEntry {
  id: string;
  collection: string;
  content: string;
  metadata: Record<string, any>;
  similarity?: number;
  created_at: string;
  highlights?: string; // NEW: highlighted matching content
}

/**
 * Add a document to the vector store.
 * Writes to both SQLite AND in-memory cache.
 */
export async function addToVectorStore(
  id: string,
  content: string,
  collection: string = 'knowledge',
  metadata: Record<string, any> = {}
): Promise<{ id: string; duplicate: boolean; similarId?: string }> {
  initVectorStore();
  const db = getDb();

  const vector = await getEmbedding(content);

  // Check for duplicates using in-memory cache (fast!)
  const queryVector = textToVector(content);
  let bestSim = 0;
  let bestId = '';
  for (const [entryId, entry] of vectorCache) {
    if (entry.collection !== collection) continue;
    const sim = cosineSimilarity(queryVector, entry.vector);
    if (sim > bestSim) {
      bestSim = sim;
      bestId = entryId;
    }
    if (sim > 0.92) break; // Found a duplicate, stop early
  }

  if (bestSim > 0.92) {
    return { id: bestId, duplicate: true, similarId: bestId };
  }

  // Write to SQLite
  db.run(
    `INSERT OR REPLACE INTO vector_store (id, collection, content, vector, metadata) VALUES (?, ?, ?, ?, ?)`,
    [id, collection, content, JSON.stringify(vector), JSON.stringify(metadata)]
  );
  saveDatabase();

  // Update in-memory cache
  const tokens = tokenize(content);
  vectorCache.set(id, {
    id,
    collection,
    content,
    vector,
    metadata,
    created_at: new Date().toISOString(),
    tokens,
    tokenCount: tokens.length,
  });

  // Update average doc length
  let totalTokens = 0;
  for (const [, e] of vectorCache) totalTokens += e.tokenCount;
  avgDocLength = vectorCache.size > 0 ? totalTokens / vectorCache.size : 0;

  return { id, duplicate: false };
}

/**
 * Hybrid search — combines dense vector similarity with BM25 keyword scoring.
 * Uses Reciprocal Rank Fusion (RRF) to merge ranked lists.
 * 
 * This is the main search function — all consumers call this.
 */
export function searchVectorStore(
  query: string,
  collection?: string,
  limit: number = MAX_RESULTS,
  threshold: number = SIMILARITY_THRESHOLD,
  metadataFilter?: Record<string, any>
): VectorEntry[] {
  initVectorStore();

  const queryVector = textToVector(query);
  const queryTokens = tokenize(query);

  // ── Stage 1: Dense vector scoring (from cache) ──
  const vectorScored: Array<{ id: string; score: number }> = [];
  // ── Stage 2: BM25 keyword scoring (from cache) ──
  const bm25Scored: Array<{ id: string; score: number }> = [];

  for (const [id, entry] of vectorCache) {
    // Collection filter
    if (collection && entry.collection !== collection) continue;

    // Metadata filter
    if (metadataFilter) {
      let matches = true;
      for (const [key, value] of Object.entries(metadataFilter)) {
        if (entry.metadata[key] !== value) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    // Dense similarity
    const sim = cosineSimilarity(queryVector, entry.vector);
    if (sim >= threshold) {
      vectorScored.push({ id, score: sim });
    }

    // BM25 score
    const bm25 = bm25Score(queryTokens, entry.tokens, entry.tokenCount);
    if (bm25 > 0) {
      bm25Scored.push({ id, score: bm25 });
    }
  }

  // Sort both lists by score descending
  vectorScored.sort((a, b) => b.score - a.score);
  bm25Scored.sort((a, b) => b.score - a.score);

  // ── Stage 3: Reciprocal Rank Fusion ──
  const candidateLimit = limit * 3;
  const fusedIds = reciprocalRankFusion(
    vectorScored.slice(0, candidateLimit),
    bm25Scored.slice(0, candidateLimit),
    limit
  );

  // ── Stage 4: Build results with highlighting ──
  const entries: VectorEntry[] = [];
  for (const id of fusedIds) {
    const entry = vectorCache.get(id);
    if (!entry) continue;

    // Compute final similarity for the entry
    const sim = cosineSimilarity(queryVector, entry.vector);

    entries.push({
      id: entry.id,
      collection: entry.collection,
      content: entry.content,
      metadata: entry.metadata,
      similarity: sim,
      created_at: entry.created_at,
      highlights: highlightMatches(
        entry.content.length > 500 ? entry.content.slice(0, 500) : entry.content,
        queryTokens
      ),
    });
  }

  return entries;
}

/**
 * Delete an entry from the vector store.
 * Removes from both SQLite AND in-memory cache.
 */
export function deleteFromVectorStore(id: string): boolean {
  initVectorStore();
  const db = getDb();

  if (!vectorCache.has(id)) return false;

  db.run(`DELETE FROM vector_store WHERE id = ?`, [id]);
  saveDatabase();
  vectorCache.delete(id);
  return true;
}

/**
 * Get vector store statistics.
 */
export function getVectorStoreStats(): {
  totalEntries: number;
  collections: Record<string, number>;
  embeddingMode: string;
  cacheSize: number;
  embeddingCacheSize: number;
  avgDocTokens: number;
} {
  initVectorStore();

  const collections: Record<string, number> = {};
  for (const [, entry] of vectorCache) {
    collections[entry.collection] = (collections[entry.collection] || 0) + 1;
  }

  return {
    totalEntries: vectorCache.size,
    collections,
    embeddingMode: getEmbeddingApiConfig() ? 'api' : 'local-tfidf',
    cacheSize: vectorCache.size,
    embeddingCacheSize: embeddingCache.size,
    avgDocTokens: Math.round(avgDocLength),
  };
}

/**
 * Clear a collection or all collections.
 * Removes from both SQLite AND in-memory cache.
 */
export function clearVectorStore(collection?: string): number {
  initVectorStore();
  const db = getDb();

  let count = 0;
  if (collection) {
    for (const [id, entry] of vectorCache) {
      if (entry.collection === collection) {
        vectorCache.delete(id);
        count++;
      }
    }
    db.run(`DELETE FROM vector_store WHERE collection = ?`, [collection]);
  } else {
    count = vectorCache.size;
    vectorCache.clear();
    db.run(`DELETE FROM vector_store`);
  }

  saveDatabase();
  return count;
}

/**
 * Find near-duplicates in a collection.
 * Uses in-memory cache for fast O(n²) comparison.
 */
export function findDuplicates(
  collection: string,
  threshold: number = 0.92
): Array<{ id1: string; id2: string; similarity: number }> {
  initVectorStore();

  // Get entries from cache for this collection
  const entries: Array<{ id: string; vector: number[] }> = [];
  for (const [, entry] of vectorCache) {
    if (entry.collection === collection) {
      entries.push({ id: entry.id, vector: entry.vector });
    }
  }

  const duplicates: Array<{ id1: string; id2: string; similarity: number }> = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const sim = cosineSimilarity(entries[i].vector, entries[j].vector);
      if (sim >= threshold) {
        duplicates.push({
          id1: entries[i].id,
          id2: entries[j].id,
          similarity: sim,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}
