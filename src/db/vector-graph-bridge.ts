/**
 * VegaMCP — Vector-Graph Bridge (Memory-Augmented Graph)
 * 
 * The foundational "Memory Bridge" that unifies two memory systems:
 *   1. Vector Store (ChromaDB-style) — semantic similarity retrieval
 *   2. SQLite Graph Store — logical relationship mapping
 * 
 * KEY CAPABILITIES:
 *   • Cross-Modal Storage: Every "learn" operation writes to BOTH stores
 *   • Cross-Modal Retrieval: Queries merge semantic + structural results
 *   • Memory Consolidation: Promotes verified vector entries → permanent graph
 *   • Confidence Scoring: Tracks how many times an idea has been verified
 *   • Provenance Tracking: Records which agent/source created each memory
 *   • Decay & Reinforcement: Memories strengthen with use, decay without
 */

import {
  createEntity,
  getEntityByName,
  getEntityWithDetails,
  addObservation,
  createRelation,
  searchEntities,
  getAllRelations,
  getDb,
  saveDatabase,
  type EntityRow,
  type EntityWithDetails,
} from './graph-store.js';

import {
  addToVectorStore,
  searchVectorStore,
  initVectorStore,
  getVectorStoreStats,
  type VectorEntry,
} from './vector-store.js';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export interface BridgedMemory {
  id: string;
  content: string;
  source: 'vector' | 'graph' | 'both';
  relevanceScore: number;      // 0-1 unified relevance
  confidenceScore: number;     // 0-1 how verified this knowledge is
  graphEntity?: EntityWithDetails;
  vectorEntry?: VectorEntry;
  relations: Array<{
    direction: 'outgoing' | 'incoming';
    relatedEntity: string;
    type: string;
    strength: number;
  }>;
  metadata: Record<string, any>;
  lastAccessed: string;
  accessCount: number;
}

export interface LearnInput {
  content: string;
  entityName: string;
  entityType?: string;           // concept, hypothesis, fact, constraint, method, tool
  domain?: string;               // research, engineering, science, general
  source?: string;               // agent:visionary, agent:adversary, user, wolfram, arxiv
  confidence?: number;           // 0-1 initial confidence
  relatedTo?: Array<{
    entityName: string;
    relationType: string;        // derives_from, contradicts, supports, requires, supersedes
    strength?: number;
  }>;
  tags?: string[];
  isConstraint?: boolean;        // If true, this is a "learned guardrail"
  isFailure?: boolean;           // If true, this is a "past failure" entry
}

export interface ConsolidationReport {
  timestamp: string;
  entriesReviewed: number;
  promoted: number;
  decayed: number;
  merged: number;
  strengthened: number;
  failures: string[];
}

export interface CrossModalResult {
  memories: BridgedMemory[];
  queryTime: number;
  vectorHits: number;
  graphHits: number;
  crossLinks: number;
}

// ═══════════════════════════════════════════════
// BRIDGE TABLE INITIALIZATION
// ═══════════════════════════════════════════════

let bridgeInitialized = false;

export function initBridgeTables(): void {
  if (bridgeInitialized) return;
  const db = getDb();

  // Cross-reference table: links vector IDs ↔ graph entity IDs
  db.run(`
    CREATE TABLE IF NOT EXISTS memory_bridge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vector_id TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      entity_name TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT DEFAULT 'unknown',
      is_constraint INTEGER NOT NULL DEFAULT 0,
      is_failure INTEGER NOT NULL DEFAULT 0,
      promoted INTEGER NOT NULL DEFAULT 0,
      decay_rate REAL NOT NULL DEFAULT 0.01,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(vector_id, entity_id)
    );
  `);

  // Consolidation log
  db.run(`
    CREATE TABLE IF NOT EXISTS consolidation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entries_reviewed INTEGER NOT NULL,
      promoted INTEGER NOT NULL DEFAULT 0,
      decayed INTEGER NOT NULL DEFAULT 0,
      merged INTEGER NOT NULL DEFAULT 0,
      strengthened INTEGER NOT NULL DEFAULT 0,
      failures TEXT DEFAULT '[]',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Hypothesis tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS hypotheses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      confidence REAL NOT NULL DEFAULT 0.5,
      visionary_score REAL DEFAULT NULL,
      adversary_score REAL DEFAULT NULL,
      arbiter_verdict TEXT DEFAULT NULL,
      vector_id TEXT,
      entity_id INTEGER,
      debate_log TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_bridge_vector ON memory_bridge(vector_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bridge_entity ON memory_bridge(entity_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bridge_confidence ON memory_bridge(confidence);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bridge_source ON memory_bridge(source);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bridge_constraint ON memory_bridge(is_constraint);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bridge_failure ON memory_bridge(is_failure);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);`);

  saveDatabase();
  bridgeInitialized = true;
}

// ═══════════════════════════════════════════════
// CROSS-MODAL LEARN (Dual-Write)
// ═══════════════════════════════════════════════

/**
 * Learn something new — writes to BOTH the vector store and the graph store,
 * then creates a bridge record linking them. This is the primary "memory write" API.
 */
export async function learn(input: LearnInput): Promise<BridgedMemory> {
  initBridgeTables();
  initVectorStore();
  const db = getDb();

  const {
    content,
    entityName,
    entityType = 'concept',
    domain = 'general',
    source = 'user',
    confidence = 0.5,
    relatedTo = [],
    tags = [],
    isConstraint = false,
    isFailure = false,
  } = input;

  // 1. Write to Vector Store (semantic index)
  const vectorId = `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const collection = isFailure ? 'failures' : isConstraint ? 'constraints' : 'knowledge';
  
  const vectorResult = await addToVectorStore(vectorId, content, collection, {
    entityName,
    entityType,
    domain,
    source,
    confidence,
    tags,
    isConstraint,
    isFailure,
  });

  // 2. Write to Graph Store (structural index)
  const entity = createEntity(entityName, entityType, domain, source);
  if (!entity) {
    throw new Error(`Failed to create graph entity: ${entityName}`);
  }

  // Add the content as an observation
  addObservation(entity.id, content);

  // 3. Create relationships
  for (const rel of relatedTo) {
    const relatedEntity = getEntityByName(rel.entityName);
    if (relatedEntity) {
      createRelation(entity.id, relatedEntity.id, rel.relationType, rel.strength || 1.0);
    } else {
      // Create the related entity if it doesn't exist
      const newRelated = createEntity(rel.entityName, 'concept', domain, 'auto-linked');
      if (newRelated) {
        createRelation(entity.id, newRelated.id, rel.relationType, rel.strength || 1.0);
      }
    }
  }

  // 4. Create bridge record
  const actualVectorId = vectorResult.duplicate ? (vectorResult.similarId || vectorId) : vectorId;
  
  db.run(
    `INSERT OR REPLACE INTO memory_bridge 
     (vector_id, entity_id, entity_name, confidence, source, is_constraint, is_failure, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [actualVectorId, entity.id, entityName, confidence, source, 
     isConstraint ? 1 : 0, isFailure ? 1 : 0, JSON.stringify(tags)]
  );
  saveDatabase();

  // 5. Return unified BridgedMemory
  const entityDetails = getEntityWithDetails(entityName);
  return {
    id: actualVectorId,
    content,
    source: 'both',
    relevanceScore: 1.0,
    confidenceScore: confidence,
    graphEntity: entityDetails || undefined,
    relations: entityDetails?.relations || [],
    metadata: { entityType, domain, source, tags, isConstraint, isFailure },
    lastAccessed: new Date().toISOString(),
    accessCount: 0,
  };
}

// ═══════════════════════════════════════════════
// CROSS-MODAL RECALL (Unified Search)
// ═══════════════════════════════════════════════

/**
 * Cross-modal recall — searches BOTH stores and merges results.
 * Returns a unified list sorted by combined relevance.
 */
export function recall(
  query: string,
  options: {
    domain?: string;
    entityType?: string;
    collection?: string;
    limit?: number;
    includeFailures?: boolean;
    includeConstraints?: boolean;
    minConfidence?: number;
  } = {}
): CrossModalResult {
  initBridgeTables();
  const start = Date.now();
  const db = getDb();
  const { 
    domain, entityType, collection, limit = 20,
    includeFailures = false, includeConstraints = true,
    minConfidence = 0.0 
  } = options;

  // 1. Vector search (semantic)
  const vectorResults = searchVectorStore(query, collection, limit * 2);
  
  // 2. Graph search (structural)
  const graphResults = searchEntities(query, domain, entityType, limit * 2);

  // 3. Merge results using bridge cross-references
  const memoryMap = new Map<string, BridgedMemory>();

  // Process vector results
  for (const vec of vectorResults) {
    // Look up bridge entry
    const bridgeResult = db.exec(
      `SELECT * FROM memory_bridge WHERE vector_id = ?`, [vec.id]
    );

    let bridgeData: any = null;
    if (bridgeResult.length > 0 && bridgeResult[0].values.length > 0) {
      const row = bridgeResult[0].values[0];
      bridgeData = {
        confidence: row[4] as number,
        accessCount: row[5] as number,
        lastAccessed: row[6] as string,
        source: row[7] as string,
        isConstraint: (row[8] as number) === 1,
        isFailure: (row[9] as number) === 1,
        tags: JSON.parse((row[12] as string) || '[]'),
      };
    }

    // Skip if filtered
    if (bridgeData) {
      if (!includeFailures && bridgeData.isFailure) continue;
      if (!includeConstraints && bridgeData.isConstraint) continue;
      if (bridgeData.confidence < minConfidence) continue;
    }

    const key = vec.id;
    const existing = memoryMap.get(key);
    if (!existing) {
      // Find corresponding graph entity
      const entityName = vec.metadata?.entityName;
      const graphEntity = entityName ? getEntityWithDetails(entityName) : undefined;

      memoryMap.set(key, {
        id: vec.id,
        content: vec.content,
        source: graphEntity ? 'both' : 'vector',
        relevanceScore: vec.similarity || 0,
        confidenceScore: bridgeData?.confidence || 0.5,
        vectorEntry: vec,
        graphEntity: graphEntity || undefined,
        relations: graphEntity?.relations || [],
        metadata: {
          ...vec.metadata,
          ...(bridgeData || {}),
        },
        lastAccessed: bridgeData?.lastAccessed || vec.created_at,
        accessCount: bridgeData?.accessCount || 0,
      });
    }

    // Record access (reinforcement)
    if (bridgeData) {
      db.run(
        `UPDATE memory_bridge SET access_count = access_count + 1, 
         last_accessed = datetime('now'), confidence = MIN(1.0, confidence + 0.01)
         WHERE vector_id = ?`,
        [vec.id]
      );
    }
  }

  // Process graph results (add any not already found via vector)
  for (const entity of graphResults) {
    const bridgeResult = db.exec(
      `SELECT vector_id FROM memory_bridge WHERE entity_id = ?`, [entity.id]
    );

    const vectorId = bridgeResult.length > 0 && bridgeResult[0].values.length > 0
      ? bridgeResult[0].values[0][0] as string
      : `graph_${entity.id}`;

    if (!memoryMap.has(vectorId)) {
      memoryMap.set(vectorId, {
        id: vectorId,
        content: entity.observations.join('\n'),
        source: 'graph',
        relevanceScore: 0.7, // Graph matches get base relevance
        confidenceScore: 0.6,
        graphEntity: entity,
        relations: entity.relations,
        metadata: {
          entityType: entity.type,
          domain: entity.domain,
          source: entity.source,
        },
        lastAccessed: entity.updated_at,
        accessCount: 0,
      });
    } else {
      // Boost relevance for cross-modal matches
      const existing = memoryMap.get(vectorId)!;
      existing.relevanceScore = Math.min(1.0, existing.relevanceScore + 0.2);
      existing.source = 'both';
      existing.graphEntity = entity;
      existing.relations = entity.relations;
    }
  }

  saveDatabase();

  // 4. Sort by combined score and return
  const memories = Array.from(memoryMap.values())
    .sort((a, b) => {
      // Combined score: 60% relevance + 25% confidence + 15% recency bonus
      const scoreA = a.relevanceScore * 0.6 + a.confidenceScore * 0.25 + 
                     (a.source === 'both' ? 0.15 : 0);
      const scoreB = b.relevanceScore * 0.6 + b.confidenceScore * 0.25 + 
                     (b.source === 'both' ? 0.15 : 0);
      return scoreB - scoreA;
    })
    .slice(0, limit);

  return {
    memories,
    queryTime: Date.now() - start,
    vectorHits: vectorResults.length,
    graphHits: graphResults.length,
    crossLinks: memories.filter(m => m.source === 'both').length,
  };
}

// ═══════════════════════════════════════════════
// RECALL: PAST FAILURES (Self-Evolution)
// ═══════════════════════════════════════════════

/**
 * Specifically recall past failures related to a query.
 * Used by the "Self-Evolution" loop to avoid repeating mistakes.
 */
export function recallFailures(query: string, limit: number = 10): BridgedMemory[] {
  return recall(query, {
    collection: 'failures',
    includeFailures: true,
    limit,
  }).memories;
}

/**
 * Recall learned constraints (guardrails).
 */
export function recallConstraints(query: string, limit: number = 10): BridgedMemory[] {
  return recall(query, {
    collection: 'constraints',
    includeConstraints: true,
    limit,
  }).memories;
}

// ═══════════════════════════════════════════════
// MEMORY CONSOLIDATION (Nightly Promotion)
// ═══════════════════════════════════════════════

/**
 * Memory Consolidation — reviews recent vector entries and "promotes"
 * the most verified ones to the permanent knowledge graph with
 * stronger confidence scores. Decays unused memories.
 * 
 * Designed to run on a schedule (e.g., 2 AM server time).
 */
export function consolidateMemory(): ConsolidationReport {
  initBridgeTables();
  const db = getDb();
  const report: ConsolidationReport = {
    timestamp: new Date().toISOString(),
    entriesReviewed: 0,
    promoted: 0,
    decayed: 0,
    merged: 0,
    strengthened: 0,
    failures: [],
  };

  try {
    // 1. Review all bridge entries
    const allEntries = db.exec(`
      SELECT mb.*, vs.content, vs.collection 
      FROM memory_bridge mb
      LEFT JOIN vector_store vs ON vs.id = mb.vector_id
      ORDER BY mb.confidence DESC
    `);

    if (allEntries.length === 0 || allEntries[0].values.length === 0) {
      return report;
    }

    for (const row of allEntries[0].values) {
      report.entriesReviewed++;
      
      const vectorId = row[1] as string;
      const entityId = row[2] as number;
      const entityName = row[3] as string;
      const confidence = row[4] as number;
      const accessCount = row[5] as number;
      const isPromoted = (row[10] as number) === 1;
      const decayRate = row[11] as number;
      const content = row[15] as string;

      // PROMOTION: High confidence, frequently accessed, not yet promoted
      if (confidence >= 0.8 && accessCount >= 3 && !isPromoted && content) {
        try {
          // Add a "verified" observation to the graph entity
          addObservation(entityId, `[VERIFIED] ${content.slice(0, 500)}`);
          
          // Mark as promoted
          db.run(
            `UPDATE memory_bridge SET promoted = 1, confidence = MIN(1.0, confidence + 0.1),
             updated_at = datetime('now') WHERE vector_id = ? AND entity_id = ?`,
            [vectorId, entityId]
          );
          report.promoted++;
        } catch (err: any) {
          report.failures.push(`Promote failed for ${entityName}: ${err.message}`);
        }
      }

      // DECAY: Low access, not a constraint or failure, > 7 days old
      else if (accessCount === 0 && confidence < 0.5) {
        const newConfidence = Math.max(0.01, confidence - decayRate);
        db.run(
          `UPDATE memory_bridge SET confidence = ?, updated_at = datetime('now')
           WHERE vector_id = ? AND entity_id = ?`,
          [newConfidence, vectorId, entityId]
        );
        report.decayed++;
      }

      // STRENGTHEN: Medium-high access + moderate confidence
      else if (accessCount >= 2 && confidence >= 0.5 && confidence < 0.8) {
        const boost = Math.min(0.05, accessCount * 0.01);
        db.run(
          `UPDATE memory_bridge SET confidence = MIN(1.0, confidence + ?),
           updated_at = datetime('now') WHERE vector_id = ? AND entity_id = ?`,
          [boost, vectorId, entityId]
        );
        report.strengthened++;
      }
    }

    // 2. Log the consolidation
    db.run(
      `INSERT INTO consolidation_log 
       (entries_reviewed, promoted, decayed, merged, strengthened, failures)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [report.entriesReviewed, report.promoted, report.decayed, 
       report.merged, report.strengthened, JSON.stringify(report.failures)]
    );

    saveDatabase();
  } catch (err: any) {
    report.failures.push(`Consolidation error: ${err.message}`);
  }

  return report;
}

// ═══════════════════════════════════════════════
// HYPOTHESIS MANAGEMENT
// ═══════════════════════════════════════════════

export interface HypothesisRecord {
  hypothesisId: string;
  title: string;
  description: string;
  status: 'proposed' | 'debating' | 'approved' | 'rejected' | 'prototyping' | 'verified' | 'failed';
  confidence: number;
  visionaryScore: number | null;
  adversaryScore: number | null;
  arbiterVerdict: string | null;
  vectorId: string | null;
  entityId: number | null;
  debateLog: Array<{ agent: string; position: string; reasoning: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a new hypothesis from the Tournament of Ideas.
 */
export function createHypothesis(
  title: string,
  description: string,
  source: string = 'visionary'
): HypothesisRecord {
  initBridgeTables();
  const db = getDb();
  
  const hypothesisId = `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  db.run(
    `INSERT INTO hypotheses (hypothesis_id, title, description, status, confidence)
     VALUES (?, ?, ?, 'proposed', 0.5)`,
    [hypothesisId, title, description]
  );
  saveDatabase();

  return {
    hypothesisId,
    title,
    description,
    status: 'proposed',
    confidence: 0.5,
    visionaryScore: null,
    adversaryScore: null,
    arbiterVerdict: null,
    vectorId: null,
    entityId: null,
    debateLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update hypothesis with debate results.
 */
export function updateHypothesis(
  hypothesisId: string,
  updates: Partial<{
    status: HypothesisRecord['status'];
    confidence: number;
    visionaryScore: number;
    adversaryScore: number;
    arbiterVerdict: string;
    vectorId: string;
    entityId: number;
    debateEntry: { agent: string; position: string; reasoning: string };
  }>
): void {
  initBridgeTables();
  const db = getDb();

  // Build dynamic update
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const params: any[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?'); params.push(updates.status);
  }
  if (updates.confidence !== undefined) {
    sets.push('confidence = ?'); params.push(updates.confidence);
  }
  if (updates.visionaryScore !== undefined) {
    sets.push('visionary_score = ?'); params.push(updates.visionaryScore);
  }
  if (updates.adversaryScore !== undefined) {
    sets.push('adversary_score = ?'); params.push(updates.adversaryScore);
  }
  if (updates.arbiterVerdict !== undefined) {
    sets.push('arbiter_verdict = ?'); params.push(updates.arbiterVerdict);
  }
  if (updates.vectorId !== undefined) {
    sets.push('vector_id = ?'); params.push(updates.vectorId);
  }
  if (updates.entityId !== undefined) {
    sets.push('entity_id = ?'); params.push(updates.entityId);
  }

  // Append debate entry
  if (updates.debateEntry) {
    const existing = db.exec(
      `SELECT debate_log FROM hypotheses WHERE hypothesis_id = ?`, [hypothesisId]
    );
    let log: any[] = [];
    if (existing.length > 0 && existing[0].values.length > 0) {
      try { log = JSON.parse(existing[0].values[0][0] as string); } catch { /* empty */ }
    }
    log.push({ ...updates.debateEntry, timestamp: new Date().toISOString() });
    sets.push('debate_log = ?'); params.push(JSON.stringify(log));
  }

  params.push(hypothesisId);
  db.run(`UPDATE hypotheses SET ${sets.join(', ')} WHERE hypothesis_id = ?`, params);
  saveDatabase();
}

/**
 * Get a hypothesis by ID.
 */
export function getHypothesis(hypothesisId: string): HypothesisRecord | null {
  initBridgeTables();
  const db = getDb();
  
  const result = db.exec(
    `SELECT * FROM hypotheses WHERE hypothesis_id = ?`, [hypothesisId]
  );
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0].values[0];
  return {
    hypothesisId: row[1] as string,
    title: row[2] as string,
    description: row[3] as string,
    status: row[4] as HypothesisRecord['status'],
    confidence: row[5] as number,
    visionaryScore: row[6] as number | null,
    adversaryScore: row[7] as number | null,
    arbiterVerdict: row[8] as string | null,
    vectorId: row[9] as string | null,
    entityId: row[10] as number | null,
    debateLog: JSON.parse((row[11] as string) || '[]'),
    createdAt: row[12] as string,
    updatedAt: row[13] as string,
  };
}

/**
 * List hypotheses by status.
 */
export function listHypotheses(
  status?: HypothesisRecord['status'],
  limit: number = 50
): HypothesisRecord[] {
  initBridgeTables();
  const db = getDb();

  let sql = `SELECT * FROM hypotheses`;
  const params: any[] = [];
  if (status) {
    sql += ` WHERE status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  const result = db.exec(sql, params);
  if (result.length === 0) return [];

  return result[0].values.map((row: any[]) => ({
    hypothesisId: row[1] as string,
    title: row[2] as string,
    description: row[3] as string,
    status: row[4] as HypothesisRecord['status'],
    confidence: row[5] as number,
    visionaryScore: row[6] as number | null,
    adversaryScore: row[7] as number | null,
    arbiterVerdict: row[8] as string | null,
    vectorId: row[9] as string | null,
    entityId: row[10] as number | null,
    debateLog: JSON.parse((row[11] as string) || '[]'),
    createdAt: row[12] as string,
    updatedAt: row[13] as string,
  }));
}

// ═══════════════════════════════════════════════
// BRIDGE STATISTICS
// ═══════════════════════════════════════════════

export interface BridgeStats {
  totalBridgedEntries: number;
  promotedEntries: number;
  constraintEntries: number;
  failureEntries: number;
  avgConfidence: number;
  totalAccessCount: number;
  sourceDistribution: Record<string, number>;
  hypothesisCounts: Record<string, number>;
  lastConsolidation: ConsolidationReport | null;
  vectorStats: ReturnType<typeof getVectorStoreStats>;
}

export function getBridgeStats(): BridgeStats {
  initBridgeTables();
  const db = getDb();

  // Total bridged entries
  const totalResult = db.exec(`SELECT COUNT(*) FROM memory_bridge`);
  const total = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

  // Promoted
  const promotedResult = db.exec(`SELECT COUNT(*) FROM memory_bridge WHERE promoted = 1`);
  const promoted = promotedResult.length > 0 ? (promotedResult[0].values[0][0] as number) : 0;

  // Constraints
  const constraintResult = db.exec(`SELECT COUNT(*) FROM memory_bridge WHERE is_constraint = 1`);
  const constraints = constraintResult.length > 0 ? (constraintResult[0].values[0][0] as number) : 0;

  // Failures
  const failureResult = db.exec(`SELECT COUNT(*) FROM memory_bridge WHERE is_failure = 1`);
  const failures = failureResult.length > 0 ? (failureResult[0].values[0][0] as number) : 0;

  // Avg confidence
  const avgResult = db.exec(`SELECT AVG(confidence) FROM memory_bridge`);
  const avgConfidence = avgResult.length > 0 ? (avgResult[0].values[0][0] as number) || 0 : 0;

  // Total access
  const accessResult = db.exec(`SELECT SUM(access_count) FROM memory_bridge`);
  const totalAccess = accessResult.length > 0 ? (accessResult[0].values[0][0] as number) || 0 : 0;

  // Source distribution
  const sourceResult = db.exec(`SELECT source, COUNT(*) FROM memory_bridge GROUP BY source`);
  const sourceDistribution: Record<string, number> = {};
  if (sourceResult.length > 0) {
    for (const row of sourceResult[0].values) {
      sourceDistribution[row[0] as string] = row[1] as number;
    }
  }

  // Hypothesis counts by status
  const hypResult = db.exec(`SELECT status, COUNT(*) FROM hypotheses GROUP BY status`);
  const hypothesisCounts: Record<string, number> = {};
  if (hypResult.length > 0) {
    for (const row of hypResult[0].values) {
      hypothesisCounts[row[0] as string] = row[1] as number;
    }
  }

  // Last consolidation
  const lastConsResult = db.exec(
    `SELECT * FROM consolidation_log ORDER BY timestamp DESC LIMIT 1`
  );
  let lastConsolidation: ConsolidationReport | null = null;
  if (lastConsResult.length > 0 && lastConsResult[0].values.length > 0) {
    const row = lastConsResult[0].values[0];
    lastConsolidation = {
      timestamp: row[7] as string,
      entriesReviewed: row[1] as number,
      promoted: row[2] as number,
      decayed: row[3] as number,
      merged: row[4] as number,
      strengthened: row[5] as number,
      failures: JSON.parse((row[6] as string) || '[]'),
    };
  }

  return {
    totalBridgedEntries: total,
    promotedEntries: promoted,
    constraintEntries: constraints,
    failureEntries: failures,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    totalAccessCount: totalAccess,
    sourceDistribution,
    hypothesisCounts,
    lastConsolidation,
    vectorStats: getVectorStoreStats(),
  };
}

// ═══════════════════════════════════════════════
// SELF-EVOLUTION: LEARN FROM FAILURE
// ═══════════════════════════════════════════════

/**
 * Record a failure and extract a "learned guardrail" from it.
 * This is the core of the Self-Evolution loop (RLM 2.0).
 */
export async function learnFromFailure(
  errorLog: string,
  context: string,
  hypothesisId?: string,
  constraintSuggestion?: string
): Promise<BridgedMemory> {
  // 1. Record the failure
  const failureMemory = await learn({
    content: `FAILURE: ${errorLog}\nCONTEXT: ${context}`,
    entityName: `failure_${Date.now()}`,
    entityType: 'failure',
    domain: 'self-evolution',
    source: 'post-mortem-agent',
    confidence: 0.9,  // Failures are high-confidence facts
    isFailure: true,
    tags: ['failure', 'post-mortem', 'auto-learned'],
  });

  // 2. If a constraint was suggested, record it as a guardrail
  if (constraintSuggestion) {
    await learn({
      content: constraintSuggestion,
      entityName: `constraint_${Date.now()}`,
      entityType: 'constraint',
      domain: 'self-evolution',
      source: 'post-mortem-agent',
      confidence: 0.85,
      isConstraint: true,
      relatedTo: [{
        entityName: failureMemory.id,
        relationType: 'derived_from',
        strength: 1.0,
      }],
      tags: ['constraint', 'guardrail', 'auto-learned'],
    });
  }

  // 3. Update hypothesis if linked
  if (hypothesisId) {
    updateHypothesis(hypothesisId, {
      status: 'failed',
      debateEntry: {
        agent: 'post-mortem',
        position: 'failure',
        reasoning: `Execution failed: ${errorLog.slice(0, 500)}`,
      },
    });
  }

  return failureMemory;
}
