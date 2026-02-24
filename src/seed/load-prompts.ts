/**
 * EasyPrompts Loader — Parses 150+ curated prompt templates from the Briskli/EasyPrompts collection
 * and makes them available via the prompt template library.
 */

import fs from 'fs';

export interface PromptEntry {
  name: string;
  description: string;
  template: string;
  category: string;
  variables: string[];
}

/**
 * Parse the Generated.txt file from EasyPrompts into structured prompt entries.
 */
export function loadEasyPrompts(filePath: string): PromptEntry[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const prompts: PromptEntry[] = [];

  // Pattern: number. **Title:** emoji Name\n * **Prompt:** ...
  const blocks = content.split(/\n\d+\.\s+\*\*Title:\*\*/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const titleMatch = block.match(/^\s*(.+?)[\r\n]/);
    const promptMatch = block.match(/\*\*Prompt:\*\*\s*(.+?)(?:\*\*Context:|$)/s);

    if (!titleMatch || !promptMatch) continue;

    const rawTitle = titleMatch[1].trim().replace(/\*\*/g, '');
    // Remove emoji prefix
    const title = rawTitle.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]\s*/u, '').trim();
    const promptText = promptMatch[1].trim();

    if (!title || !promptText) continue;

    // Detect category from the prompt content
    const category = detectCategory(title, promptText);

    // Extract {{variables}} from the prompt
    const varMatches = promptText.match(/\{\{(\w+)\}\}/g) || [];
    const variables = [...new Set(varMatches.map(v => v.replace(/[{}]/g, '')))];

    // Clean name for use as key
    const name = title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40);

    if (name.length < 3) continue;

    prompts.push({
      name: `ep_${name}`,
      description: title,
      template: promptText,
      category,
      variables,
    });
  }

  return prompts;
}

function detectCategory(title: string, prompt: string): string {
  const lower = (title + ' ' + prompt).toLowerCase();

  if (/architect|schema|api|service|microservice|roadmap/.test(lower)) return 'architecture';
  if (/ui|css|layout|animation|theme|responsive|mobile|design/.test(lower)) return 'ui_design';
  if (/test|spec|coverage|qa/.test(lower)) return 'testing';
  if (/security|auth|encrypt|access|permission/.test(lower)) return 'security';
  if (/performance|optimize|cache|budget|latency/.test(lower)) return 'performance';
  if (/debug|error|fix|bug|crash/.test(lower)) return 'debugging';
  if (/refactor|clean|extract|decouple/.test(lower)) return 'refactoring';
  if (/doc|readme|comment|changelog/.test(lower)) return 'documentation';
  if (/scaffold|implement|build|create|generate/.test(lower)) return 'implementation';
  if (/review|audit|analyze/.test(lower)) return 'review';
  return 'general';
}

/**
 * Get summary stats about loaded prompts.
 */
export function getPromptStats(prompts: PromptEntry[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const p of prompts) {
    stats[p.category] = (stats[p.category] || 0) + 1;
  }
  return stats;
}
