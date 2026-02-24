/**
 * Seed Runner — Master startup seeder that loads PolyAlgo algorithms,
 * EasyPrompts templates, and BugTaxonomy into VegaMCP on first launch.
 * 
 * Exposed as a VegaMCP tool so it can also be triggered manually.
 */

import path from 'path';
import { loadPolyAlgoFromDisk, getAlgorithmSummary } from './load-polyalgo.js';
import { loadEasyPrompts, getPromptStats } from './load-prompts.js';
import { getTaxonomyInfo, classifyBug, classifyCommitLog } from './bug-taxonomy.js';

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// Track seeding state
let seeded = false;
let seedResults: any = null;

// In-memory stores for seeded data
let loadedAlgorithms: any[] = [];
let loadedPrompts: any[] = [];

export const seedDataSchema = {
  name: 'vegamcp_seed_data',
  description: 'Manage built-in knowledge libraries: PolyAlgo (160+ algorithms), EasyPrompts (150+ prompt templates), and BugTaxonomy (17 categories, 400+ keywords). Actions: seed (load all), status, search_algorithms, search_prompts, classify_bug, taxonomy_info.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['seed', 'status', 'search_algorithms', 'search_prompts', 'classify_bug', 'classify_commits', 'taxonomy_info'] as const,
        description: 'Action to perform',
      },
      query: { type: 'string' as const, description: 'Search query (for search_algorithms, search_prompts)' },
      text: { type: 'string' as const, description: 'Text to classify (for classify_bug)' },
      lines: { type: 'array' as const, items: { type: 'string' as const }, description: 'Commit messages to classify (for classify_commits)' },
      category: { type: 'string' as const, description: 'Filter by category (for search_algorithms, search_prompts)' },
      limit: { type: 'number' as const, description: 'Max results (default 10)' },
      force: { type: 'boolean' as const, description: 'Force re-seed even if already seeded' },
    },
    required: ['action'] as const,
  },
};

export async function handleSeedData(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (args.action) {

      case 'seed': {
        if (seeded && !args.force) {
          return result({ success: true, message: 'Already seeded. Use force=true to re-seed.', ...seedResults });
        }
        return result(await runSeed());
      }

      case 'status': {
        return result({
          success: true,
          seeded,
          algorithms: loadedAlgorithms.length,
          prompts: loadedPrompts.length,
          taxonomy: getTaxonomyInfo(),
          seedResults,
        });
      }

      case 'search_algorithms': {
        if (!args.query) throw new Error('query is required');
        ensureSeeded();

        const limit = args.limit || 10;
        const query = args.query.toLowerCase();
        const matches = loadedAlgorithms
          .filter(a => {
            const searchable = `${a.metadata.name} ${a.metadata.description} ${a.metadata.tags.join(' ')} ${a.metadata.category} ${a.metadata.subcategory} ${a.metadata.formula}`.toLowerCase();
            if (args.category && a.metadata.category !== args.category) return false;
            return searchable.includes(query);
          })
          .slice(0, limit)
          .map(a => ({
            name: a.metadata.name,
            category: `${a.metadata.category}/${a.metadata.subcategory}`,
            description: a.metadata.description,
            complexity: a.metadata.complexity,
            formula: a.metadata.formula,
            tags: a.metadata.tags,
            code: a.content,
          }));

        return result({ success: true, query: args.query, matches: matches.length, results: matches });
      }

      case 'search_prompts': {
        if (!args.query) throw new Error('query is required');
        ensureSeeded();

        const limit = args.limit || 10;
        const query = args.query.toLowerCase();
        const matches = loadedPrompts
          .filter(p => {
            const searchable = `${p.name} ${p.description} ${p.template} ${p.category}`.toLowerCase();
            if (args.category && p.category !== args.category) return false;
            return searchable.includes(query);
          })
          .slice(0, limit)
          .map(p => ({
            name: p.name,
            description: p.description,
            category: p.category,
            template: p.template.slice(0, 300),
            variables: p.variables,
          }));

        return result({ success: true, query: args.query, matches: matches.length, results: matches });
      }

      case 'classify_bug': {
        if (!args.text) throw new Error('text is required');
        return result({ success: true, input: args.text, ...classifyBug(args.text) });
      }

      case 'classify_commits': {
        if (!args.lines?.length) throw new Error('lines array is required');
        const results = classifyCommitLog(args.lines);
        return result({
          success: true,
          total: args.lines.length,
          classified: results.length,
          results: results.slice(0, args.limit || 50),
        });
      }

      case 'taxonomy_info': {
        return result({ success: true, ...getTaxonomyInfo() });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function ensureSeeded() {
  if (!seeded) runSeedSync();
}

function runSeedSync() {
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

  // Load PolyAlgo
  const polyalgoPath = path.join(workspaceRoot, 'UsefulCode', 'PolyAlgo');
  loadedAlgorithms = loadPolyAlgoFromDisk(polyalgoPath);

  // Load EasyPrompts
  const promptsPath = path.join(workspaceRoot, 'UsefulCode', 'EasyPrompts', 'Generted.txt');
  loadedPrompts = loadEasyPrompts(promptsPath);

  seeded = true;
  seedResults = {
    algorithms: { loaded: loadedAlgorithms.length, summary: getAlgorithmSummary(loadedAlgorithms) },
    prompts: { loaded: loadedPrompts.length, stats: getPromptStats(loadedPrompts) },
    taxonomy: getTaxonomyInfo(),
  };
}

async function runSeed() {
  runSeedSync();
  return { success: true, message: 'Seed complete!', ...seedResults };
}

/**
 * Auto-seed on import (lazy — only loads when first tool call is made).
 */
export function autoSeed(): void {
  try {
    runSeedSync();
    if (loadedAlgorithms.length > 0 || loadedPrompts.length > 0) {
      console.error(`[VegaMCP] Seeded: ${loadedAlgorithms.length} algorithms, ${loadedPrompts.length} prompts, 17 bug categories`);
    }
  } catch { /* silent fail on startup */ }
}
