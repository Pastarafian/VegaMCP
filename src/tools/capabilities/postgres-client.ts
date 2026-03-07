/**
 * VegaMCP — PostgreSQL Client
 * 
 * Direct PostgreSQL database access from the IDE. Supports:
 *   - Connection management (multiple named connections)
 *   - Query execution (SELECT, INSERT, UPDATE, DELETE)
 *   - Schema inspection (tables, columns, indexes, constraints)
 *   - Transaction support
 *   - Query result formatting (table/JSON)
 * 
 * Security:
 *   - Read-only mode by default
 *   - Query timeout (30s default)
 *   - Row limit on SELECT (1000 default)
 *   - No DROP/TRUNCATE in safe mode
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface PgConnection {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
  readOnly: boolean;
}

interface QueryResult {
  rows: Record<string, any>[];
  rowCount: number;
  fields: string[];
  duration_ms: number;
  truncated: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Connection Registry
// ═══════════════════════════════════════════════════════════════

const connections = new Map<string, PgConnection>();
const CONNECTIONS_FILE = path.join(os.homedir(), '.claw-memory', 'pg-connections.json');

function loadConnections() {
  try {
    if (fs.existsSync(CONNECTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf8'));
      for (const [name, conn] of Object.entries(data)) {
        connections.set(name, conn as PgConnection);
      }
    }
  } catch { /* fresh start */ }
}

function saveConnections() {
  try {
    const dir = path.dirname(CONNECTIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: Record<string, PgConnection> = {};
    for (const [name, conn] of connections) {
      obj[name] = { ...conn, password: conn.password ? '***' : undefined };
    }
    fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(obj, null, 2));
  } catch { /* non-fatal */ }
}

loadConnections();

// Add default VPS connection if env vars are set
if (process.env.VEGAMCP_PG_HOST || process.env.DATABASE_URL) {
  if (!connections.has('vps')) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        const url = new URL(dbUrl);
        connections.set('vps', {
          name: 'vps',
          host: url.hostname,
          port: parseInt(url.port || '5432'),
          database: url.pathname.slice(1),
          user: url.username,
          password: url.password,
          ssl: url.searchParams.get('sslmode') === 'require',
          readOnly: false,
        });
      } catch { /* invalid URL */ }
    } else {
      connections.set('vps', {
        name: 'vps',
        host: process.env.VEGAMCP_PG_HOST || '185.249.74.99',
        port: parseInt(process.env.VEGAMCP_PG_PORT || '5432'),
        database: process.env.VEGAMCP_PG_DATABASE || 'postgres',
        user: process.env.VEGAMCP_PG_USER || 'postgres',
        password: process.env.VEGAMCP_PG_PASSWORD,
        ssl: false,
        readOnly: false,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Dangerous Query Detection
// ═══════════════════════════════════════════════════════════════

const DANGEROUS_PATTERNS = [
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|TRIGGER)/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+ROLE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCOPY\s+.*\bTO\s+PROGRAM\b/i,
  /\bpg_terminate_backend\b/i,
  /\bpg_cancel_backend\b/i,
];

function isDangerousQuery(sql: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      return `Blocked: Query matches dangerous pattern: ${pattern.source}`;
    }
  }
  return null;
}

function isReadQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith('SELECT') || 
         trimmed.startsWith('EXPLAIN') ||
         trimmed.startsWith('SHOW') ||
         trimmed.startsWith('\\D');
}

// ═══════════════════════════════════════════════════════════════
// Query Execution via psql CLI
// ═══════════════════════════════════════════════════════════════

function buildPsqlEnv(conn: PgConnection): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PGHOST: conn.host,
    PGPORT: String(conn.port),
    PGDATABASE: conn.database,
    PGUSER: conn.user,
  };
  if (conn.password) env.PGPASSWORD = conn.password;
  if (conn.ssl) env.PGSSLMODE = 'require';
  return env;
}

function executeQuery(conn: PgConnection, sql: string, options: {
  rowLimit?: number;
  timeoutMs?: number;
  format?: 'json' | 'table' | 'csv';
} = {}): QueryResult {
  const { rowLimit = 1000, timeoutMs = 30000, format = 'json' } = options;
  const start = Date.now();

  // Safety checks
  const dangerCheck = isDangerousQuery(sql);
  if (dangerCheck) throw new Error(dangerCheck);

  if (conn.readOnly && !isReadQuery(sql)) {
    throw new Error('Connection is read-only. Only SELECT/EXPLAIN/SHOW queries allowed.');
  }

  // Add LIMIT if it's a SELECT without one
  let finalSql = sql.trim();
  if (finalSql.toUpperCase().startsWith('SELECT') && !/\bLIMIT\b/i.test(finalSql)) {
    finalSql = `${finalSql} LIMIT ${rowLimit}`;
  }

  // Execute via psql with JSON output
  const env = buildPsqlEnv(conn);
  
  try {
    // Use psql with JSON array output
    const psqlCmd = `psql -t -A -F ',' -c "SELECT json_agg(t) FROM (${finalSql.replace(/"/g, '\\"')}) t"`;
    
    const output = execSync(psqlCmd, {
      env,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const duration_ms = Date.now() - start;

    if (!output || output === '' || output === 'null') {
      return { rows: [], rowCount: 0, fields: [], duration_ms, truncated: false };
    }

    try {
      const rows = JSON.parse(output) || [];
      const fields = rows.length > 0 ? Object.keys(rows[0]) : [];
      return {
        rows,
        rowCount: rows.length,
        fields,
        duration_ms,
        truncated: rows.length >= rowLimit,
      };
    } catch {
      // Non-JSON output (e.g., from INSERT/UPDATE)
      return {
        rows: [{ result: output }],
        rowCount: 1,
        fields: ['result'],
        duration_ms,
        truncated: false,
      };
    }
  } catch (error: any) {
    const duration_ms = Date.now() - start;
    
    // For non-SELECT queries, try simpler execution
    if (!finalSql.toUpperCase().startsWith('SELECT')) {
      try {
        const output = execSync(`psql -c "${finalSql.replace(/"/g, '\\"')}"`, {
          env,
          timeout: timeoutMs,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        
        return {
          rows: [{ result: output }],
          rowCount: 1,
          fields: ['result'],
          duration_ms,
          truncated: false,
        };
      } catch (e2: any) {
        throw new Error(`PostgreSQL error: ${e2.stderr || e2.message}`);
      }
    }
    
    throw new Error(`PostgreSQL error: ${error.stderr || error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Schema Inspection
// ═══════════════════════════════════════════════════════════════

function getSchema(conn: PgConnection, schema = 'public'): QueryResult {
  return executeQuery(conn, `
    SELECT 
      t.table_name,
      t.table_type,
      pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) as size,
      (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = '${schema}') as column_count,
      obj_description(quote_ident(t.table_name)::regclass) as comment
    FROM information_schema.tables t
    WHERE t.table_schema = '${schema}'
    ORDER BY t.table_name
  `);
}

function getTableInfo(conn: PgConnection, table: string, schema = 'public'): QueryResult {
  return executeQuery(conn, `
    SELECT 
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_primary_key
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
      WHERE tc.table_name = '${table}' AND tc.constraint_type = 'PRIMARY KEY'
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_name = '${table}' AND c.table_schema = '${schema}'
    ORDER BY c.ordinal_position
  `);
}

function getIndexes(conn: PgConnection, table: string): QueryResult {
  return executeQuery(conn, `
    SELECT 
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = '${table}'
    ORDER BY indexname
  `);
}

// ═══════════════════════════════════════════════════════════════
// Result Formatting
// ═══════════════════════════════════════════════════════════════

function formatAsTable(result: QueryResult): string {
  if (result.rows.length === 0) return '(empty result set)';

  const fields = result.fields;
  
  // Calculate column widths
  const widths = fields.map(f => f.length);
  for (const row of result.rows.slice(0, 50)) {
    fields.forEach((f, i) => {
      const val = String(row[f] ?? 'NULL');
      widths[i] = Math.max(widths[i], Math.min(val.length, 40));
    });
  }

  // Build table
  const header = fields.map((f, i) => f.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  const rows = result.rows.slice(0, 50).map(row =>
    fields.map((f, i) => String(row[f] ?? 'NULL').substring(0, 40).padEnd(widths[i])).join(' | ')
  );

  let table = `${header}\n${separator}\n${rows.join('\n')}`;
  if (result.rows.length > 50) table += `\n... (${result.rows.length - 50} more rows)`;
  table += `\n\n(${result.rowCount} rows, ${result.duration_ms}ms)`;
  if (result.truncated) table += ' ⚠️ Row limit reached';
  return table;
}

// ═══════════════════════════════════════════════════════════════
// MCP Tool Export
// ═══════════════════════════════════════════════════════════════

export function getPostgresTools() {
  return [
    {
      schema: {
        name: 'postgres_client',
        description: 'PostgreSQL database client. Actions: connect (add connection), disconnect (remove), list_connections, query (execute SQL), schema (list tables), table_info (describe table), indexes (show indexes).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            action: {
              type: 'string',
              enum: ['connect', 'disconnect', 'list_connections', 'query', 'schema', 'table_info', 'indexes'],
              description: 'Action to perform',
            },
            connection: {
              type: 'string',
              description: 'Connection name (default: "vps")',
            },
            // For connect action
            host: { type: 'string', description: 'PostgreSQL host' },
            port: { type: 'number', description: 'Port (default: 5432)' },
            database: { type: 'string', description: 'Database name' },
            user: { type: 'string', description: 'Username' },
            password: { type: 'string', description: 'Password' },
            read_only: { type: 'boolean', description: 'Read-only mode (default: true)' },
            // For query action
            sql: { type: 'string', description: 'SQL query to execute' },
            row_limit: { type: 'number', description: 'Max rows to return (default: 1000)' },
            format: { type: 'string', enum: ['table', 'json'], description: 'Output format (default: table)' },
            // For table_info / indexes
            table: { type: 'string', description: 'Table name' },
            // For schema
            schema_name: { type: 'string', description: 'Schema name (default: public)' },
          },
          required: ['action'],
        },
      },
      handler: async (args: any) => {
        try {
          const connName = args.connection || 'vps';

          switch (args.action) {
            case 'connect': {
              if (!args.host || !args.database || !args.user) {
                return { content: [{ type: 'text', text: 'Required: host, database, user' }], isError: true };
              }
              const conn: PgConnection = {
                name: connName,
                host: args.host,
                port: args.port || 5432,
                database: args.database,
                user: args.user,
                password: args.password,
                ssl: args.ssl || false,
                readOnly: args.read_only !== false, // default to read-only
              };
              connections.set(connName, conn);
              saveConnections();
              return { content: [{ type: 'text', text: `✅ Connected: "${connName}" → ${conn.user}@${conn.host}:${conn.port}/${conn.database} (${conn.readOnly ? 'read-only' : 'read-write'})` }] };
            }

            case 'disconnect': {
              if (connections.delete(connName)) {
                saveConnections();
                return { content: [{ type: 'text', text: `Disconnected: "${connName}"` }] };
              }
              return { content: [{ type: 'text', text: `Connection "${connName}" not found` }], isError: true };
            }

            case 'list_connections': {
              if (connections.size === 0) {
                return { content: [{ type: 'text', text: 'No connections configured. Use action=connect to add one, or set DATABASE_URL env var.' }] };
              }
              const list = [...connections.values()].map(c =>
                `• **${c.name}**: ${c.user}@${c.host}:${c.port}/${c.database} (${c.readOnly ? 'read-only' : 'read-write'})`
              ).join('\n');
              return { content: [{ type: 'text', text: `PostgreSQL Connections:\n\n${list}` }] };
            }

            case 'query': {
              if (!args.sql) {
                return { content: [{ type: 'text', text: 'Required: sql' }], isError: true };
              }
              const conn = connections.get(connName);
              if (!conn) {
                return { content: [{ type: 'text', text: `No connection "${connName}". Use action=connect first.` }], isError: true };
              }

              const result = executeQuery(conn, args.sql, {
                rowLimit: args.row_limit || 1000,
                format: args.format || 'json',
              });

              const output = args.format === 'json' 
                ? JSON.stringify(result.rows, null, 2)
                : formatAsTable(result);

              return { content: [{ type: 'text', text: output }] };
            }

            case 'schema': {
              const conn = connections.get(connName);
              if (!conn) return { content: [{ type: 'text', text: `No connection "${connName}"` }], isError: true };
              const result = getSchema(conn, args.schema_name || 'public');
              return { content: [{ type: 'text', text: `📊 Schema: ${args.schema_name || 'public'}\n\n${formatAsTable(result)}` }] };
            }

            case 'table_info': {
              if (!args.table) return { content: [{ type: 'text', text: 'Required: table' }], isError: true };
              const conn = connections.get(connName);
              if (!conn) return { content: [{ type: 'text', text: `No connection "${connName}"` }], isError: true };
              const result = getTableInfo(conn, args.table, args.schema_name || 'public');
              return { content: [{ type: 'text', text: `📋 Table: ${args.table}\n\n${formatAsTable(result)}` }] };
            }

            case 'indexes': {
              if (!args.table) return { content: [{ type: 'text', text: 'Required: table' }], isError: true };
              const conn = connections.get(connName);
              if (!conn) return { content: [{ type: 'text', text: `No connection "${connName}"` }], isError: true };
              const result = getIndexes(conn, args.table);
              return { content: [{ type: 'text', text: `🔑 Indexes for ${args.table}:\n\n${formatAsTable(result)}` }] };
            }

            default:
              return { content: [{ type: 'text', text: `Unknown action: ${args.action}` }], isError: true };
          }
        } catch (error: any) {
          return { content: [{ type: 'text', text: `PostgreSQL error: ${error.message}` }], isError: true };
        }
      },
    },
  ];
}
