/**
 * VegaMCP — Embedded Vector Store
 * 
 * Lightweight vector database using SQLite persistence with TF-IDF + cosine similarity.
 * Supports optional API-based embeddings (OpenAI, DeepSeek, Kimi) for higher quality.
 * Zero external dependencies — uses character n-gram hashing for fixed-size vectors.
 */

import { getDb, saveDatabase } from './graph-store.js';

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

const VECTOR_DIM = 384;       // Fixed vector dimensions (hash-based)
const NGRAM_SIZE = 3;          // Character n-gram size
const MAX_RESULTS = 20;        // Default max search results
const SIMILARITY_THRESHOLD = 0.15; // Minimum cosine similarity to return

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
}

// ═══════════════════════════════════════════════
// TOKENIZATION & VECTORIZATION
// ═══════════════════════════════════════════════

/**
 * Tokenize text into cleaned words.
 */
function tokenize(text: string): string[] {
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
  for (const word of words) {
    const idx = fnv1aHash(word) % VECTOR_DIM;
    vector[idx] += 1.0;
    
    // Also hash word bigrams for context
    const prev = words[words.indexOf(word) - 1];
    if (prev) {
      const bigramIdx = fnv1aHash(`${prev}_${word}`) % VECTOR_DIM;
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
// API EMBEDDINGS (Optional, higher quality)
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
 * Get embeddings from API (if available), otherwise fall back to local TF-IDF.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const config = getEmbeddingApiConfig();
  if (!config) return textToVector(text);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: text.slice(0, 8000), // Trim to avoid token limits
      }),
    });

    if (!response.ok) {
      return textToVector(text); // Fallback
    }

    const data: any = await response.json();
    return data.data?.[0]?.embedding || textToVector(text);
  } catch {
    return textToVector(text); // Fallback on error
  }
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
}

/**
 * Add a document to the vector store.
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

  // Check for duplicates (cosine similarity > 0.92)
  const existing = searchVectorStore(content, collection, 1);
  if (existing.length > 0 && existing[0].similarity && existing[0].similarity > 0.92) {
    return { id: existing[0].id, duplicate: true, similarId: existing[0].id };
  }

  // Upsert
  db.run(
    `INSERT OR REPLACE INTO vector_store (id, collection, content, vector, metadata) VALUES (?, ?, ?, ?, ?)`,
    [id, collection, content, JSON.stringify(vector), JSON.stringify(metadata)]
  );
  saveDatabase();

  return { id, duplicate: false };
}

/**
 * Search the vector store by semantic similarity.
 */
export function searchVectorStore(
  query: string,
  collection?: string,
  limit: number = MAX_RESULTS,
  threshold: number = SIMILARITY_THRESHOLD
): VectorEntry[] {
  initVectorStore();
  const db = getDb();

  const queryVector = textToVector(query);

  let sql = `SELECT id, collection, content, vector, metadata, created_at FROM vector_store`;
  const params: any[] = [];
  if (collection) {
    sql += ` WHERE collection = ?`;
    params.push(collection);
  }

  const result = db.exec(sql, params);
  if (result.length === 0) return [];

  const entries: VectorEntry[] = [];
  for (const row of result[0].values) {
    const storedVector: number[] = JSON.parse(row[3] as string);
    const similarity = cosineSimilarity(queryVector, storedVector);

    if (similarity >= threshold) {
      entries.push({
        id: row[0] as string,
        collection: row[1] as string,
        content: row[2] as string,
        metadata: JSON.parse((row[4] as string) || '{}'),
        similarity,
        created_at: row[5] as string,
      });
    }
  }

  // Sort by similarity descending
  entries.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  return entries.slice(0, limit);
}

/**
 * Delete an entry from the vector store.
 */
export function deleteFromVectorStore(id: string): boolean {
  initVectorStore();
  const db = getDb();
  const before = db.exec(`SELECT COUNT(*) FROM vector_store WHERE id = ?`, [id]);
  const count = before.length > 0 ? (before[0].values[0][0] as number) : 0;
  if (count === 0) return false;

  db.run(`DELETE FROM vector_store WHERE id = ?`, [id]);
  saveDatabase();
  return true;
}

/**
 * Get vector store statistics.
 */
export function getVectorStoreStats(): {
  totalEntries: number;
  collections: Record<string, number>;
  embeddingMode: string;
} {
  initVectorStore();
  const db = getDb();

  const totalResult = db.exec(`SELECT COUNT(*) FROM vector_store`);
  const total = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

  const collResult = db.exec(`SELECT collection, COUNT(*) FROM vector_store GROUP BY collection`);
  const collections: Record<string, number> = {};
  if (collResult.length > 0) {
    for (const row of collResult[0].values) {
      collections[row[0] as string] = row[1] as number;
    }
  }

  return {
    totalEntries: total,
    collections,
    embeddingMode: getEmbeddingApiConfig() ? 'api' : 'local-tfidf',
  };
}

/**
 * Clear a collection or all collections.
 */
export function clearVectorStore(collection?: string): number {
  initVectorStore();
  const db = getDb();

  let countResult;
  if (collection) {
    countResult = db.exec(`SELECT COUNT(*) FROM vector_store WHERE collection = ?`, [collection]);
    db.run(`DELETE FROM vector_store WHERE collection = ?`, [collection]);
  } else {
    countResult = db.exec(`SELECT COUNT(*) FROM vector_store`);
    db.run(`DELETE FROM vector_store`);
  }

  saveDatabase();
  return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
}

/**
 * Find near-duplicates in a collection.
 */
export function findDuplicates(
  collection: string,
  threshold: number = 0.92
): Array<{ id1: string; id2: string; similarity: number }> {
  initVectorStore();
  const db = getDb();

  const result = db.exec(
    `SELECT id, vector FROM vector_store WHERE collection = ?`,
    [collection]
  );
  if (result.length === 0) return [];

  const entries = result[0].values.map(row => ({
    id: row[0] as string,
    vector: JSON.parse(row[1] as string) as number[],
  }));

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
