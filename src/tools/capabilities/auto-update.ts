/**
 * VegaMCP — Auto-Update Daemon
 *
 * Periodically refreshes the knowledge base with fresh data from external APIs.
 * Each data source has its own update frequency based on how quickly it changes:
 *
 *   - News/RSS:     Every 4 hours  (news changes constantly)
 *   - arXiv papers: Every 24 hours (daily new papers)
 *   - OpenAlex:     Every 48 hours (citation counts update slowly)
 *   - GitHub trends: Every 12 hours (trending repos change moderately)
 *   - StackExchange: Every 24 hours (top questions stable)
 *   - CrossRef:     Every 168 hours (7 days, citations move slowly)
 *
 * The daemon runs in the background using setInterval and tracks last-run
 * timestamps in SQLite to survive restarts. It's fully non-blocking.
 *
 * MCP Tool: auto_update
 */

import { getDb, saveDatabase, logAudit } from '../../db/graph-store.js';
import { addToVectorStore, getVectorStoreStats } from '../../db/vector-store.js';

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

interface UpdateSource {
  name: string;
  intervalHours: number;
  enabled: boolean;
  fetcher: () => Promise<Array<{ content: string; metadata: Record<string, any> }>>;
}

// Update frequencies (in hours) — tuned per data source
const UPDATE_INTERVALS: Record<string, number> = {
  google_news:   4,     // News changes constantly
  arxiv:         24,    // Daily new papers
  openalex:      48,    // Citation counts are slow-moving
  github_trends: 12,    // Trending repos change moderately
  stackexchange:  24,   // Top questions are fairly stable
  crossref:      168,   // Weekly — citations barely move
};

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const autoUpdateSchema = {
  name: 'auto_update',
  description: 'Auto-update daemon for the knowledge base. Periodically refreshes news, research papers, trending repos, and more from external APIs. Actions: status (check daemon state), run_now (trigger immediate update), configure (change intervals), history (view past updates), start/stop (control daemon).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'run_now', 'configure', 'history', 'start', 'stop'],
        description: 'Action to perform',
      },
      source: {
        type: 'string',
        enum: ['google_news', 'arxiv', 'openalex', 'github_trends', 'stackexchange', 'crossref', 'all'],
        description: 'Which source to update (for run_now) or configure',
      },
      interval_hours: {
        type: 'number',
        description: 'New update interval in hours (for configure)',
      },
      limit: {
        type: 'number',
        description: 'Max entries to show (for history)',
        default: 10,
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// DATABASE TABLE
// ═══════════════════════════════════════════════

let tableInitialized = false;

function initAutoUpdateTable(): void {
  if (tableInitialized) return;
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS auto_update_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      items_added INTEGER DEFAULT 0,
      items_skipped INTEGER DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      run_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS auto_update_config (
      source TEXT PRIMARY KEY,
      interval_hours REAL NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_run TEXT
    );
  `);
  // Seed default config
  for (const [source, interval] of Object.entries(UPDATE_INTERVALS)) {
    db.run(
      `INSERT OR IGNORE INTO auto_update_config (source, interval_hours, enabled) VALUES (?, ?, 1)`,
      [source, interval]
    );
  }
  saveDatabase();
  tableInitialized = true;
}

// ═══════════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════════

async function fetchGoogleNews(): Promise<Array<{ content: string; metadata: Record<string, any> }>> {
  const topics = ['AI artificial intelligence', 'MCP model context protocol', 'LLM GPT Claude'];
  const results: Array<{ content: string; metadata: Record<string, any> }> = [];

  for (const topic of topics) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;

      const xml = await response.text();
      // Extract items from RSS XML
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items.slice(0, 3)) {
        const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || '';
        const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
        const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';

        if (title) {
          results.push({
            content: `[News] ${title} (${pubDate}). Source: ${link}`,
            metadata: { source: 'google_news', topic, date: pubDate, url: link, type: 'news' },
          });
        }
      }
    } catch { /* skip on error */ }
  }

  return results;
}

async function fetchArxiv(): Promise<Array<{ content: string; metadata: Record<string, any> }>> {
  const queries = [
    'large language model agent',
    'retrieval augmented generation',
    'multi-agent system',
    'model context protocol',
    'AI safety alignment',
  ];
  const results: Array<{ content: string; metadata: Record<string, any> }> = [];

  for (const query of queries) {
    try {
      const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) continue;

      const xml = await response.text();
      const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
      for (const entry of entries) {
        const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
        const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() || '';
        const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
        const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() || '';

        if (title && summary) {
          results.push({
            content: `[arXiv] ${title}. ${summary.slice(0, 500)}`,
            metadata: { source: 'arxiv', query, arxiv_id: id, published, type: 'paper' },
          });
        }
      }
    } catch { /* skip */ }
  }

  return results;
}

async function fetchOpenAlex(): Promise<Array<{ content: string; metadata: Record<string, any> }>> {
  const topics = [
    'autonomous AI agents 2025',
    'vision language model',
    'code generation LLM',
    'mixture of experts architecture',
    'AI reasoning chain-of-thought',
  ];
  const results: Array<{ content: string; metadata: Record<string, any> }> = [];

  for (const topic of topics) {
    try {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(topic)}&sort=cited_by_count:desc&per_page=3&select=id,title,publication_year,cited_by_count`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;

      const data: any = await response.json();
      for (const work of (data.results || [])) {
        results.push({
          content: `[OpenAlex] "${work.title}" (${work.publication_year}). Cited ${work.cited_by_count} times.`,
          metadata: { source: 'openalex', topic, year: work.publication_year, citations: work.cited_by_count, type: 'paper' },
        });
      }
    } catch { /* skip */ }
  }

  return results;
}

async function fetchGitHubTrends(): Promise<Array<{ content: string; metadata: Record<string, any> }>> {
  const results: Array<{ content: string; metadata: Record<string, any> }> = [];
  const queries = ['MCP server', 'AI agent framework', 'LLM tool'];

  for (const query of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=3`;
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'VegaMCP/6.0' };
      if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;

      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;

      const data: any = await response.json();
      for (const repo of (data.items || [])) {
        results.push({
          content: `[GitHub Trending] ${repo.full_name}: ${repo.description || 'No description'}. ⭐ ${repo.stargazers_count} stars, ${repo.language || 'unknown'} language, updated ${repo.updated_at?.slice(0, 10)}.`,
          metadata: { source: 'github_trends', repo: repo.full_name, stars: repo.stargazers_count, query, type: 'repo' },
        });
      }
    } catch { /* skip */ }
  }

  return results;
}

async function fetchStackExchange(): Promise<Array<{ content: string; metadata: Record<string, any> }>> {
  const results: Array<{ content: string; metadata: Record<string, any> }> = [];
  const tags = ['machine-learning', 'deep-learning', 'natural-language-processing'];

  for (const tag of tags) {
    try {
      const url = `https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&tagged=${tag}&site=stackoverflow&pagesize=3&filter=withbody`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;

      const data: any = await response.json();
      for (const q of (data.items || [])) {
        results.push({
          content: `[StackOverflow] Q: ${q.title} (Score: ${q.score}, Answers: ${q.answer_count}). Tags: ${q.tags?.join(', ')}`,
          metadata: { source: 'stackexchange', tag, score: q.score, type: 'qa' },
        });
      }
    } catch { /* skip */ }
  }

  return results;
}

async function fetchCrossRef(): Promise<Array<{ content: string; metadata: Record<string, any> }>> {
  const results: Array<{ content: string; metadata: Record<string, any> }> = [];
  const queries = ['artificial intelligence transformer', 'large language model'];

  for (const query of queries) {
    try {
      const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3&sort=is-referenced-by-count&order=desc`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) continue;

      const data: any = await response.json();
      for (const item of (data.message?.items || [])) {
        const title = Array.isArray(item.title) ? item.title[0] : item.title;
        results.push({
          content: `[CrossRef] "${title}" (${item.published?.['date-parts']?.[0]?.[0] || 'unknown'}). Citations: ${item['is-referenced-by-count'] || 0}.`,
          metadata: { source: 'crossref', query, citations: item['is-referenced-by-count'], type: 'paper' },
        });
      }
    } catch { /* skip */ }
  }

  return results;
}

// Source fetcher registry
const FETCHERS: Record<string, () => Promise<Array<{ content: string; metadata: Record<string, any> }>>> = {
  google_news: fetchGoogleNews,
  arxiv: fetchArxiv,
  openalex: fetchOpenAlex,
  github_trends: fetchGitHubTrends,
  stackexchange: fetchStackExchange,
  crossref: fetchCrossRef,
};

// ═══════════════════════════════════════════════
// UPDATE ENGINE
// ═══════════════════════════════════════════════

async function runUpdate(sourceName: string): Promise<{ itemsAdded: number; itemsSkipped: number; durationMs: number; error?: string }> {
  const start = Date.now();
  const fetcher = FETCHERS[sourceName];
  if (!fetcher) return { itemsAdded: 0, itemsSkipped: 0, durationMs: 0, error: `Unknown source: ${sourceName}` };

  try {
    const items = await fetcher();
    let added = 0;
    let skipped = 0;

    for (const item of items) {
      const id = `autoupdate_${sourceName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const result = await addToVectorStore(id, item.content, 'knowledge', {
        ...item.metadata,
        auto_updated: true,
        updated_at: new Date().toISOString(),
      });
      if (result.duplicate) skipped++;
      else added++;
    }

    const durationMs = Date.now() - start;

    // Log to DB
    const db = getDb();
    db.run(
      `INSERT INTO auto_update_log (source, status, items_added, items_skipped, duration_ms) VALUES (?, 'success', ?, ?, ?)`,
      [sourceName, added, skipped, durationMs]
    );
    db.run(`UPDATE auto_update_config SET last_run = datetime('now') WHERE source = ?`, [sourceName]);
    saveDatabase();

    logAudit('auto_update', `${sourceName}: +${added} new, ${skipped} skipped (${durationMs}ms)`, true, undefined, durationMs);

    return { itemsAdded: added, itemsSkipped: skipped, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const db = getDb();
    db.run(
      `INSERT INTO auto_update_log (source, status, error_message, duration_ms) VALUES (?, 'error', ?, ?)`,
      [sourceName, err.message, durationMs]
    );
    saveDatabase();
    return { itemsAdded: 0, itemsSkipped: 0, durationMs, error: err.message };
  }
}

async function checkAndRunDueUpdates(): Promise<void> {
  initAutoUpdateTable();
  const db = getDb();

  const configs = db.exec(`SELECT source, interval_hours, enabled, last_run FROM auto_update_config`);
  if (configs.length === 0) return;

  for (const row of configs[0].values) {
    const source = row[0] as string;
    const interval = row[1] as number;
    const enabled = row[2] as number;
    const lastRun = row[3] as string | null;

    if (!enabled) continue;

    // Check if update is due
    if (lastRun) {
      const lastRunTime = new Date(lastRun + 'Z').getTime();
      const intervalMs = interval * 3600000;
      if (Date.now() - lastRunTime < intervalMs) continue; // Not due yet
    }

    // Run the update (fire-and-forget, non-blocking)
    runUpdate(source).catch(() => {}); // Errors are logged internally
  }
}

// ═══════════════════════════════════════════════
// DAEMON LIFECYCLE
// ═══════════════════════════════════════════════

let daemonInterval: ReturnType<typeof setInterval> | null = null;
const DAEMON_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Start the auto-update daemon.
 * Runs in the background, checking if any sources are due for an update.
 */
export function startAutoUpdateDaemon(): void {
  if (daemonInterval) return; // Already running

  initAutoUpdateTable();

  // Run initial check after 30 seconds (let server start up first)
  setTimeout(() => {
    checkAndRunDueUpdates().catch(() => {});
  }, 30000);

  // Then check every 5 minutes
  daemonInterval = setInterval(() => {
    checkAndRunDueUpdates().catch(() => {});
  }, DAEMON_CHECK_INTERVAL);

  logAudit('auto_update', 'Daemon started — checking for updates every 5 minutes', true);
}

/**
 * Stop the auto-update daemon.
 */
export function stopAutoUpdateDaemon(): void {
  if (daemonInterval) {
    clearInterval(daemonInterval);
    daemonInterval = null;
    logAudit('auto_update', 'Daemon stopped', true);
  }
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleAutoUpdate(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  initAutoUpdateTable();

  try {
    switch (args.action) {
      case 'status': {
        const db = getDb();
        const configs = db.exec(`SELECT source, interval_hours, enabled, last_run FROM auto_update_config`);
        const sources: any[] = [];

        if (configs.length > 0) {
          for (const row of configs[0].values) {
            const lastRun = row[3] as string | null;
            const interval = row[1] as number;
            let nextRunIn = 'never';
            if (lastRun) {
              const nextTime = new Date(lastRun + 'Z').getTime() + interval * 3600000;
              const diffMs = nextTime - Date.now();
              if (diffMs > 0) {
                const hours = Math.floor(diffMs / 3600000);
                const mins = Math.floor((diffMs % 3600000) / 60000);
                nextRunIn = `${hours}h ${mins}m`;
              } else {
                nextRunIn = 'due now';
              }
            } else {
              nextRunIn = 'never run';
            }

            sources.push({
              source: row[0],
              intervalHours: row[1],
              enabled: row[2] === 1,
              lastRun: lastRun || 'never',
              nextRunIn,
            });
          }
        }

        const kbStats = getVectorStoreStats();

        return res({
          success: true,
          daemonRunning: daemonInterval !== null,
          checkIntervalMinutes: DAEMON_CHECK_INTERVAL / 60000,
          knowledgeBase: kbStats,
          sources,
        });
      }

      case 'run_now': {
        const source = args.source || 'all';
        const results: any[] = [];

        if (source === 'all') {
          for (const name of Object.keys(FETCHERS)) {
            const r = await runUpdate(name);
            results.push({ source: name, ...r });
          }
        } else {
          const r = await runUpdate(source);
          results.push({ source, ...r });
        }

        return res({
          success: true,
          action: 'run_now',
          updates: results,
          totalAdded: results.reduce((sum, r) => sum + r.itemsAdded, 0),
          totalSkipped: results.reduce((sum, r) => sum + r.itemsSkipped, 0),
          durationMs: Date.now() - start,
        });
      }

      case 'configure': {
        if (!args.source) return res({ success: false, error: 'Provide source name to configure' });
        if (args.interval_hours !== undefined) {
          const db = getDb();
          db.run(`UPDATE auto_update_config SET interval_hours = ? WHERE source = ?`, [args.interval_hours, args.source]);
          saveDatabase();
        }
        return res({ success: true, action: 'configure', source: args.source, intervalHours: args.interval_hours });
      }

      case 'history': {
        const db = getDb();
        const limit = args.limit || 10;
        const history = db.exec(`SELECT source, status, items_added, items_skipped, error_message, duration_ms, run_at FROM auto_update_log ORDER BY id DESC LIMIT ?`, [limit]);

        const entries: any[] = [];
        if (history.length > 0) {
          for (const row of history[0].values) {
            entries.push({
              source: row[0],
              status: row[1],
              itemsAdded: row[2],
              itemsSkipped: row[3],
              error: row[4] || null,
              durationMs: row[5],
              runAt: row[6],
            });
          }
        }

        return res({ success: true, history: entries, totalEntries: entries.length });
      }

      case 'start': {
        startAutoUpdateDaemon();
        return res({ success: true, message: 'Auto-update daemon started', daemonRunning: true });
      }

      case 'stop': {
        stopAutoUpdateDaemon();
        return res({ success: true, message: 'Auto-update daemon stopped', daemonRunning: false });
      }

      default:
        return res({ success: false, error: `Unknown action: ${args.action}. Use: status, run_now, configure, history, start, stop` });
    }
  } catch (err: any) {
    return res({ success: false, error: err.message });
  }
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
