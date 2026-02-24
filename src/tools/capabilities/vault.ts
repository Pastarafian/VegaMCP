/**
 * Vault — Obsidian/Notion-style knowledge base management
 * Works with any local markdown vault (Obsidian, Logseq, or custom)
 */

import fs from 'fs';
import path from 'path';

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function getVaultRoot(): string {
  const vaultPath = process.env.VAULT_PATH || process.env.OBSIDIAN_VAULT;
  if (vaultPath && fs.existsSync(vaultPath)) return path.resolve(vaultPath);

  // Default: check common locations
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'Documents', 'Obsidian'),
    path.join(home, 'Documents', 'vault'),
    path.join(home, 'vault'),
    path.join(home, 'notes'),
    path.join(process.env.WORKSPACE_ROOT || '.', 'vault'),
    path.join(process.env.DATA_DIR || './data', 'vault'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return path.resolve(dir);
  }

  // Create default vault in data dir
  const defaultVault = path.resolve(process.env.DATA_DIR || './data', 'vault');
  fs.mkdirSync(defaultVault, { recursive: true });
  return defaultVault;
}

export const vaultSchema = {
  name: 'vegamcp_vault',
  description: 'Obsidian/Notion-style local knowledge base. Read, write, search, and analyze markdown notes with wiki-link support, daily notes, tags, and backlink graphs. Actions: read_note, write_note, search, list_notes, link_graph, daily_note, tags, recent, delete_note.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['read_note', 'write_note', 'search', 'list_notes', 'link_graph', 'daily_note', 'tags', 'recent', 'delete_note'] as const,
        description: 'Action to perform',
      },
      name: { type: 'string' as const, description: 'Note name (without .md extension)' },
      content: { type: 'string' as const, description: 'Note content in Markdown (for write_note)' },
      query: { type: 'string' as const, description: 'Search query (for search)' },
      folder: { type: 'string' as const, description: 'Subfolder within vault (for write_note, list_notes)' },
      tags: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Tags to add to note (for write_note)',
      },
      append: { type: 'boolean' as const, description: 'Append to existing note (for write_note)' },
      limit: { type: 'number' as const, description: 'Max results (default 20)' },
      vault_path: { type: 'string' as const, description: 'Override vault path (defaults to VAULT_PATH or OBSIDIAN_VAULT env)' },
    },
    required: ['action'] as const,
  },
};

export async function handleVault(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const vaultRoot = args.vault_path ? path.resolve(args.vault_path) : getVaultRoot();

    switch (args.action) {

      case 'read_note': {
        if (!args.name) throw new Error('name is required');
        const notePath = resolveNote(vaultRoot, args.name, args.folder);
        if (!fs.existsSync(notePath)) throw new Error(`Note not found: ${args.name}`);

        const content = fs.readFileSync(notePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);
        const links = extractWikiLinks(content);
        const noteTags = extractTags(content);

        return result({
          success: true,
          name: args.name,
          path: notePath,
          frontmatter,
          tags: noteTags,
          links,
          lines: body.split('\n').length,
          content: body,
        });
      }

      case 'write_note': {
        if (!args.name) throw new Error('name is required');
        if (args.content === undefined) throw new Error('content is required');

        const notePath = resolveNote(vaultRoot, args.name, args.folder);
        const dir = path.dirname(notePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        let content = args.content;

        // Add frontmatter if tags provided
        if (args.tags?.length) {
          const fm = `---\ntags: [${args.tags.join(', ')}]\ndate: ${new Date().toISOString().split('T')[0]}\n---\n\n`;
          content = fm + content;
        }

        if (args.append && fs.existsSync(notePath)) {
          const existing = fs.readFileSync(notePath, 'utf-8');
          content = existing + '\n\n' + content;
        }

        fs.writeFileSync(notePath, content, 'utf-8');
        return result({
          success: true,
          name: args.name,
          path: notePath,
          action: args.append ? 'appended' : 'created',
          size: content.length,
        });
      }

      case 'search': {
        if (!args.query) throw new Error('query is required');
        const limit = args.limit || 20;
        const query = args.query.toLowerCase();
        const results: any[] = [];

        walkNotes(vaultRoot, (filePath, relativePath) => {
          if (results.length >= limit) return;
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.toLowerCase().includes(query)) {
              const lines = content.split('\n');
              const matchingLines: any[] = [];
              lines.forEach((line, idx) => {
                if (line.toLowerCase().includes(query)) {
                  matchingLines.push({ line: idx + 1, content: line.trim().slice(0, 150) });
                }
              });
              results.push({
                name: path.basename(filePath, '.md'),
                path: relativePath,
                matchCount: matchingLines.length,
                matches: matchingLines.slice(0, 3),
              });
            }
          } catch { /* skip binary files */ }
        });

        return result({
          success: true,
          query: args.query,
          vault: vaultRoot,
          matchCount: results.length,
          results,
        });
      }

      case 'list_notes': {
        const folder = args.folder ? path.join(vaultRoot, args.folder) : vaultRoot;
        const limit = args.limit || 50;
        const notes: any[] = [];

        walkNotes(folder, (filePath, relativePath) => {
          if (notes.length >= limit) return;
          const stat = fs.statSync(filePath);
          notes.push({
            name: path.basename(filePath, '.md'),
            path: relativePath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        });

        notes.sort((a, b) => b.modified.localeCompare(a.modified));
        return result({ success: true, vault: vaultRoot, notes, count: notes.length });
      }

      case 'link_graph': {
        const graph: Record<string, string[]> = {};
        const backlinks: Record<string, string[]> = {};

        walkNotes(vaultRoot, (filePath) => {
          const name = path.basename(filePath, '.md');
          const content = fs.readFileSync(filePath, 'utf-8');
          const links = extractWikiLinks(content);
          graph[name] = links;

          for (const link of links) {
            if (!backlinks[link]) backlinks[link] = [];
            backlinks[link].push(name);
          }
        });

        // Find orphans (notes with no links to/from)
        const allNotes = Object.keys(graph);
        const orphans = allNotes.filter(n => graph[n].length === 0 && (!backlinks[n] || backlinks[n].length === 0));
        const mostLinked = Object.entries(backlinks)
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 10)
          .map(([name, links]) => ({ name, backlinkCount: links.length }));

        return result({
          success: true,
          totalNotes: allNotes.length,
          totalLinks: Object.values(graph).reduce((s, l) => s + l.length, 0),
          orphans,
          mostLinked,
          graph: Object.fromEntries(Object.entries(graph).slice(0, 50)),
        });
      }

      case 'daily_note': {
        const today = new Date().toISOString().split('T')[0];
        const dailyFolder = path.join(vaultRoot, 'daily');
        const notePath = path.join(dailyFolder, `${today}.md`);

        if (!fs.existsSync(dailyFolder)) fs.mkdirSync(dailyFolder, { recursive: true });

        if (fs.existsSync(notePath)) {
          const content = fs.readFileSync(notePath, 'utf-8');
          if (args.content) {
            // Append to existing daily note
            fs.appendFileSync(notePath, `\n\n---\n\n${args.content}`, 'utf-8');
            return result({
              success: true,
              date: today,
              path: notePath,
              action: 'appended',
              content: fs.readFileSync(notePath, 'utf-8'),
            });
          }
          return result({ success: true, date: today, path: notePath, exists: true, content });
        }

        const template = args.content || `# ${today}\n\n## Tasks\n- [ ] \n\n## Notes\n\n\n## Log\n`;
        fs.writeFileSync(notePath, template, 'utf-8');
        return result({ success: true, date: today, path: notePath, action: 'created', content: template });
      }

      case 'tags': {
        const tagCounts: Record<string, number> = {};

        walkNotes(vaultRoot, (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          const noteTags = extractTags(content);
          for (const tag of noteTags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });

        const sorted = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => ({ tag, count }));

        return result({ success: true, tags: sorted, uniqueTags: sorted.length });
      }

      case 'recent': {
        const limit = args.limit || 10;
        const notes: any[] = [];

        walkNotes(vaultRoot, (filePath, relativePath) => {
          const stat = fs.statSync(filePath);
          notes.push({
            name: path.basename(filePath, '.md'),
            path: relativePath,
            modified: stat.mtime.toISOString(),
            size: stat.size,
          });
        });

        notes.sort((a, b) => b.modified.localeCompare(a.modified));
        return result({ success: true, notes: notes.slice(0, limit), count: Math.min(notes.length, limit) });
      }

      case 'delete_note': {
        if (!args.name) throw new Error('name is required');
        const notePath = resolveNote(vaultRoot, args.name, args.folder);
        if (!fs.existsSync(notePath)) throw new Error(`Note not found: ${args.name}`);
        fs.unlinkSync(notePath);
        return result({ success: true, deleted: args.name, path: notePath });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function resolveNote(vaultRoot: string, name: string, folder?: string): string {
  const sanitized = name.replace(/\.md$/, '') + '.md';
  if (folder) return path.join(vaultRoot, folder, sanitized);
  return path.join(vaultRoot, sanitized);
}

function walkNotes(dir: string, callback: (filePath: string, relativePath: string) => void, baseDir?: string): void {
  if (!fs.existsSync(dir)) return;
  const base = baseDir || dir;
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        walkNotes(fullPath, callback, base);
      } else if (item.name.endsWith('.md')) {
        callback(fullPath, path.relative(base, fullPath));
      }
    }
  } catch { /* permission denied */ }
}

function parseFrontmatter(content: string): { frontmatter: any; body: string } {
  if (!content.startsWith('---')) return { frontmatter: null, body: content };

  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return { frontmatter: null, body: content };

  const fmRaw = content.substring(3, endIdx).trim();
  const body = content.substring(endIdx + 3).trim();

  // Simple YAML-like parsing
  const fm: any = {};
  for (const line of fmRaw.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.substring(0, colon).trim();
      let value: any = line.substring(colon + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((s: string) => s.trim());
      }
      fm[key] = value;
    }
  }

  return { frontmatter: fm, body };
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

function extractTags(content: string): string[] {
  const tags: string[] = [];
  // Match #tag in content (but not in code blocks)
  const regex = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1]);
  }
  // Also from frontmatter
  const { frontmatter } = parseFrontmatter(content);
  if (frontmatter?.tags) {
    if (Array.isArray(frontmatter.tags)) {
      tags.push(...frontmatter.tags);
    }
  }
  return [...new Set(tags)];
}
