/**
 * VegaMCP — Web Search Engine
 * 
 * Powerful web search with Tavily API (primary) and SearXNG fallback.
 * Includes URL content extraction, auto-summarization, and batch search.
 * MCP Tool: web_search
 */

import { logAudit } from '../../db/graph-store.js';
import { addToVectorStore } from '../../db/vector-store.js';
import { getCircuitBreaker } from '../../security/circuit-breaker.js';

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

function getTavilyApiKey(): string | null {
  return process.env.TAVILY_API_KEY || null;
}

function getSearxngUrl(): string | null {
  return process.env.SEARXNG_URL || null;
}

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const webSearchSchema = {
  name: 'web_search',
  description: 'Search the web using Tavily AI Search API (primary) or SearXNG (fallback). Extract clean content from URLs, auto-summarize long pages, and optionally store findings in the knowledge engine. Set TAVILY_API_KEY or SEARXNG_URL in .env.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'read_url', 'summarize_url', 'batch_search'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'Search query (for search, batch_search)' },
      url: { type: 'string', description: 'URL to read (for read_url, summarize_url)' },
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Multiple URLs to read (for batch_search)',
      },
      num_results: { type: 'number', description: 'Number of results (max 20)', default: 5 },
      search_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Search depth (Tavily). Advanced provides better results but uses more credits.',
        default: 'basic',
      },
      include_answer: { type: 'boolean', description: 'Include AI-generated answer summary (Tavily)', default: true },
      max_content_length: { type: 'number', description: 'Max content length per page (chars)', default: 5000 },
      store_results: { type: 'boolean', description: 'Store results in knowledge engine', default: false },
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Multiple queries for batch_search (max 5)',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// TAVILY SEARCH
// ═══════════════════════════════════════════════

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  score?: number;
  publishedDate?: string;
}

async function tavilySearch(
  query: string,
  numResults: number = 5,
  searchDepth: string = 'basic',
  includeAnswer: boolean = true
): Promise<{ results: SearchResult[]; answer?: string; error?: string }> {
  const apiKey = getTavilyApiKey();
  if (!apiKey) return { results: [], error: 'TAVILY_API_KEY not configured' };

  const breaker = getCircuitBreaker('tavily');

  try {
    return await breaker.execute(async () => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: searchDepth,
          max_results: Math.min(numResults, 20),
          include_answer: includeAnswer,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Tavily API error ${response.status}: ${errText.slice(0, 300)}`);
      }

      const data: any = await response.json();
      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 500) || '',
        score: r.score,
        publishedDate: r.published_date,
      }));

      return { results, answer: data.answer };
    });
  } catch (err: any) {
    return { results: [], error: `Tavily search failed: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// SEARXNG SEARCH (Self-hosted fallback)
// ═══════════════════════════════════════════════

async function searxngSearch(
  query: string,
  numResults: number = 5
): Promise<{ results: SearchResult[]; error?: string }> {
  const baseUrl = getSearxngUrl();
  if (!baseUrl) return { results: [], error: 'SEARXNG_URL not configured' };

  const breaker = getCircuitBreaker('searxng');

  try {
    return await breaker.execute(async () => {
      const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general&pageno=1`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`SearXNG error ${response.status}`);
      }

      const data: any = await response.json();
      const results: SearchResult[] = (data.results || []).slice(0, numResults).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 500) || '',
        publishedDate: r.publishedDate,
      }));

      return { results };
    });
  } catch (err: any) {
    return { results: [], error: `SearXNG search failed: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
// CONTENT EXTRACTION
// ═══════════════════════════════════════════════

/**
 * Fetch a URL and extract clean text content.
 * Uses a simple but effective HTML-to-text approach.
 */
async function extractUrlContent(url: string, maxLength: number = 5000): Promise<{ content: string; title: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VegaMCP/3.0; +https://vegamcp.local)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { content: '', title: '', error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    // If JSON, return formatted
    if (contentType.includes('json')) {
      try {
        const json = JSON.parse(rawText);
        return { content: JSON.stringify(json, null, 2).slice(0, maxLength), title: url };
      } catch {
        return { content: rawText.slice(0, maxLength), title: url };
      }
    }

    // If plain text, return as-is
    if (contentType.includes('text/plain')) {
      return { content: rawText.slice(0, maxLength), title: url };
    }

    // HTML → clean text
    const title = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || url;

    // Remove script, style, nav, header, footer
    let cleaned = rawText
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '');

    // Convert block elements to newlines
    cleaned = cleaned
      .replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th|blockquote|pre|section|article)[^>]*>/gi, '\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Collapse multiple newlines
      .replace(/  +/g, ' ') // Collapse spaces
      .trim();

    return {
      title,
      content: cleaned.slice(0, maxLength),
    };
  } catch (err: any) {
    const msg = err.name === 'AbortError' ? 'Request timed out (15s)' : err.message;
    return { content: '', title: '', error: msg };
  }
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleWebSearch(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {
      case 'search': {
        if (!args.query) return res({ success: false, error: 'Provide a search query' });

        // Try Tavily first, then SearXNG
        let searchResult = await tavilySearch(
          args.query,
          args.num_results || 5,
          args.search_depth || 'basic',
          args.include_answer !== false
        );

        if (searchResult.error && getSearxngUrl()) {
          const fallback = await searxngSearch(args.query, args.num_results || 5);
          if (!fallback.error) {
            searchResult = { results: fallback.results };
          }
        }

        if (searchResult.error && searchResult.results.length === 0) {
          return res({ success: false, error: searchResult.error, hint: 'Set TAVILY_API_KEY or SEARXNG_URL in .env' });
        }

        // Store results if requested
        if (args.store_results && searchResult.results.length > 0) {
          for (const r of searchResult.results.slice(0, 5)) {
            await addToVectorStore(
              `web_search_${r.url}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 100),
              `Web: ${r.title}\n${r.snippet}\nURL: ${r.url}`,
              'knowledge',
              { source: 'web_search', query: args.query, url: r.url }
            );
          }
        }

        logAudit('web_search', `search: "${args.query}" → ${searchResult.results.length} results`, true, undefined, Date.now() - start);
        return res({
          success: true,
          query: args.query,
          answer: searchResult.answer || undefined,
          results: searchResult.results,
          provider: getTavilyApiKey() ? 'tavily' : (getSearxngUrl() ? 'searxng' : 'none'),
          durationMs: Date.now() - start,
        });
      }

      case 'read_url': {
        if (!args.url) return res({ success: false, error: 'Provide a URL to read' });

        const maxLen = args.max_content_length || 5000;
        const { content, title, error } = await extractUrlContent(args.url, maxLen);
        if (error) return res({ success: false, error, url: args.url });

        if (args.store_results) {
          await addToVectorStore(
            `web_page_${args.url}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 100),
            `${title}\n${content.slice(0, 3000)}`,
            'knowledge',
            { source: 'web_read', url: args.url, title }
          );
        }

        logAudit('web_search', `read_url: ${args.url}`, true, undefined, Date.now() - start);
        return res({
          success: true,
          url: args.url,
          title,
          content,
          contentLength: content.length,
          truncated: content.length >= maxLen,
          durationMs: Date.now() - start,
        });
      }

      case 'summarize_url': {
        if (!args.url) return res({ success: false, error: 'Provide a URL to summarize' });

        const { content, title, error } = await extractUrlContent(args.url, 10000);
        if (error) return res({ success: false, error, url: args.url });

        // Create a condensed summary by extracting key sentences
        const sentences = content
          .split(/[.!?]\s+/)
          .filter(s => s.length > 30 && s.length < 300)
          .slice(0, 15);

        const summary = sentences.join('. ') + '.';

        if (args.store_results) {
          await addToVectorStore(
            `web_summary_${args.url}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 100),
            `Summary of: ${title}\n${summary}`,
            'knowledge',
            { source: 'web_summary', url: args.url, title }
          );
        }

        logAudit('web_search', `summarize_url: ${args.url}`, true, undefined, Date.now() - start);
        return res({
          success: true,
          url: args.url,
          title,
          summary,
          originalLength: content.length,
          summaryLength: summary.length,
          compressionRatio: `${Math.round((1 - summary.length / content.length) * 100)}%`,
          durationMs: Date.now() - start,
        });
      }

      case 'batch_search': {
        const queries = args.queries;
        if (!queries || !Array.isArray(queries) || queries.length === 0) {
          return res({ success: false, error: 'Provide queries array' });
        }

        const batchResults: any[] = [];
        for (const query of queries.slice(0, 5)) { // Max 5 queries per batch
          let searchResult = await tavilySearch(query, args.num_results || 3, 'basic', true);

          if (searchResult.error && getSearxngUrl()) {
            const fallback = await searxngSearch(query, args.num_results || 3);
            if (!fallback.error) searchResult = { results: fallback.results };
          }

          batchResults.push({
            query,
            answer: searchResult.answer,
            results: searchResult.results.slice(0, 3),
            error: searchResult.results.length === 0 ? searchResult.error : undefined,
          });

          // Store if requested
          if (args.store_results) {
            for (const r of searchResult.results.slice(0, 2)) {
              await addToVectorStore(
                `web_batch_${r.url}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 100),
                `Web: ${r.title}\n${r.snippet}\nURL: ${r.url}`,
                'knowledge',
                { source: 'web_batch_search', query, url: r.url }
              );
            }
          }
        }

        logAudit('web_search', `batch_search: ${queries.length} queries`, true, undefined, Date.now() - start);
        return res({
          success: true,
          totalQueries: queries.length,
          results: batchResults,
          durationMs: Date.now() - start,
        });
      }

      default:
        return res({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    logAudit('web_search', err.message, false, 'ERROR', Date.now() - start);
    return res({ success: false, error: err.message });
  }
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
