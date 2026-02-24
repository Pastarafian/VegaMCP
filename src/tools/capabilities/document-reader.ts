/**
 * Document Reader — Parse PDFs, text, Markdown, HTML, and CSV files
 * Pure implementation — no external PDF libs, uses built-in text extraction
 */

import fs from 'fs';
import path from 'path';

function result(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export const documentReaderSchema = {
  name: 'vegamcp_document_reader',
  description: 'Read and parse documents — text, Markdown, HTML, CSV, JSON, and basic PDF text extraction. Actions: read, extract_metadata, search_content, summarize_structure, batch_read.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string' as const,
        enum: ['read', 'extract_metadata', 'search_content', 'summarize_structure', 'batch_read'] as const,
        description: 'Action to perform',
      },
      path: { type: 'string' as const, description: 'Path to the document' },
      paths: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Multiple file paths (for batch_read)',
      },
      query: { type: 'string' as const, description: 'Text to search for (for search_content)' },
      max_length: { type: 'number' as const, description: 'Max characters to return (default 50000)' },
      format: { type: 'string' as const, description: 'Override format detection: text, markdown, html, csv, json, pdf' },
    },
    required: ['action'] as const,
  },
};

export async function handleDocumentReader(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    switch (args.action) {

      case 'read': {
        if (!args.path) throw new Error('path is required');
        const filePath = path.resolve(args.path);
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

        const stat = fs.statSync(filePath);
        if (stat.size > 50 * 1024 * 1024) throw new Error(`File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 50MB)`);

        const ext = path.extname(filePath).toLowerCase();
        const format = args.format || detectFormat(ext);
        const maxLen = args.max_length || 50000;

        let content: string;
        let parsed: any = {};

        switch (format) {
          case 'pdf': {
            const buffer = fs.readFileSync(filePath);
            content = extractPdfText(buffer);
            parsed = { extractionMethod: 'basic-text-stream' };
            break;
          }
          case 'html': {
            const raw = fs.readFileSync(filePath, 'utf-8');
            content = stripHtml(raw);
            parsed = { originalLength: raw.length };
            break;
          }
          case 'csv': {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const { headers, rows, totalRows } = parseCSV(raw, 200);
            content = raw.slice(0, maxLen);
            parsed = { headers, rowCount: totalRows, previewRows: rows.length, sampleRows: rows.slice(0, 5) };
            break;
          }
          case 'json': {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            content = JSON.stringify(data, null, 2).slice(0, maxLen);
            parsed = {
              type: Array.isArray(data) ? 'array' : typeof data,
              topLevelKeys: typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : undefined,
              arrayLength: Array.isArray(data) ? data.length : undefined,
            };
            break;
          }
          case 'markdown': {
            content = fs.readFileSync(filePath, 'utf-8');
            const headings = extractMarkdownHeadings(content);
            parsed = { headings, headingCount: headings.length };
            break;
          }
          default: {
            content = fs.readFileSync(filePath, 'utf-8');
          }
        }

        return result({
          success: true,
          path: filePath,
          format,
          size: stat.size,
          sizeHuman: humanSize(stat.size),
          lines: content.split('\n').length,
          content: content.slice(0, maxLen),
          truncated: content.length > maxLen,
          ...parsed,
        });
      }

      case 'extract_metadata': {
        if (!args.path) throw new Error('path is required');
        const filePath = path.resolve(args.path);
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const content: string | Buffer = ext === '.pdf'
          ? fs.readFileSync(filePath)
          : fs.readFileSync(filePath, 'utf-8');

        const metadata: any = {
          success: true,
          path: filePath,
          name: path.basename(filePath),
          extension: ext,
          format: detectFormat(ext),
          size: stat.size,
          sizeHuman: humanSize(stat.size),
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
        };

        if (typeof content === 'string') {
          metadata.lines = content.split('\n').length;
          metadata.words = content.split(/\s+/).filter((w: string) => w).length;
          metadata.characters = content.length;
        } else {
          metadata.sizeBytes = (content as Buffer).length;
        }

        return result(metadata);
      }

      case 'search_content': {
        if (!args.path) throw new Error('path is required');
        if (!args.query) throw new Error('query is required');

        const filePath = path.resolve(args.path);
        const content = fs.readFileSync(filePath, 'utf-8');
        const query = args.query.toLowerCase();
        const lines = content.split('\n');
        const matches: any[] = [];

        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(query)) {
            matches.push({
              line: idx + 1,
              content: line.trim().slice(0, 200),
              column: line.toLowerCase().indexOf(query) + 1,
            });
          }
        });

        return result({
          success: true,
          path: filePath,
          query: args.query,
          matchCount: matches.length,
          matches: matches.slice(0, 50),
        });
      }

      case 'summarize_structure': {
        if (!args.path) throw new Error('path is required');
        const filePath = path.resolve(args.path);
        const content = fs.readFileSync(filePath, 'utf-8');
        const ext = path.extname(filePath).toLowerCase();
        const format = detectFormat(ext);

        const structure: any = {
          success: true,
          path: filePath,
          format,
          totalLines: content.split('\n').length,
          totalWords: content.split(/\s+/).filter(w => w).length,
        };

        if (format === 'markdown') {
          structure.headings = extractMarkdownHeadings(content);
          structure.codeBlocks = (content.match(/```/g) || []).length / 2;
          structure.links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
          structure.images = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
        } else if (format === 'csv') {
          const { headers, totalRows } = parseCSV(content, 0);
          structure.headers = headers;
          structure.rows = totalRows;
        } else if (format === 'json') {
          const data = JSON.parse(content);
          structure.type = Array.isArray(data) ? 'array' : typeof data;
          if (Array.isArray(data)) {
            structure.length = data.length;
            if (data.length > 0) structure.sampleKeys = Object.keys(data[0]);
          } else if (typeof data === 'object') {
            structure.keys = Object.keys(data);
          }
        }

        return result(structure);
      }

      case 'batch_read': {
        if (!args.paths?.length) throw new Error('paths array is required');
        const maxLen = args.max_length || 20000;
        const results: any[] = [];

        for (const p of args.paths.slice(0, 10)) {
          try {
            const filePath = path.resolve(p);
            if (!fs.existsSync(filePath)) {
              results.push({ path: p, success: false, error: 'File not found' });
              continue;
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            results.push({
              path: filePath,
              success: true,
              format: detectFormat(path.extname(filePath).toLowerCase()),
              lines: content.split('\n').length,
              content: content.slice(0, maxLen),
              truncated: content.length > maxLen,
            });
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

function detectFormat(ext: string): string {
  const map: Record<string, string> = {
    '.md': 'markdown', '.markdown': 'markdown',
    '.html': 'html', '.htm': 'html',
    '.csv': 'csv', '.tsv': 'csv',
    '.json': 'json', '.jsonl': 'json',
    '.pdf': 'pdf',
    '.txt': 'text', '.log': 'text', '.cfg': 'text', '.conf': 'text', '.ini': 'text',
    '.yaml': 'text', '.yml': 'text', '.toml': 'text',
    '.ts': 'text', '.js': 'text', '.py': 'text', '.rs': 'text', '.go': 'text',
    '.tsx': 'text', '.jsx': 'text', '.css': 'text', '.scss': 'text',
    '.sql': 'text', '.sh': 'text', '.bat': 'text', '.ps1': 'text',
    '.xml': 'html', '.svg': 'html',
  };
  return map[ext] || 'text';
}

function extractPdfText(buffer: Buffer): string {
  // Basic PDF text extraction — finds text streams between BT/ET markers
  const content = buffer.toString('latin1');
  const texts: string[] = [];

  // Extract text between parentheses in text streams
  const streamRegex = /stream\s*([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRegex.exec(content)) !== null) {
    const stream = match[1];
    // Find text in parentheses (Tj operator)
    const textRegex = /\(([^)]*)\)/g;
    let textMatch;
    while ((textMatch = textRegex.exec(stream)) !== null) {
      const text = textMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\([()])/g, '$1');
      if (text.trim()) texts.push(text);
    }
  }

  if (texts.length === 0) {
    return '[PDF text extraction found no readable text streams. This PDF may use compressed streams or image-based content. For full PDF parsing, consider using a dedicated PDF tool.]';
  }

  return texts.join(' ');
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkdownHeadings(content: string): any[] {
  const headings: any[] = [];
  content.split('\n').forEach((line, idx) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: idx + 1 });
    }
  });
  return headings;
}

function parseCSV(content: string, maxRows: number): { headers: string[]; rows: any[]; totalRows: number } {
  const lines = content.split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [], totalRows: 0 };

  const headers = parseCSVLine(lines[0]);
  const rows: any[] = [];
  const limit = maxRows > 0 ? Math.min(maxRows, lines.length - 1) : lines.length - 1;

  for (let i = 1; i <= limit; i++) {
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? null; });
    rows.push(row);
  }

  return { headers, rows, totalRows: lines.length - 1 };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
