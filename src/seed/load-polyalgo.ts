/**
 * PolyAlgo Loader — Seeds the knowledge engine with 160+ algorithms from the PolyAlgo library.
 * Reads Python files from UsefulCode/PolyAlgo, extracts individual algorithm blocks,
 * and batch-adds them as searchable code snippets.
 */

import fs from 'fs';
import path from 'path';

export interface AlgorithmSnippet {
  id: string;
  content: string;
  metadata: {
    category: string;
    subcategory: string;
    name: string;
    description: string;
    complexity: string;
    tags: string[];
    formula: string;
    language: string;
    source: string;
  };
}

/**
 * Extract individual algorithm blocks from a PolyAlgo Python file.
 * Each algorithm is delimited by `# === name ===` comments.
 */
function extractAlgorithms(content: string, category: string, subcategory: string): AlgorithmSnippet[] {
  const algorithms: AlgorithmSnippet[] = [];
  const blocks = content.split(/# === /);

  for (const block of blocks) {
    if (!block.trim() || block.startsWith('PolyAlgo Library')) continue;

    const lines = block.split('\n');
    const nameMatch = lines[0]?.match(/^(.+?) ===/);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    const description = lines.find(l => l.includes('Description:'))?.replace(/.*Description:\s*/, '').trim() || '';
    const complexity = lines.find(l => l.includes('Complexity:'))?.replace(/.*Complexity:\s*/, '').trim() || '';
    const tagsLine = lines.find(l => l.includes('Tags:'))?.replace(/.*Tags:\s*/, '').trim() || '';
    const formula = lines.find(l => l.includes('Formula:'))?.replace(/.*Formula:\s*/, '').trim() || '';
    const tags = tagsLine.split(',').map(t => t.trim()).filter(Boolean);

    // Extract the actual code (lines after the metadata comments)
    const codeLines = lines.filter(l => !l.startsWith('#') && l.trim().length > 0);
    const code = codeLines.join('\n').trim();
    if (!code) continue;

    const id = `polyalgo-${category}-${subcategory}-${name}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    algorithms.push({
      id,
      content: `# ${name} — ${description}\n# Complexity: ${complexity}\n# Formula: ${formula}\n# Category: ${category}/${subcategory}\n\n${code}`,
      metadata: {
        category,
        subcategory,
        name,
        description,
        complexity,
        tags,
        formula,
        language: 'python',
        source: 'PolyAlgo Library',
      },
    });
  }

  return algorithms;
}

/**
 * Walk the PolyAlgo directory and extract all algorithms.
 */
export function loadPolyAlgoFromDisk(polyalgoPath: string): AlgorithmSnippet[] {
  if (!fs.existsSync(polyalgoPath)) return [];

  const allAlgorithms: AlgorithmSnippet[] = [];

  try {
    for (const category of fs.readdirSync(polyalgoPath, { withFileTypes: true })) {
      if (!category.isDirectory() || category.name.startsWith('_') || category.name.startsWith('.')) continue;
      const categoryPath = path.join(polyalgoPath, category.name);

      for (const file of fs.readdirSync(categoryPath)) {
        if (!file.endsWith('.py') || file.startsWith('__')) continue;
        const subcategory = file.replace('.py', '');

        try {
          const content = fs.readFileSync(path.join(categoryPath, file), 'utf-8');
          const algorithms = extractAlgorithms(content, category.name, subcategory);
          allAlgorithms.push(...algorithms);
        } catch { /* skip unreadable files */ }
      }
    }
  } catch { /* directory not readable */ }

  return allAlgorithms;
}

/**
 * Get a summary of available algorithms by category.
 */
export function getAlgorithmSummary(algorithms: AlgorithmSnippet[]): Record<string, string[]> {
  const summary: Record<string, string[]> = {};
  for (const algo of algorithms) {
    const key = `${algo.metadata.category}/${algo.metadata.subcategory}`;
    if (!summary[key]) summary[key] = [];
    summary[key].push(algo.metadata.name);
  }
  return summary;
}
