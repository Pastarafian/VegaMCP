/**
 * VegaMCP — Graph Store
 * SQLite-backed persistent knowledge graph using sql.js (pure JS SQLite)
 */

import initSqlJs, { type Database } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';

export interface EntityRow {
  id: number;
  name: string;
  type: string;
  domain: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ObservationRow {
  id: number;
  entity_id: number;
  content: string;
  timestamp: string;
}

export interface RelationRow {
  id: number;
  from_entity_id: number;
  to_entity_id: number;
  from_name?: string;
  to_name?: string;
  type: string;
  strength: number;
  context: string | null;
  created_at: string;
}

export interface EntityWithDetails extends EntityRow {
  observations: string[];
  relations: Array<{
    direction: 'outgoing' | 'incoming';
    relatedEntity: string;
    type: string;
    strength: number;
    context: string | null;
  }>;
}

let dbInstance: Database | null = null;
let dbPath: string = '';

/**
 * Initialize the SQLite database and create tables if needed.
 */
export async function initGraphStore(dataDir: string): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();

  dbPath = path.join(dataDir, 'memory.db');

  // Load existing database or create new
  let db: Database;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'concept',
      domain TEXT NOT NULL DEFAULT 'general',
      source TEXT DEFAULT 'user-request',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity_id INTEGER NOT NULL,
      to_entity_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'related_to',
      strength REAL NOT NULL DEFAULT 1.0,
      context TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      UNIQUE(from_entity_id, to_entity_id, type)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reasoning_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      estimated_cost_usd REAL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      input_summary TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      error_code TEXT,
      duration_ms INTEGER,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(type);`);

  // Enable foreign keys
  db.run(`PRAGMA foreign_keys = ON;`);

  dbInstance = db;
  saveDatabase();
  return db;
}

/**
 * Persist the in-memory database to disk.
 */
export function saveDatabase(): void {
  if (!dbInstance || !dbPath) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, buffer);
}

/**
 * Get the database instance.
 */
export function getDb(): Database {
  if (!dbInstance) throw new Error('Database not initialized. Call initGraphStore() first.');
  return dbInstance;
}

/**
 * Close the database and save to disk.
 */
export function closeGraphStore(): void {
  if (dbInstance) {
    saveDatabase();
    dbInstance.close();
    dbInstance = null;
  }
}

// --- Entity Operations ---

export function createEntity(
  name: string,
  type: string,
  domain: string = 'general',
  source: string = 'user-request'
): EntityRow | null {
  const db = getDb();
  try {
    db.run(
      `INSERT INTO entities (name, type, domain, source) VALUES (?, ?, ?, ?)`,
      [name, type, domain, source]
    );
    saveDatabase();
    const result = db.exec(`SELECT * FROM entities WHERE name = ?`, [name]);
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0];
      return {
        id: row[0] as number,
        name: row[1] as string,
        type: row[2] as string,
        domain: row[3] as string,
        source: row[4] as string,
        created_at: row[5] as string,
        updated_at: row[6] as string,
      };
    }
    return null;
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      // Entity already exists, return existing
      const result = db.exec(`SELECT * FROM entities WHERE name = ?`, [name]);
      if (result.length > 0 && result[0].values.length > 0) {
        const row = result[0].values[0];
        return {
          id: row[0] as number,
          name: row[1] as string,
          type: row[2] as string,
          domain: row[3] as string,
          source: row[4] as string,
          created_at: row[5] as string,
          updated_at: row[6] as string,
        };
      }
    }
    throw err;
  }
}

export function getEntityByName(name: string): EntityRow | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM entities WHERE name = ?`, [name]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const row = result[0].values[0];
  return {
    id: row[0] as number,
    name: row[1] as string,
    type: row[2] as string,
    domain: row[3] as string,
    source: row[4] as string,
    created_at: row[5] as string,
    updated_at: row[6] as string,
  };
}

export function getEntityWithDetails(name: string): EntityWithDetails | null {
  const entity = getEntityByName(name);
  if (!entity) return null;

  const observations = getObservationsForEntity(entity.id);
  const relations = getRelationsForEntity(entity.id, entity.name);

  return {
    ...entity,
    observations: observations.map(o => o.content),
    relations,
  };
}

export function deleteEntity(name: string): boolean {
  const db = getDb();
  const entity = getEntityByName(name);
  if (!entity) return false;

  db.run(`DELETE FROM observations WHERE entity_id = ?`, [entity.id]);
  db.run(`DELETE FROM relations WHERE from_entity_id = ? OR to_entity_id = ?`, [entity.id, entity.id]);
  db.run(`DELETE FROM entities WHERE id = ?`, [entity.id]);
  saveDatabase();
  return true;
}

export function searchEntities(
  query: string,
  domain?: string,
  type?: string,
  limit: number = 10
): EntityWithDetails[] {
  const db = getDb();
  const likeQuery = `%${query}%`;

  let sql = `SELECT DISTINCT e.* FROM entities e
    LEFT JOIN observations o ON o.entity_id = e.id
    WHERE (e.name LIKE ? OR e.type LIKE ? OR o.content LIKE ?)`;
  const params: any[] = [likeQuery, likeQuery, likeQuery];

  if (domain) {
    sql += ` AND e.domain = ?`;
    params.push(domain);
  }
  if (type) {
    sql += ` AND e.type = ?`;
    params.push(type);
  }
  sql += ` ORDER BY e.updated_at DESC LIMIT ?`;
  params.push(limit);

  const result = db.exec(sql, params);
  if (result.length === 0) return [];

  const entities: EntityWithDetails[] = [];
  for (const row of result[0].values) {
    const entity: EntityRow = {
      id: row[0] as number,
      name: row[1] as string,
      type: row[2] as string,
      domain: row[3] as string,
      source: row[4] as string,
      created_at: row[5] as string,
      updated_at: row[6] as string,
    };
    const observations = getObservationsForEntity(entity.id);
    const relations = getRelationsForEntity(entity.id, entity.name);
    entities.push({
      ...entity,
      observations: observations.map(o => o.content),
      relations,
    });
  }
  return entities;
}

export function getAllEntities(domain?: string): EntityRow[] {
  const db = getDb();
  let sql = `SELECT * FROM entities`;
  const params: any[] = [];
  if (domain) {
    sql += ` WHERE domain = ?`;
    params.push(domain);
  }
  sql += ` ORDER BY updated_at DESC`;

  const result = db.exec(sql, params);
  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => ({
    id: row[0] as number,
    name: row[1] as string,
    type: row[2] as string,
    domain: row[3] as string,
    source: row[4] as string,
    created_at: row[5] as string,
    updated_at: row[6] as string,
  }));
}

// --- Observation Operations ---

export function addObservation(entityId: number, content: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO observations (entity_id, content) VALUES (?, ?)`,
    [entityId, content]
  );
  db.run(
    `UPDATE entities SET updated_at = datetime('now') WHERE id = ?`,
    [entityId]
  );
  saveDatabase();
}

export function getObservationsForEntity(entityId: number): ObservationRow[] {
  const db = getDb();
  const result = db.exec(
    `SELECT * FROM observations WHERE entity_id = ? ORDER BY timestamp DESC`,
    [entityId]
  );
  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => ({
    id: row[0] as number,
    entity_id: row[1] as number,
    content: row[2] as string,
    timestamp: row[3] as string,
  }));
}

// --- Relation Operations ---

export function createRelation(
  fromEntityId: number,
  toEntityId: number,
  type: string,
  strength: number = 1.0,
  context?: string
): boolean {
  const db = getDb();
  try {
    db.run(
      `INSERT INTO relations (from_entity_id, to_entity_id, type, strength, context)
       VALUES (?, ?, ?, ?, ?)`,
      [fromEntityId, toEntityId, type, strength, context || null]
    );
    saveDatabase();
    return true;
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      return false; // Relation already exists
    }
    throw err;
  }
}

export function getRelationsForEntity(
  entityId: number,
  entityName: string
): EntityWithDetails['relations'] {
  const db = getDb();

  const outgoing = db.exec(
    `SELECT r.*, e.name as to_name FROM relations r
     JOIN entities e ON e.id = r.to_entity_id
     WHERE r.from_entity_id = ?`,
    [entityId]
  );

  const incoming = db.exec(
    `SELECT r.*, e.name as from_name FROM relations r
     JOIN entities e ON e.id = r.from_entity_id
     WHERE r.to_entity_id = ?`,
    [entityId]
  );

  const results: EntityWithDetails['relations'] = [];

  if (outgoing.length > 0) {
    for (const row of outgoing[0].values) {
      results.push({
        direction: 'outgoing',
        relatedEntity: row[row.length - 1] as string, // to_name is last column
        type: row[3] as string,
        strength: row[4] as number,
        context: row[5] as string | null,
      });
    }
  }

  if (incoming.length > 0) {
    for (const row of incoming[0].values) {
      results.push({
        direction: 'incoming',
        relatedEntity: row[row.length - 1] as string, // from_name is last column
        type: row[3] as string,
        strength: row[4] as number,
        context: row[5] as string | null,
      });
    }
  }

  return results;
}

export function getAllRelations(): Array<{
  from: string;
  to: string;
  type: string;
  strength: number;
  context: string | null;
}> {
  const db = getDb();
  const result = db.exec(`
    SELECT e1.name as from_name, e2.name as to_name, r.type, r.strength, r.context
    FROM relations r
    JOIN entities e1 ON e1.id = r.from_entity_id
    JOIN entities e2 ON e2.id = r.to_entity_id
    ORDER BY r.created_at DESC
  `);

  if (result.length === 0) return [];
  return result[0].values.map((row: any[]) => ({
    from: row[0] as string,
    to: row[1] as string,
    type: row[2] as string,
    strength: row[3] as number,
    context: row[4] as string | null,
  }));
}

// --- Audit Logging ---

export function logAudit(
  toolName: string,
  inputSummary: string,
  success: boolean,
  errorCode?: string,
  durationMs?: number
): void {
  const db = getDb();
  db.run(
    `INSERT INTO audit_log (tool_name, input_summary, success, error_code, duration_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [toolName, inputSummary, success ? 1 : 0, errorCode || null, durationMs || null]
  );
  saveDatabase();
}

// --- Reasoning Usage Logging ---

export function logReasoningUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
  estimatedCostUsd: number
): void {
  const db = getDb();
  db.run(
    `INSERT INTO reasoning_usage (model, prompt_tokens, completion_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?)`,
    [model, promptTokens, completionTokens, estimatedCostUsd]
  );
  saveDatabase();
}
