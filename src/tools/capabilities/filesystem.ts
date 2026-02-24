/**
 * Filesystem Tools — Read, write, search, and manage local files
 * Inspired by the official Anthropic MCP filesystem reference server
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Safety: configurable allowed directories
const ALLOWED_ROOTS: string[] = [];

function initAllowedRoots(): void {
  const workspace = process.env.WORKSPACE_ROOT || process.cwd();
  const dataDir = process.env.DATA_DIR || './data';
  ALLOWED_ROOTS.push(
    path.resolve(workspace),
    path.resolve(dataDir),
  );
  // Allow extra roots via env
  const extra = process.env.FS_ALLOWED_ROOTS;
  if (extra) {
    extra.split(';').forEach(r => {
      if (r.trim()) ALLOWED_ROOTS.push(path.resolve(r.trim()));
    });
  }
}

function isPathAllowed(filePath: string): boolean {
  if (ALLOWED_ROOTS.length === 0) initAllowedRoots();
  const resolved = path.resolve(filePath);
  return ALLOWED_ROOTS.some(root => resolved.startsWith(root));
}

function assertAllowed(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!isPathAllowed(resolved)) {
    throw new Error(`Access denied: "${resolved}" is outside allowed directories. Allowed roots: ${ALLOWED_ROOTS.join(', ')}`);
  }
  return resolved;
}

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export const filesystemSchema = {
  name: 'vegamcp_filesystem',
  description: 'Read, write, search, and manage local files. Secure with configurable access controls. Actions: read_file, write_file, list_directory, search_files, get_file_info, move_file, delete_file, create_directory, read_multiple.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['read_file', 'write_file', 'list_directory', 'search_files', 'get_file_info', 'move_file', 'delete_file', 'create_directory', 'read_multiple'] as const,
        description: 'Action to perform',
      },
      path: { type: 'string' as const, description: 'File or directory path' },
      content: { type: 'string' as const, description: 'Content to write (for write_file)' },
      destination: { type: 'string' as const, description: 'Destination path (for move_file)' },
      pattern: { type: 'string' as const, description: 'Search pattern — glob or text (for search_files)' },
      recursive: { type: 'boolean' as const, description: 'Search recursively (default true)' },
      encoding: { type: 'string' as const, description: 'File encoding (default utf-8)' },
      paths: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Multiple file paths (for read_multiple)',
      },
      max_depth: { type: 'number' as const, description: 'Max directory depth for listing' },
      append: { type: 'boolean' as const, description: 'Append to file instead of overwrite (for write_file)' },
    },
    required: ['action'] as const,
  },
};

export async function handleFilesystem(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (args.action) {

      case 'read_file': {
        if (!args.path) throw new Error('path is required');
        const resolved = assertAllowed(args.path);
        const encoding = (args.encoding || 'utf-8') as BufferEncoding;
        const stat = fs.statSync(resolved);
        if (stat.size > 10 * 1024 * 1024) throw new Error(`File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
        const content = fs.readFileSync(resolved, encoding);
        return result({
          success: true,
          path: resolved,
          size: stat.size,
          lines: content.split('\n').length,
          content,
        });
      }

      case 'write_file': {
        if (!args.path) throw new Error('path is required');
        if (args.content === undefined) throw new Error('content is required');
        const resolved = assertAllowed(args.path);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (args.append) {
          fs.appendFileSync(resolved, args.content, 'utf-8');
        } else {
          fs.writeFileSync(resolved, args.content, 'utf-8');
        }
        const stat = fs.statSync(resolved);
        return result({
          success: true,
          path: resolved,
          size: stat.size,
          action: args.append ? 'appended' : 'written',
        });
      }

      case 'list_directory': {
        const dirPath = assertAllowed(args.path || '.');
        const maxDepth = args.max_depth ?? 3;
        const entries = listDir(dirPath, 0, maxDepth);
        return result({
          success: true,
          path: dirPath,
          totalEntries: entries.length,
          entries,
        });
      }

      case 'search_files': {
        if (!args.pattern) throw new Error('pattern is required');
        const searchRoot = assertAllowed(args.path || process.env.WORKSPACE_ROOT || '.');
        const results = searchFiles(searchRoot, args.pattern, args.recursive !== false, 50);
        return result({
          success: true,
          pattern: args.pattern,
          root: searchRoot,
          matchCount: results.length,
          matches: results,
        });
      }

      case 'get_file_info': {
        if (!args.path) throw new Error('path is required');
        const resolved = assertAllowed(args.path);
        const stat = fs.statSync(resolved);
        const info: any = {
          success: true,
          path: resolved,
          name: path.basename(resolved),
          extension: path.extname(resolved),
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          size: stat.size,
          sizeHuman: humanSize(stat.size),
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          permissions: stat.mode.toString(8),
        };
        if (stat.isFile()) {
          const content = fs.readFileSync(resolved);
          info.md5 = crypto.createHash('md5').update(content).digest('hex');
        }
        return result(info);
      }

      case 'move_file': {
        if (!args.path || !args.destination) throw new Error('path and destination are required');
        const src = assertAllowed(args.path);
        const dest = assertAllowed(args.destination);
        fs.renameSync(src, dest);
        return result({ success: true, from: src, to: dest });
      }

      case 'delete_file': {
        if (!args.path) throw new Error('path is required');
        const resolved = assertAllowed(args.path);
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          fs.rmSync(resolved, { recursive: true });
        } else {
          fs.unlinkSync(resolved);
        }
        return result({ success: true, deleted: resolved, type: stat.isDirectory() ? 'directory' : 'file' });
      }

      case 'create_directory': {
        if (!args.path) throw new Error('path is required');
        const resolved = assertAllowed(args.path);
        fs.mkdirSync(resolved, { recursive: true });
        return result({ success: true, created: resolved });
      }

      case 'read_multiple': {
        if (!args.paths || !Array.isArray(args.paths)) throw new Error('paths array is required');
        const results: any[] = [];
        for (const p of args.paths.slice(0, 10)) {
          try {
            const resolved = assertAllowed(p);
            const content = fs.readFileSync(resolved, 'utf-8');
            results.push({ path: resolved, success: true, content: content.slice(0, 50000) });
          } catch (err: any) {
            results.push({ path: p, success: false, error: err.message });
          }
        }
        return result({ success: true, files: results, count: results.length });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return result({ success: false, error: err.message });
  }
}

function listDir(dirPath: string, depth: number, maxDepth: number): any[] {
  if (depth >= maxDepth) return [];
  const entries: any[] = [];
  try {
    for (const item of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const fullPath = path.join(dirPath, item.name);
      const entry: any = { name: item.name, type: item.isDirectory() ? 'directory' : 'file' };
      if (item.isFile()) {
        try {
          const s = fs.statSync(fullPath);
          entry.size = s.size;
          entry.sizeHuman = humanSize(s.size);
        } catch { /* skip */ }
      }
      if (item.isDirectory() && depth < maxDepth - 1) {
        entry.children = listDir(fullPath, depth + 1, maxDepth);
        entry.childCount = entry.children.length;
      }
      entries.push(entry);
    }
  } catch { /* permission denied */ }
  return entries;
}

function searchFiles(root: string, pattern: string, recursive: boolean, limit: number): any[] {
  const results: any[] = [];
  const lowerPattern = pattern.toLowerCase();

  function walk(dir: string): void {
    if (results.length >= limit) return;
    try {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (results.length >= limit) return;
        if (item.name === 'node_modules' || item.name === '.git') continue;
        const fullPath = path.join(dir, item.name);
        if (item.name.toLowerCase().includes(lowerPattern)) {
          results.push({
            path: fullPath,
            name: item.name,
            type: item.isDirectory() ? 'directory' : 'file',
          });
        }
        if (item.isDirectory() && recursive) walk(fullPath);
      }
    } catch { /* permission denied */ }
  }

  walk(root);
  return results;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
