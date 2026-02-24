/**
 * Database Connector — Query SQLite, CSV, and JSON databases
 * Uses sql.js (already a dependency) for SQLite — no extra deps needed
 */

import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database } from 'sql.js';

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const openDatabases = new Map<string, Database>();
let SQL: any = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export const databaseSchema = {
  name: 'vegamcp_database',
  description: 'Query SQLite databases, CSV, and JSON files. Open databases, run SQL queries, list tables, describe schemas, and export data. Actions: open, query, execute, list_tables, describe_table, close, list_connections, query_csv, query_json.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['open', 'query', 'execute', 'list_tables', 'describe_table', 'close', 'list_connections', 'query_csv', 'query_json'] as const,
        description: 'Action to perform',
      },
      db_id: { type: 'string' as const, description: 'Database connection ID (auto-generated on open, required for other actions)' },
      path: { type: 'string' as const, description: 'Path to database file (for open, query_csv, query_json)' },
      sql: { type: 'string' as const, description: 'SQL query to execute (for query, execute)' },
      table: { type: 'string' as const, description: 'Table name (for describe_table)' },
      limit: { type: 'number' as const, description: 'Max rows to return (default 100)' },
      read_only: { type: 'boolean' as const, description: 'Open in read-only mode (default true)' },
    },
    required: ['action'] as const,
  },
};

export async function handleDatabase(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (args.action) {

      case 'open': {
        if (!args.path) throw new Error('path is required');
        const dbPath = path.resolve(args.path);
        if (!fs.existsSync(dbPath)) throw new Error(`Database file not found: ${dbPath}`);

        const sql = await getSql();
        const buffer = fs.readFileSync(dbPath);
        const db = new sql.Database(buffer);
        const id = args.db_id || `db-${Date.now().toString(36)}`;
        openDatabases.set(id, db);

        // Get basic info
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const tableNames = tables.length ? tables[0].values.map((r: any[]) => r[0]) : [];

        return result({
          success: true,
          db_id: id,
          path: dbPath,
          tables: tableNames,
          tableCount: tableNames.length,
          sizeKB: Math.round(buffer.length / 1024),
          message: `Database opened. Use db_id "${id}" for queries.`,
        });
      }

      case 'query': {
        const db = getDb(args.db_id);
        if (!args.sql) throw new Error('sql is required');

        // Safety checks
        const sqlUpper = args.sql.trim().toUpperCase();
        if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH') &&
            !sqlUpper.startsWith('EXPLAIN') && !sqlUpper.startsWith('PRAGMA')) {
          throw new Error('query action only allows SELECT/WITH/EXPLAIN/PRAGMA statements. Use "execute" for modifications.');
        }

        const limit = args.limit || 100;
        let sql = args.sql.trim();
        if (!sql.toLowerCase().includes('limit') && limit > 0) {
          sql = sql.replace(/;?\s*$/, ` LIMIT ${limit}`);
        }

        const results = db.exec(sql);
        if (!results.length) {
          return result({ success: true, rows: [], columns: [], rowCount: 0 });
        }

        const { columns, values } = results[0];
        const rows = values.map((row: any[]) => {
          const obj: any = {};
          columns.forEach((col, i) => { obj[col] = row[i]; });
          return obj;
        });

        return result({
          success: true,
          columns,
          rows,
          rowCount: rows.length,
          truncated: values.length >= limit,
        });
      }

      case 'execute': {
        const db = getDb(args.db_id);
        if (!args.sql) throw new Error('sql is required');

        db.run(args.sql);
        const changes = (db as any).getRowsModified?.() ?? 0;

        return result({
          success: true,
          rowsAffected: changes,
          message: `Statement executed. ${changes} rows affected.`,
        });
      }

      case 'list_tables': {
        const db = getDb(args.db_id);
        const tables = db.exec(`
          SELECT name, type,
            (SELECT COUNT(*) FROM sqlite_master sm2 WHERE sm2.tbl_name = sm.name AND sm2.type = 'index') as index_count
          FROM sqlite_master sm
          WHERE type IN ('table', 'view')
          ORDER BY type, name
        `);

        const items = tables.length ? tables[0].values.map((r: any[]) => ({
          name: r[0],
          type: r[1],
          indexes: r[2],
        })) : [];

        return result({ success: true, tables: items, count: items.length });
      }

      case 'describe_table': {
        const db = getDb(args.db_id);
        if (!args.table) throw new Error('table is required');

        const info = db.exec(`PRAGMA table_info("${args.table}")`);
        if (!info.length) throw new Error(`Table "${args.table}" not found`);

        const columns = info[0].values.map((r: any[]) => ({
          id: r[0],
          name: r[1],
          type: r[2],
          notNull: !!r[3],
          defaultValue: r[4],
          primaryKey: !!r[5],
        }));

        const rowCount = db.exec(`SELECT COUNT(*) FROM "${args.table}"`);
        const count = rowCount.length ? rowCount[0].values[0][0] : 0;

        const indexes = db.exec(`PRAGMA index_list("${args.table}")`);
        const indexList = indexes.length ? indexes[0].values.map((r: any[]) => ({
          name: r[1],
          unique: !!r[2],
        })) : [];

        return result({
          success: true,
          table: args.table,
          columns,
          rowCount: count,
          indexes: indexList,
          columnCount: columns.length,
        });
      }

      case 'close': {
        if (!args.db_id) throw new Error('db_id is required');
        const db = openDatabases.get(args.db_id);
        if (db) {
          db.close();
          openDatabases.delete(args.db_id);
        }
        return result({ success: true, closed: args.db_id });
      }

      case 'list_connections': {
        const connections = Array.from(openDatabases.keys());
        return result({ success: true, connections, count: connections.length });
      }

      case 'query_csv': {
        if (!args.path) throw new Error('path is required');
        const csvPath = path.resolve(args.path);
        if (!fs.existsSync(csvPath)) throw new Error(`File not found: ${csvPath}`);

        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        if (!lines.length) return result({ success: true, rows: [], columns: [], rowCount: 0 });

        const headers = parseCSVLine(lines[0]);
        const limit = Math.min(args.limit || 100, lines.length - 1);
        const rows = [];
        for (let i = 1; i <= limit && i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: any = {};
          headers.forEach((h, idx) => { row[h] = values[idx] ?? null; });
          rows.push(row);
        }

        return result({
          success: true,
          path: csvPath,
          columns: headers,
          rows,
          rowCount: rows.length,
          totalRows: lines.length - 1,
        });
      }

      case 'query_json': {
        if (!args.path) throw new Error('path is required');
        const jsonPath = path.resolve(args.path);
        if (!fs.existsSync(jsonPath)) throw new Error(`File not found: ${jsonPath}`);

        const content = fs.readFileSync(jsonPath, 'utf-8');
        let data = JSON.parse(content);

        // If data is an object with a single array property, use that
        if (!Array.isArray(data) && typeof data === 'object') {
          const keys = Object.keys(data);
          const arrayKey = keys.find(k => Array.isArray(data[k]));
          if (arrayKey) data = data[arrayKey];
        }

        if (!Array.isArray(data)) {
          return result({ success: true, data, type: typeof data });
        }

        const limit = args.limit || 100;
        const rows = data.slice(0, limit);
        const columns = rows.length ? Object.keys(rows[0]) : [];

        return result({
          success: true,
          path: jsonPath,
          columns,
          rows,
          rowCount: rows.length,
          totalRows: data.length,
        });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function getDb(id: string | undefined): Database {
  if (!id) throw new Error('db_id is required');
  const db = openDatabases.get(id);
  if (!db) throw new Error(`No database with id "${id}". Use "open" first or "list_connections" to see open databases.`);
  return db;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
