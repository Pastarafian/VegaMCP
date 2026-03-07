/**
 * VegaMCP — Context7 Documentation Lookup
 * 
 * Provides up-to-date, version-specific library documentation
 * directly inside the IDE. Prevents hallucinated APIs, deprecated
 * function signatures, and outdated syntax.
 * 
 * Features:
 *   - resolve-library-id: Find the correct library from a name
 *   - query-docs: Fetch current docs for a specific library
 *   - Caches results to reduce API calls
 *   - Falls back to npm/PyPI/crates.io README scraping
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const CONTEXT7_API = 'https://context7.com/api';
const CACHE_DIR = path.join(os.homedir(), '.claw-memory', 'context7-cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════
// Cache Layer
// ═══════════════════════════════════════════════════════════════

interface CacheEntry {
  data: any;
  timestamp: number;
  query: string;
}

function getCacheKey(query: string): string {
  return query.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

function getFromCache(query: string): any | null {
  const key = getCacheKey(query);
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  try {
    if (fs.existsSync(cachePath)) {
      const entry: CacheEntry = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.data;
      }
      // Expired — delete
      fs.unlinkSync(cachePath);
    }
  } catch { /* cache miss */ }
  return null;
}

function setCache(query: string, data: any): void {
  const key = getCacheKey(query);
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  try {
    const entry: CacheEntry = { data, timestamp: Date.now(), query };
    fs.writeFileSync(cachePath, JSON.stringify(entry));
  } catch { /* cache write failure is non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════
// Library Resolution
// ═══════════════════════════════════════════════════════════════

interface LibraryInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  language: string;
  homepage?: string;
  repository?: string;
}

// Known library mappings for fast resolution
const KNOWN_LIBRARIES: Record<string, { registry: string; package: string; language: string }> = {
  'react': { registry: 'npm', package: 'react', language: 'javascript' },
  'next': { registry: 'npm', package: 'next', language: 'javascript' },
  'nextjs': { registry: 'npm', package: 'next', language: 'javascript' },
  'vue': { registry: 'npm', package: 'vue', language: 'javascript' },
  'svelte': { registry: 'npm', package: 'svelte', language: 'javascript' },
  'express': { registry: 'npm', package: 'express', language: 'javascript' },
  'fastify': { registry: 'npm', package: 'fastify', language: 'javascript' },
  'zod': { registry: 'npm', package: 'zod', language: 'typescript' },
  'prisma': { registry: 'npm', package: 'prisma', language: 'typescript' },
  'drizzle': { registry: 'npm', package: 'drizzle-orm', language: 'typescript' },
  'tailwind': { registry: 'npm', package: 'tailwindcss', language: 'css' },
  'playwright': { registry: 'npm', package: 'playwright', language: 'typescript' },
  'vite': { registry: 'npm', package: 'vite', language: 'javascript' },
  'esbuild': { registry: 'npm', package: 'esbuild', language: 'javascript' },
  'bun': { registry: 'npm', package: 'bun', language: 'javascript' },
  'deno': { registry: 'deno', package: 'deno', language: 'typescript' },
  'flask': { registry: 'pypi', package: 'flask', language: 'python' },
  'django': { registry: 'pypi', package: 'django', language: 'python' },
  'fastapi': { registry: 'pypi', package: 'fastapi', language: 'python' },
  'pytorch': { registry: 'pypi', package: 'torch', language: 'python' },
  'tensorflow': { registry: 'pypi', package: 'tensorflow', language: 'python' },
  'numpy': { registry: 'pypi', package: 'numpy', language: 'python' },
  'pandas': { registry: 'pypi', package: 'pandas', language: 'python' },
  'langchain': { registry: 'pypi', package: 'langchain', language: 'python' },
  'sqlalchemy': { registry: 'pypi', package: 'sqlalchemy', language: 'python' },
  'tokio': { registry: 'crates', package: 'tokio', language: 'rust' },
  'axum': { registry: 'crates', package: 'axum', language: 'rust' },
  'serde': { registry: 'crates', package: 'serde', language: 'rust' },
};

async function resolveLibraryId(name: string): Promise<LibraryInfo[]> {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
  
  // Check cache first
  const cached = getFromCache(`resolve:${normalized}`);
  if (cached) return cached;

  const results: LibraryInfo[] = [];

  // Try known mapping first
  const known = KNOWN_LIBRARIES[normalized];
  if (known) {
    const info = await fetchRegistryInfo(known.registry, known.package);
    if (info) {
      results.push({ ...info, language: known.language });
    }
  }

  // Try npm
  if (results.length === 0 || !known) {
    const npmInfo = await fetchRegistryInfo('npm', normalized);
    if (npmInfo) results.push(npmInfo);
  }

  // Try PyPI
  if (results.length === 0) {
    const pypiInfo = await fetchRegistryInfo('pypi', normalized);
    if (pypiInfo) results.push(pypiInfo);
  }

  // Try crates.io
  if (results.length === 0) {
    const cratesInfo = await fetchRegistryInfo('crates', normalized);
    if (cratesInfo) results.push(cratesInfo);
  }

  setCache(`resolve:${normalized}`, results);
  return results;
}

async function fetchRegistryInfo(registry: string, pkg: string): Promise<LibraryInfo | null> {
  try {
    let url: string;
    switch (registry) {
      case 'npm':
        url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
        break;
      case 'pypi':
        url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
        break;
      case 'crates':
        url = `https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`;
        break;
      default:
        return null;
    }

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: registry === 'crates' ? { 'User-Agent': 'VegaMCP/7.0' } : {},
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;

    switch (registry) {
      case 'npm':
        return {
          id: `npm:${data.name}`,
          name: data.name,
          description: (data.description || '').substring(0, 200),
          version: data['dist-tags']?.latest || 'unknown',
          language: 'javascript',
          homepage: data.homepage,
          repository: typeof data.repository === 'object' ? data.repository.url : data.repository,
        };
      case 'pypi':
        return {
          id: `pypi:${data.info.name}`,
          name: data.info.name,
          description: (data.info.summary || '').substring(0, 200),
          version: data.info.version,
          language: 'python',
          homepage: data.info.home_page || data.info.project_url,
          repository: data.info.project_urls?.Source || data.info.project_urls?.Repository,
        };
      case 'crates':
        return {
          id: `crates:${data.crate.name}`,
          name: data.crate.name,
          description: (data.crate.description || '').substring(0, 200),
          version: data.crate.max_version || 'unknown',
          language: 'rust',
          homepage: data.crate.homepage,
          repository: data.crate.repository,
        };
    }
  } catch { /* network failure */ }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Documentation Fetching
// ═══════════════════════════════════════════════════════════════

interface DocResult {
  library: string;
  version: string;
  language: string;
  source: string;
  content: string;
  topics?: string[];
  truncated: boolean;
}

async function queryDocs(libraryId: string, topic?: string, maxTokens = 5000): Promise<DocResult> {
  const cacheKey = `docs:${libraryId}:${topic || 'overview'}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // Parse library ID
  const [registry, pkg] = libraryId.includes(':') ? libraryId.split(':', 2) : ['npm', libraryId];

  let content = '';
  let source = '';
  let version = 'latest';
  let language = 'javascript';

  // Strategy 1: Try Context7 API
  try {
    const c7Resp = await fetch(`${CONTEXT7_API}/v1/docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ library: pkg, topic, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(10000),
    });
    if (c7Resp.ok) {
      const c7Data = await c7Resp.json() as any;
      if (c7Data.content) {
        const result: DocResult = {
          library: pkg,
          version: c7Data.version || version,
          language: c7Data.language || language,
          source: 'context7',
          content: c7Data.content.substring(0, maxTokens * 4),
          topics: c7Data.topics,
          truncated: (c7Data.content?.length || 0) > maxTokens * 4,
        };
        setCache(cacheKey, result);
        return result;
      }
    }
  } catch { /* Context7 unavailable, fall back */ }

  // Strategy 2: Fetch README from registry
  try {
    switch (registry) {
      case 'npm': {
        const resp = await fetch(`https://registry.npmjs.org/${pkg}`, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          const data = await resp.json() as any;
          content = data.readme || '';
          version = data['dist-tags']?.latest || 'unknown';
          source = 'npm-readme';
          language = data.keywords?.includes('typescript') ? 'typescript' : 'javascript';
        }
        break;
      }
      case 'pypi': {
        const resp = await fetch(`https://pypi.org/pypi/${pkg}/json`, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
          const data = await resp.json() as any;
          content = data.info.description || '';
          version = data.info.version;
          source = 'pypi-readme';
          language = 'python';
        }
        break;
      }
      case 'crates': {
        const resp = await fetch(`https://crates.io/api/v1/crates/${pkg}`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'VegaMCP/7.0' },
        });
        if (resp.ok) {
          const data = await resp.json() as any;
          content = data.crate.description || '';
          version = data.crate.max_version || 'unknown';
          source = 'crates-readme';
          language = 'rust';
          
          // Also try to get the full README
          if (data.crate.repository) {
            const readmeResp = await fetch(
              data.crate.repository.replace('github.com', 'raw.githubusercontent.com') + '/main/README.md',
              { signal: AbortSignal.timeout(5000) }
            );
            if (readmeResp.ok) content = await readmeResp.text();
          }
        }
        break;
      }
    }
  } catch { /* network failure */ }

  // Filter by topic if specified
  if (topic && content) {
    const topicLower = topic.toLowerCase();
    const sections = content.split(/^#{1,3}\s+/m);
    const matchingSections = sections.filter(s => 
      s.toLowerCase().includes(topicLower)
    );
    if (matchingSections.length > 0) {
      content = matchingSections.join('\n\n---\n\n');
    }
  }

  // Truncate to token budget (rough: 4 chars per token)
  const maxChars = maxTokens * 4;
  const truncated = content.length > maxChars;
  if (truncated) content = content.substring(0, maxChars) + '\n\n... (truncated)';

  const result: DocResult = { library: pkg, version, language, source, content, truncated };
  if (content) setCache(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// MCP Tool Export
// ═══════════════════════════════════════════════════════════════

export function getContext7Tools() {
  return [
    {
      schema: {
        name: 'context7_docs',
        description: 'Look up library documentation. Actions: resolve_library (find library by name), query_docs (fetch docs for a library, optionally filtered by topic).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            action: {
              type: 'string',
              enum: ['resolve_library', 'query_docs'],
              description: 'Action to perform',
            },
            library: {
              type: 'string',
              description: 'Library name (for resolve) or library ID like "npm:react" (for query_docs)',
            },
            topic: {
              type: 'string',
              description: 'Optional: specific topic to search for in docs (e.g. "hooks", "routing", "middleware")',
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum tokens to return (default: 5000)',
            },
          },
          required: ['action', 'library'],
        },
      },
      handler: async (args: any) => {
        try {
          switch (args.action) {
            case 'resolve_library': {
              const results = await resolveLibraryId(args.library);
              if (results.length === 0) {
                return { content: [{ type: 'text', text: `No library found matching "${args.library}". Try a different name.` }] };
              }
              const formatted = results.map(r => 
                `📦 **${r.name}** (${r.id})\n   ${r.description}\n   Version: ${r.version} | Language: ${r.language}${r.homepage ? '\n   Homepage: ' + r.homepage : ''}`
              ).join('\n\n');
              return { content: [{ type: 'text', text: `Found ${results.length} match(es):\n\n${formatted}\n\nUse the library ID (e.g. "${results[0].id}") with query_docs to fetch documentation.` }] };
            }

            case 'query_docs': {
              const result = await queryDocs(args.library, args.topic, args.max_tokens || 5000);
              if (!result.content) {
                return { content: [{ type: 'text', text: `Could not find documentation for "${args.library}". Try resolve_library first.` }] };
              }
              const header = `📖 **${result.library}** v${result.version} (${result.language}) — Source: ${result.source}${result.truncated ? ' ⚠️ Truncated' : ''}\n\n`;
              return { content: [{ type: 'text', text: header + result.content }] };
            }

            default:
              return { content: [{ type: 'text', text: 'Unknown action. Use resolve_library or query_docs.' }], isError: true };
          }
        } catch (error: any) {
          return { content: [{ type: 'text', text: `Context7 error: ${error.message}` }], isError: true };
        }
      },
    },
  ];
}
