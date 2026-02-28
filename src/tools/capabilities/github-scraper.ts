/**
 * VegaMCP — GitHub Scraper + AI Analysis
 * 
 * Searches GitHub code/repos, fetches files, performs AI analysis,
 * generates synthetic knowledge, and stores everything in the vector store.
 * MCP Tool: github_scraper
 */

import { logAudit } from '../../db/graph-store.js';
import { addToVectorStore, searchVectorStore } from '../../db/vector-store.js';
import { getCircuitBreaker } from '../../security/circuit-breaker.js';

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

const GITHUB_API = 'https://api.github.com';
const RAW_GITHUB = 'https://raw.githubusercontent.com';

function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || null;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'VegaMCP/3.0',
  };
  const token = getGitHubToken();
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

// Rate limit tracking
let rateLimitRemaining = 60;
let rateLimitReset = 0;

function updateRateLimit(response: Response): void {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  if (remaining) rateLimitRemaining = parseInt(remaining);
  if (reset) rateLimitReset = parseInt(reset);
}

function checkGitHubRateLimit(): boolean {
  if (rateLimitRemaining <= 2 && Date.now() / 1000 < rateLimitReset) {
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const githubScraperSchema = {
  name: 'github_scraper',
  description: 'Search GitHub for code, repos, and trending projects. Fetch files, analyze code with AI, generate synthetic knowledge, and store insights in the knowledge engine. Requires GITHUB_TOKEN for higher rate limits (5000/hr vs 60/hr).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['search_code', 'search_repos', 'fetch_file', 'analyze_repo', 'generate_knowledge', 'trending', 'search_issues'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'Search query (for search_code, search_repos, search_issues)' },
      language: { type: 'string', description: 'Programming language filter (e.g., typescript, python, rust)' },
      owner: { type: 'string', description: 'Repository owner (for fetch_file, analyze_repo)' },
      repo: { type: 'string', description: 'Repository name (for fetch_file, analyze_repo)' },
      path: { type: 'string', description: 'File path within repo (for fetch_file)' },
      branch: { type: 'string', description: 'Branch name (for fetch_file)', default: 'main' },
      sort: { type: 'string', enum: ['stars', 'forks', 'updated', 'best-match'], description: 'Sort order', default: 'best-match' },
      per_page: { type: 'number', description: 'Results per page (max 30)', default: 10 },
      stars_min: { type: 'number', description: 'Minimum stars filter (for search_repos)' },
      since: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Trending timeframe', default: 'weekly' },
      store_results: { type: 'boolean', description: 'Store results in knowledge engine', default: false },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// GITHUB API FUNCTIONS
// ═══════════════════════════════════════════════

async function githubFetch(endpoint: string): Promise<{ data: any; error?: string }> {
  if (!checkGitHubRateLimit()) {
    const resetIn = Math.ceil(rateLimitReset - Date.now() / 1000);
    return { data: null, error: `GitHub rate limit exceeded. Resets in ${resetIn}s. Set GITHUB_TOKEN for 5000 req/hr.` };
  }

  const breaker = getCircuitBreaker('github');

  try {
    return await breaker.execute(async () => {
      const response = await fetch(`${GITHUB_API}${endpoint}`, {
        headers: getHeaders(),
      });

      updateRateLimit(response);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`GitHub API error ${response.status}: ${errText.slice(0, 300)}`);
      }

      return { data: await response.json() };
    });
  } catch (err: any) {
    return { data: null, error: `Fetch failed: ${err.message}` };
  }
}

async function searchCode(query: string, language?: string, perPage: number = 10, sort?: string): Promise<any> {
  let q = query;
  if (language) q += ` language:${language}`;

  const sortParam = sort && sort !== 'best-match' ? `&sort=${sort}` : '';
  return githubFetch(`/search/code?q=${encodeURIComponent(q)}&per_page=${Math.min(perPage, 30)}${sortParam}`);
}

async function searchRepos(query: string, language?: string, starsMin?: number, perPage: number = 10, sort: string = 'stars'): Promise<any> {
  let q = query;
  if (language) q += ` language:${language}`;
  if (starsMin) q += ` stars:>=${starsMin}`;

  return githubFetch(`/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&per_page=${Math.min(perPage, 30)}`);
}

async function searchIssues(query: string, language?: string, perPage: number = 10): Promise<any> {
  let q = query;
  if (language) q += ` language:${language}`;
  q += ' is:open';

  return githubFetch(`/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(perPage, 30)}&sort=reactions`);
}

async function fetchFile(owner: string, repo: string, filePath: string, branch: string = 'main'): Promise<{ content: string; error?: string }> {
  const breaker = getCircuitBreaker('github');

  try {
    return await breaker.execute(async () => {
      const url = `${RAW_GITHUB}/${owner}/${repo}/${branch}/${filePath}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'VegaMCP/3.0' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const content = await response.text();
      return { content: content.slice(0, 50000) };
    });
  } catch (err: any) {
    return { content: '', error: `Fetch failed: ${err.message}` };
  }
}

async function getRepoInfo(owner: string, repo: string): Promise<any> {
  return githubFetch(`/repos/${owner}/${repo}`);
}

async function getRepoReadme(owner: string, repo: string): Promise<string> {
  try {
    const { data } = await githubFetch(`/repos/${owner}/${repo}/readme`);
    if (data?.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 10000);
    }
    return '';
  } catch {
    return '';
  }
}

async function getRepoTree(owner: string, repo: string, branch: string = 'main'): Promise<any> {
  return githubFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleGithubScraper(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {
      case 'search_code': {
        if (!args.query) return res({ success: false, error: 'Provide a search query' });

        const { data, error } = await searchCode(args.query, args.language, args.per_page, args.sort);
        if (error) return res({ success: false, error });

        const items = (data.items || []).map((item: any) => ({
          name: item.name,
          path: item.path,
          repo: item.repository?.full_name,
          url: item.html_url,
          score: item.score,
        }));

        // Optionally store in knowledge engine
        if (args.store_results && items.length > 0) {
          for (const item of items.slice(0, 5)) {
            await addToVectorStore(
              `github_code_${item.repo}_${item.path}`.replace(/[^a-z0-9_]/gi, '_'),
              `GitHub Code: ${item.repo}/${item.path}\nURL: ${item.url}\nQuery: ${args.query}`,
              'code_snippets',
              { source: 'github', repo: item.repo, path: item.path, query: args.query }
            );
          }
        }

        logAudit('github_scraper', `search_code: "${args.query}" → ${items.length} results`, true, undefined, Date.now() - start);
        return res({
          success: true,
          query: args.query,
          totalCount: data.total_count,
          results: items,
          rateLimitRemaining,
          stored: args.store_results ? Math.min(items.length, 5) : 0,
        });
      }

      case 'search_repos': {
        if (!args.query) return res({ success: false, error: 'Provide a search query' });

        const { data, error } = await searchRepos(args.query, args.language, args.stars_min, args.per_page, args.sort);
        if (error) return res({ success: false, error });

        const items = (data.items || []).map((item: any) => ({
          name: item.full_name,
          description: item.description?.slice(0, 200),
          stars: item.stargazers_count,
          forks: item.forks_count,
          language: item.language,
          url: item.html_url,
          topics: item.topics?.slice(0, 10),
          updated: item.updated_at,
        }));

        if (args.store_results && items.length > 0) {
          for (const item of items.slice(0, 5)) {
            await addToVectorStore(
              `github_repo_${item.name}`.replace(/[^a-z0-9_]/gi, '_'),
              `GitHub Repo: ${item.name}\n${item.description || ''}\nStars: ${item.stars}\nLanguage: ${item.language}\nTopics: ${(item.topics || []).join(', ')}`,
              'knowledge',
              { source: 'github', type: 'repo', stars: item.stars, language: item.language }
            );
          }
        }

        logAudit('github_scraper', `search_repos: "${args.query}" → ${items.length} results`, true, undefined, Date.now() - start);
        return res({
          success: true,
          query: args.query,
          totalCount: data.total_count,
          results: items,
          rateLimitRemaining,
        });
      }

      case 'search_issues': {
        if (!args.query) return res({ success: false, error: 'Provide a search query' });

        const { data, error } = await searchIssues(args.query, args.language, args.per_page);
        if (error) return res({ success: false, error });

        const items = (data.items || []).map((item: any) => ({
          title: item.title,
          repo: item.repository_url?.split('/').slice(-2).join('/'),
          state: item.state,
          url: item.html_url,
          labels: item.labels?.map((l: any) => l.name).slice(0, 5),
          reactions: item.reactions?.total_count,
          body: item.body?.slice(0, 300),
        }));

        logAudit('github_scraper', `search_issues: "${args.query}" → ${items.length} results`, true, undefined, Date.now() - start);
        return res({ success: true, query: args.query, totalCount: data.total_count, results: items });
      }

      case 'fetch_file': {
        if (!args.owner || !args.repo || !args.path) {
          return res({ success: false, error: 'Provide owner, repo, and path' });
        }

        const { content, error } = await fetchFile(args.owner, args.repo, args.path, args.branch || 'main');
        if (error) return res({ success: false, error });

        if (args.store_results) {
          await addToVectorStore(
            `github_file_${args.owner}_${args.repo}_${args.path}`.replace(/[^a-z0-9_]/gi, '_'),
            content.slice(0, 5000),
            'code_snippets',
            { source: 'github', owner: args.owner, repo: args.repo, path: args.path, branch: args.branch || 'main' }
          );
        }

        logAudit('github_scraper', `fetch_file: ${args.owner}/${args.repo}/${args.path}`, true, undefined, Date.now() - start);
        return res({
          success: true,
          file: `${args.owner}/${args.repo}/${args.path}`,
          branch: args.branch || 'main',
          content: content.slice(0, 15000),
          contentLength: content.length,
          truncated: content.length > 15000,
        });
      }

      case 'analyze_repo': {
        if (!args.owner || !args.repo) {
          return res({ success: false, error: 'Provide owner and repo' });
        }

        // Fetch repo info + README + file tree
        const [repoInfo, readme, tree] = await Promise.all([
          getRepoInfo(args.owner, args.repo),
          getRepoReadme(args.owner, args.repo),
          getRepoTree(args.owner, args.repo),
        ]);

        if (repoInfo.error) return res({ success: false, error: repoInfo.error });

        const repo = repoInfo.data;
        const files = (tree.data?.tree || [])
          .filter((f: any) => f.type === 'blob')
          .map((f: any) => f.path)
          .slice(0, 100);

        // Analyze file structure
        const extensions: Record<string, number> = {};
        for (const file of files) {
          const ext = file.split('.').pop() || 'none';
          extensions[ext] = (extensions[ext] || 0) + 1;
        }

        const analysis = {
          name: repo.full_name,
          description: repo.description,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          license: repo.license?.spdx_id,
          topics: repo.topics,
          created: repo.created_at,
          updated: repo.updated_at,
          size: repo.size,
          openIssues: repo.open_issues_count,
          fileCount: files.length,
          fileExtensions: extensions,
          keyFiles: files.filter((f: string) =>
            /^(readme|license|contributing|changelog|package\.json|cargo\.toml|pyproject\.toml|go\.mod|tsconfig)/i.test(f.split('/').pop() || '')
          ),
          readmePreview: readme.slice(0, 2000),
        };

        if (args.store_results) {
          await addToVectorStore(
            `github_analysis_${args.owner}_${args.repo}`.replace(/[^a-z0-9_]/gi, '_'),
            `Repo Analysis: ${repo.full_name}\n${repo.description || ''}\nLanguage: ${repo.language}\nStars: ${repo.stargazers_count}\n${readme.slice(0, 2000)}`,
            'knowledge',
            { source: 'github_analysis', owner: args.owner, repo: args.repo, stars: repo.stargazers_count }
          );
        }

        logAudit('github_scraper', `analyze_repo: ${args.owner}/${args.repo}`, true, undefined, Date.now() - start);
        return res({ success: true, analysis });
      }

      case 'generate_knowledge': {
        if (!args.query) return res({ success: false, error: 'Provide a query to generate knowledge from' });

        // Search GitHub for relevant code
        const codeResult = await searchCode(args.query, args.language, 5);
        const repoResult = await searchRepos(args.query, args.language, args.stars_min, 5, 'stars');

        if (codeResult.error && repoResult.error) {
          return res({ success: false, error: `Both searches failed: ${codeResult.error}` });
        }

        const codeItems = (codeResult.data?.items || []).slice(0, 5);
        const repoItems = (repoResult.data?.items || []).slice(0, 5);
        let stored = 0;

        // Store code findings as knowledge
        for (const item of codeItems) {
          const result = await addToVectorStore(
            `knowledge_code_${item.repository?.full_name}_${item.path}`.replace(/[^a-z0-9_]/gi, '_'),
            `Code Pattern: ${args.query}\nRepo: ${item.repository?.full_name}\nFile: ${item.path}\nURL: ${item.html_url}`,
            'code_snippets',
            { source: 'github_generated', query: args.query, repo: item.repository?.full_name }
          );
          if (!result.duplicate) stored++;
        }

        // Store repo insights as knowledge
        for (const item of repoItems) {
          const result = await addToVectorStore(
            `knowledge_repo_${item.full_name}`.replace(/[^a-z0-9_]/gi, '_'),
            `Project Inspiration: ${item.full_name}\n${item.description || ''}\nLanguage: ${item.language}\nStars: ${item.stargazers_count}\nTopics: ${(item.topics || []).join(', ')}\nURL: ${item.html_url}`,
            'knowledge',
            { source: 'github_generated', query: args.query, stars: item.stargazers_count }
          );
          if (!result.duplicate) stored++;
        }

        logAudit('github_scraper', `generate_knowledge: "${args.query}" → ${stored} new entries`, true, undefined, Date.now() - start);
        return res({
          success: true,
          query: args.query,
          codeResultsFound: codeItems.length,
          repoResultsFound: repoItems.length,
          newKnowledgeStored: stored,
          message: `Generated ${stored} knowledge entries from GitHub for "${args.query}"`,
        });
      }

      case 'trending': {
        // GitHub doesn't have an official trending API, so we use search sorted by stars + recent creation
        const since = args.since || 'weekly';
        const daysMap: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
        const days = daysMap[since] || 7;
        const date = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

        let q = `created:>${date}`;
        if (args.language) q += ` language:${args.language}`;

        const { data, error } = await githubFetch(
          `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.min(args.per_page || 15, 30)}`
        );

        if (error) return res({ success: false, error });

        const items = (data.items || []).map((item: any) => ({
          name: item.full_name,
          description: item.description?.slice(0, 200),
          stars: item.stargazers_count,
          language: item.language,
          url: item.html_url,
          topics: item.topics?.slice(0, 5),
          created: item.created_at,
        }));

        logAudit('github_scraper', `trending: ${since} → ${items.length} repos`, true, undefined, Date.now() - start);
        return res({
          success: true,
          timeframe: since,
          language: args.language || 'all',
          trending: items,
          rateLimitRemaining,
        });
      }

      default:
        return res({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    logAudit('github_scraper', err.message, false, 'ERROR', Date.now() - start);
    return res({ success: false, error: err.message });
  }
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
