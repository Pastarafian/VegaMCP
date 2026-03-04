import { logAudit } from '../../db/graph-store.js';

export const dataToolkitSchema = {
  name: 'data_toolkit',
  description: `Universal Data & DB Toolkit. Access query optimization metrics, schema evaluations, and data modeling best practices.
Actions:
- query_optimizer: Rate a SQL or NoSQL query for performance and scaling risks.
- schema_analyzer: Evaluate a database schema definition for normalization and indexing.
- data_modeling: Generate data models for specific domains (e.g., e-commerce, social).
- migration_lint: Check database migration scripts for destructive operations.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'query_optimizer', 'schema_analyzer', 'data_modeling', 'migration_lint'
        ],
        description: 'Data toolkit action to perform',
      },
      sql_snippet: { type: 'string', description: 'SQL or database query snippet to analyze' },
      schema_snippet: { type: 'string', description: 'Table schema or migration script' },
      domain: { type: 'string', description: 'Business domain for data modeling' }
    },
    required: ['action'],
  },
};

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

export async function handleDataToolkit(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const start = Date.now();
  
  try {
    switch (args.action) {
      case 'query_optimizer': {
        const query = (args.sql_snippet || '').toLowerCase();
        let score = 100;
        const bottlenecks = [];
        
        if (query.includes('select *')) {
          score -= 20;
          bottlenecks.push('Using SELECT * limits index usage and increases network payload. Select specific columns.');
        }
        if (query.includes('like \'%') && !query.includes('like \'%\\\'')) {
          score -= 30;
          bottlenecks.push('Leading wildcard in LIKE clause (e.g., \'%term\') completely invalidates B-tree indexes, forcing a full table scan.');
        }
        if (query.match(/where.*\b(in|not in)\b\s*\(\s*select/)) {
          score -= 15;
          bottlenecks.push('Subqueries in IN/NOT IN clauses can be notoriously slow. Consider rewriting with EXISTS or JOINs.');
        }

        return ok({
          action: 'query_optimizer',
          rating: {
            efficiency_score: Math.max(score, 10),
            grade: score >= 90 ? 'A' : score >= 70 ? 'B' : 'C'
          },
          bottlenecks,
          ai_analysis: { hint: 'Always run EXPLAIN ANALYZE on queries scoring below 90 to see the exact execution plan.' }
        });
      }

      case 'schema_analyzer': {
        const schema = (args.schema_snippet || '').toLowerCase();
        let score = 100;
        const issues = [];

        if (schema.includes('varchar') && !schema.includes('varchar(')) {
          score -= 10;
          issues.push('Unbounded VARCHAR columns can cause memory allocation issues in some database engines.');
        }
        if (schema.includes('create table') && !schema.includes('primary key')) {
          score -= 40;
          issues.push('Table missing a primary key. Essential for replication and index-organized storage.');
        }
        if (!schema.includes('index') && !schema.includes('key')) {
          score -= 20;
          issues.push('No indexes found beyond the primary key. Foreign keys and filtered columns should be indexed.');
        }

        return ok({
          action: 'schema_analyzer',
          rating: {
            normalization_score: Math.max(score, 10),
            status: score > 80 ? 'Healthy' : 'Needs Tuning'
          },
          issues,
          ai_analysis: { hint: 'Ensure your foreign keys are explicitly indexed to prevent full table scans when JOINing or cascading deletes.' }
        });
      }

      case 'data_modeling': {
        const domain = args.domain || 'e-commerce';
        let tables = [];

        if (domain.toLowerCase().includes('commerce')) {
          tables = [
            'Users (id, email, password_hash, created_at)',
            'Products (id, name, sku, price, inventory_count)',
            'Orders (id, user_id, total_amount, status)',
            'OrderItems (id, order_id, product_id, quantity, price_at_time)'
          ];
        } else {
          tables = [
            'Entities (id, type, created_at)',
            'Attributes (id, entity_id, key, value)',
            'Relations (id, source_id, target_id, relation_type)'
          ];
        }

        return ok({
          action: 'data_modeling',
          domain,
          core_schema: tables,
          ai_analysis: { hint: 'These tables should be mapped to an ORM or managed via migration scripts.' }
        });
      }

      case 'migration_lint': {
        const script = (args.schema_snippet || '').toLowerCase();
        let score = 100;
        const warnings = [];

        if (script.includes('drop table')) {
          score -= 50;
          warnings.push('CRITICAL: DROP TABLE command found. Verify this is intentional and not running in production without a backup.');
        }
        if (script.includes('drop column')) {
          score -= 30;
          warnings.push('CRITICAL: DROP COLUMN command found. This breaks backwards compatibility with old application versions.');
        }
        if (script.includes('alter table') && script.includes('add') && !script.includes('default') && !script.includes('null')) {
          score -= 20;
          warnings.push('Adding a column without a DEFAULT value or NULL allowed will lock the table and fail if data exists.');
        }

        return ok({
          action: 'migration_lint',
          rating: {
            safety_score: Math.max(score, 0),
            status: score === 100 ? 'Safe' : 'Dangerous'
          },
          warnings,
          ai_analysis: { hint: 'Never execute migrations scoring under 100 in production without an explicit DBA review.' }
        });
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - start;
    logAudit('data_toolkit', `${args.action || 'unknown'}: Error: ${error.message}`, false, 'DATA_TOOLKIT_ERROR', elapsed);
    return fail('DATA_TOOLKIT_ERROR', `${args.action} failed: ${error.message}`);
  }
}
