/**
 * VegaMCP — Multimodal Embeddings
 * Cross-modal vector search unifying text, images, and audio.
 * Extends the existing vector store with modality-aware operations.
 */

export type Modality = 'text' | 'image' | 'audio' | 'mixed';

export interface MultimodalVector {
  id: string;
  modality: Modality;
  content: string;         // Text content or description
  embedding?: number[];    // Vector embedding
  metadata: {
    sourceType: Modality;
    mimeType?: string;
    dimensions?: { width?: number; height?: number };
    duration?: number;     // Audio duration in seconds
    originalPath?: string;
    tags: string[];
  };
  createdAt: string;
}

export interface SearchResult {
  id: string;
  content: string;
  modality: Modality;
  score: number;
  metadata: Record<string, any>;
}

// In-memory vector store (extends existing knowledge graph vectors)
const multimodalVectors = new Map<string, MultimodalVector>();

function genId(): string {
  return `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Simple text embedding (cosine similarity compatible)
 * In production, would use CLIP, OpenAI embeddings, etc.
 */
function simpleEmbed(text: string, dimensions: number = 128): number[] {
  const embedding = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const idx = (word.charCodeAt(j) * (i + 1) * (j + 7)) % dimensions;
      embedding[idx] += 1.0 / (1 + j);
    }
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
  return embedding.map(v => v / magnitude);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

/**
 * Add a text vector
 */
export function addTextVector(content: string, tags: string[] = [], path?: string): string {
  const id = genId();
  multimodalVectors.set(id, {
    id, modality: 'text', content,
    embedding: simpleEmbed(content),
    metadata: { sourceType: 'text', tags, originalPath: path },
    createdAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Add an image vector (from description/alt text)
 */
export function addImageVector(
  description: string,
  mimeType: string = 'image/png',
  dimensions?: { width: number; height: number },
  tags: string[] = [],
  path?: string
): string {
  const id = genId();
  // Combine description with visual terms for cross-modal matching
  const content = `[image] ${description}`;
  multimodalVectors.set(id, {
    id, modality: 'image', content,
    embedding: simpleEmbed(content),
    metadata: { sourceType: 'image', mimeType, dimensions, tags, originalPath: path },
    createdAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Add an audio vector (from transcription/description)
 */
export function addAudioVector(
  transcription: string,
  duration?: number,
  mimeType: string = 'audio/wav',
  tags: string[] = [],
  path?: string
): string {
  const id = genId();
  const content = `[audio] ${transcription}`;
  multimodalVectors.set(id, {
    id, modality: 'audio', content,
    embedding: simpleEmbed(content),
    metadata: { sourceType: 'audio', mimeType, duration, tags, originalPath: path },
    createdAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Cross-modal search — finds similar content across all modalities
 */
export function searchMultimodal(
  query: string,
  options?: { modality?: Modality; limit?: number; minScore?: number; tags?: string[] }
): SearchResult[] {
  const queryEmbed = simpleEmbed(query);
  const limit = options?.limit || 10;
  const minScore = options?.minScore || 0.1;

  const results: SearchResult[] = [];

  for (const vec of multimodalVectors.values()) {
    // Filter by modality
    if (options?.modality && vec.modality !== options.modality) continue;

    // Filter by tags
    if (options?.tags?.length) {
      const hasTag = options.tags.some(t => vec.metadata.tags.includes(t));
      if (!hasTag) continue;
    }

    const score = vec.embedding ? cosineSimilarity(queryEmbed, vec.embedding) : 0;
    if (score >= minScore) {
      results.push({
        id: vec.id, content: vec.content,
        modality: vec.modality, score,
        metadata: vec.metadata,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Get vectors by modality
 */
export function getByModality(modality: Modality): MultimodalVector[] {
  return Array.from(multimodalVectors.values()).filter(v => v.modality === modality);
}

/**
 * Get stats
 */
export function getMultimodalStats(): Record<string, any> {
  const all = Array.from(multimodalVectors.values());
  const byModality: Record<string, number> = {};
  for (const v of all) byModality[v.modality] = (byModality[v.modality] || 0) + 1;
  return {
    totalVectors: all.length,
    byModality,
    avgEmbeddingDim: all[0]?.embedding?.length || 128,
  };
}

// ── Tool Schema & Handler ──

export const multimodalSchema = {
  name: 'multimodal_embeddings',
  description: 'Cross-modal vector search unifying text, images, and audio. Add vectors of any modality, search across all types, and retrieve similar content regardless of source format.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['add_text', 'add_image', 'add_audio', 'search', 'stats', 'list'] },
      content: { type: 'string', description: 'Text content or description' },
      query: { type: 'string', description: 'Search query (for search)' },
      modality: { type: 'string', enum: ['text', 'image', 'audio', 'mixed'], description: 'Filter by modality' },
      tags: { type: 'array', items: { type: 'string' } },
      mime_type: { type: 'string' },
      path: { type: 'string', description: 'Original file path' },
      duration: { type: 'number', description: 'Audio duration in seconds' },
      width: { type: 'number' }, height: { type: 'number' },
      limit: { type: 'number', description: 'Max results (default: 10)' },
      min_score: { type: 'number', description: 'Minimum similarity score (default: 0.1)' },
    },
    required: ['action'],
  },
};

export function handleMultimodal(args: any): string {
  try {
    switch (args.action) {
      case 'add_text': {
        if (!args.content) return JSON.stringify({ success: false, error: 'content required' });
        const id = addTextVector(args.content, args.tags || [], args.path);
        return JSON.stringify({ success: true, id, modality: 'text' });
      }
      case 'add_image': {
        if (!args.content) return JSON.stringify({ success: false, error: 'content (description) required' });
        const dims = args.width && args.height ? { width: args.width, height: args.height } : undefined;
        const id = addImageVector(args.content, args.mime_type, dims, args.tags || [], args.path);
        return JSON.stringify({ success: true, id, modality: 'image' });
      }
      case 'add_audio': {
        if (!args.content) return JSON.stringify({ success: false, error: 'content (transcription) required' });
        const id = addAudioVector(args.content, args.duration, args.mime_type, args.tags || [], args.path);
        return JSON.stringify({ success: true, id, modality: 'audio' });
      }
      case 'search': {
        if (!args.query) return JSON.stringify({ success: false, error: 'query required' });
        const results = searchMultimodal(args.query, {
          modality: args.modality, limit: args.limit, minScore: args.min_score, tags: args.tags,
        });
        return JSON.stringify({ success: true, results, count: results.length });
      }
      case 'stats':
        return JSON.stringify({ success: true, ...getMultimodalStats() });
      case 'list': {
        const vectors = args.modality ? getByModality(args.modality) : Array.from(multimodalVectors.values());
        return JSON.stringify({ success: true, vectors: vectors.slice(0, args.limit || 20).map(v => ({
          id: v.id, modality: v.modality, content: v.content.slice(0, 100), tags: v.metadata.tags,
        })), count: vectors.length });
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message });
  }
}
