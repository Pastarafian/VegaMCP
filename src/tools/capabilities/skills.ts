/**
 * VegaMCP — Skills Engine
 * 
 * Advanced skills system (inspired by Anthropic's agent-skills but better).
 * Skills are self-contained instruction folders that teach agents HOW to do things.
 * 
 * Features beyond Anthropic's:
 * - Auto-activation triggers (skills activate based on context)
 * - Multi-file skills with scripts, examples, resources
 * - Runtime skill creation from conversations
 * - Skill scoring & usage analytics
 * - Skill chaining (one skill can invoke another)
 * - Import from GitHub repos
 * - Vector search for skill discovery
 * - Version tracking
 * 
 * MCP Tool: vegamcp_skills
 */

import fs from 'node:fs';
import path from 'node:path';
import { logAudit } from '../../db/graph-store.js';
import { addToVectorStore, searchVectorStore } from '../../db/vector-store.js';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  triggers?: string[];         // Phrases that auto-activate this skill
  category?: string;           // e.g. coding, research, design, testing
  dependencies?: string[];     // Other skills this depends on
  tags?: string[];
  created?: string;
  updated?: string;
  usageCount?: number;
  averageRating?: number;
}

interface Skill {
  metadata: SkillMetadata;
  instructions: string;        // The main SKILL.md content
  files: Record<string, string>; // Additional files (examples, scripts, etc.)
  directory: string;           // Path to skill directory
}

// ═══════════════════════════════════════════════
// IN-MEMORY SKILL REGISTRY
// ═══════════════════════════════════════════════

const skillRegistry: Map<string, Skill> = new Map();
let skillsDir: string = '';
let initialized = false;

function getSkillsDir(): string {
  if (!skillsDir) {
    skillsDir = path.resolve(process.env.DATA_DIR || './data', 'skills');
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
  }
  return skillsDir;
}

/**
 * Parse SKILL.md frontmatter (YAML-style)
 */
function parseSkillMd(content: string): { metadata: Partial<SkillMetadata>; instructions: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { metadata: {}, instructions: content };
  }

  const yaml = frontmatterMatch[1];
  const instructions = frontmatterMatch[2].trim();

  const metadata: Partial<SkillMetadata> = {};
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'triggers' || key === 'tags' || key === 'dependencies') {
        // Parse as array
        try {
          (metadata as any)[key] = JSON.parse(value);
        } catch {
          (metadata as any)[key] = value.split(',').map((s: string) => s.trim());
        }
      } else if (key === 'usageCount' || key === 'averageRating') {
        (metadata as any)[key] = parseFloat(value);
      } else {
        (metadata as any)[key] = value.trim();
      }
    }
  }

  return { metadata, instructions };
}

/**
 * Generate SKILL.md from metadata + instructions
 */
function generateSkillMd(metadata: SkillMetadata, instructions: string): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${metadata.name}`);
  lines.push(`description: ${metadata.description}`);
  if (metadata.version) lines.push(`version: ${metadata.version}`);
  if (metadata.author) lines.push(`author: ${metadata.author}`);
  if (metadata.category) lines.push(`category: ${metadata.category}`);
  if (metadata.triggers?.length) lines.push(`triggers: ${JSON.stringify(metadata.triggers)}`);
  if (metadata.tags?.length) lines.push(`tags: ${JSON.stringify(metadata.tags)}`);
  if (metadata.dependencies?.length) lines.push(`dependencies: ${JSON.stringify(metadata.dependencies)}`);
  lines.push(`created: ${metadata.created || new Date().toISOString()}`);
  lines.push(`updated: ${metadata.updated || new Date().toISOString()}`);
  lines.push(`usageCount: ${metadata.usageCount || 0}`);
  lines.push('---');
  lines.push('');
  lines.push(instructions);
  return lines.join('\n');
}

/**
 * Load all skills from the skills directory
 */
function loadAllSkills(): void {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        loadSkillFromDir(path.join(dir, entry.name));
      } catch (err: any) {
        console.error(`[Skills] Failed to load skill ${entry.name}: ${err.message}`);
      }
    }
  }
  initialized = true;
}

function loadSkillFromDir(skillDir: string): void {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return;

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const { metadata, instructions } = parseSkillMd(content);

  if (!metadata.name) {
    metadata.name = path.basename(skillDir);
  }

  // Load additional files
  const files: Record<string, string> = {};
  const allFiles = fs.readdirSync(skillDir, { withFileTypes: true });
  for (const f of allFiles) {
    if (f.isFile() && f.name !== 'SKILL.md') {
      try {
        files[f.name] = fs.readFileSync(path.join(skillDir, f.name), 'utf-8');
      } catch { /* skip binary files */ }
    }
    if (f.isDirectory()) {
      // Load subdirectory files too
      const subFiles = fs.readdirSync(path.join(skillDir, f.name), { withFileTypes: true });
      for (const sf of subFiles) {
        if (sf.isFile()) {
          try {
            files[`${f.name}/${sf.name}`] = fs.readFileSync(path.join(skillDir, f.name, sf.name), 'utf-8');
          } catch { /* skip */ }
        }
      }
    }
  }

  const skill: Skill = {
    metadata: {
      name: metadata.name!,
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      author: metadata.author,
      triggers: metadata.triggers || [],
      category: metadata.category || 'general',
      dependencies: metadata.dependencies || [],
      tags: metadata.tags || [],
      created: metadata.created,
      updated: metadata.updated,
      usageCount: metadata.usageCount || 0,
      averageRating: metadata.averageRating,
    },
    instructions,
    files,
    directory: skillDir,
  };

  skillRegistry.set(skill.metadata.name, skill);
}

function ensureInitialized(): void {
  if (!initialized) loadAllSkills();
}

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const skillsSchema = {
  name: 'vegamcp_skills',
  description: 'Advanced skills engine. Skills are self-contained instruction folders that teach agents HOW to do tasks. Features: auto-activation triggers, multi-file skills, vector search, usage tracking, skill chaining, and runtime creation. Better than Anthropic\'s skill system.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update', 'delete', 'search', 'activate', 'rate', 'import_from_url', 'seed_defaults'],
        description: 'Action to perform',
      },
      name: { type: 'string', description: 'Skill name (for get, create, update, delete, activate, rate)' },
      description: { type: 'string', description: 'Skill description (for create)' },
      instructions: { type: 'string', description: 'Skill instructions in markdown (for create, update)' },
      category: { type: 'string', description: 'Skill category (for create, list filter)' },
      triggers: {
        type: 'array',
        description: 'Auto-activation trigger phrases (for create, update)',
        items: { type: 'string' },
      },
      tags: {
        type: 'array',
        description: 'Tags for categorization (for create, update)',
        items: { type: 'string' },
      },
      query: { type: 'string', description: 'Search query (for search)' },
      context: { type: 'string', description: 'Current conversation context to match triggers (for activate)' },
      rating: { type: 'number', description: 'Rating 1-5 (for rate)' },
      url: { type: 'string', description: 'GitHub raw URL to import SKILL.md from (for import_from_url)' },
      files: {
        type: 'object',
        description: 'Additional files to include in the skill (for create). Key=filename, value=content',
        properties: {},
      },
      limit: { type: 'number', description: 'Max results', default: 20 },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleSkills(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  ensureInitialized();

  try {
    switch (args.action) {
      case 'list': {
        const skills = Array.from(skillRegistry.values())
          .filter(s => !args.category || s.metadata.category === args.category)
          .slice(0, args.limit || 50)
          .map(s => ({
            name: s.metadata.name,
            description: s.metadata.description,
            category: s.metadata.category,
            version: s.metadata.version,
            triggers: s.metadata.triggers,
            tags: s.metadata.tags,
            usageCount: s.metadata.usageCount,
            fileCount: Object.keys(s.files).length,
          }));

        logAudit('skills', `list: ${skills.length} skills`, true, undefined, Date.now() - start);
        return result({ success: true, skills, totalSkills: skillRegistry.size });
      }

      case 'get': {
        if (!args.name) return result({ success: false, error: 'Provide skill name' });
        const skill = skillRegistry.get(args.name);
        if (!skill) return result({ success: false, error: `Skill "${args.name}" not found` });

        // Increment usage
        skill.metadata.usageCount = (skill.metadata.usageCount || 0) + 1;
        saveSkillMetadata(skill);

        logAudit('skills', `get: ${args.name}`, true, undefined, Date.now() - start);
        return result({
          success: true,
          skill: {
            ...skill.metadata,
            instructions: skill.instructions,
            files: Object.keys(skill.files),
            directory: skill.directory,
          },
        });
      }

      case 'create': {
        if (!args.name) return result({ success: false, error: 'Provide skill name' });
        if (!args.instructions) return result({ success: false, error: 'Provide skill instructions' });
        if (skillRegistry.has(args.name)) return result({ success: false, error: `Skill "${args.name}" already exists. Use update.` });

        const metadata: SkillMetadata = {
          name: args.name,
          description: args.description || '',
          version: '1.0.0',
          author: 'vegamcp',
          triggers: args.triggers || [],
          category: args.category || 'general',
          tags: args.tags || [],
          dependencies: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          usageCount: 0,
        };

        // Create directory
        const dir = path.join(getSkillsDir(), args.name);
        fs.mkdirSync(dir, { recursive: true });

        // Write SKILL.md
        const skillMd = generateSkillMd(metadata, args.instructions);
        fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd, 'utf-8');

        // Write additional files
        if (args.files && typeof args.files === 'object') {
          for (const [filename, content] of Object.entries(args.files)) {
            const filePath = path.join(dir, filename);
            const fileDir = path.dirname(filePath);
            if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
            fs.writeFileSync(filePath, content as string, 'utf-8');
          }
        }

        // Register
        const skill: Skill = {
          metadata,
          instructions: args.instructions,
          files: args.files || {},
          directory: dir,
        };
        skillRegistry.set(args.name, skill);

        // Index in vector store for search
        await addToVectorStore(
          `skill:${args.name}`,
          `${args.name}: ${args.description || ''}\n${args.instructions.slice(0, 500)}`,
          'knowledge',
          { type: 'skill', name: args.name, category: args.category }
        );

        logAudit('skills', `create: ${args.name}`, true, undefined, Date.now() - start);
        return result({ success: true, action: 'created', name: args.name, directory: dir });
      }

      case 'update': {
        if (!args.name) return result({ success: false, error: 'Provide skill name' });
        const existing = skillRegistry.get(args.name);
        if (!existing) return result({ success: false, error: `Skill "${args.name}" not found` });

        if (args.instructions) existing.instructions = args.instructions;
        if (args.description) existing.metadata.description = args.description;
        if (args.triggers) existing.metadata.triggers = args.triggers;
        if (args.tags) existing.metadata.tags = args.tags;
        if (args.category) existing.metadata.category = args.category;
        existing.metadata.updated = new Date().toISOString();
        existing.metadata.version = incrementVersion(existing.metadata.version || '1.0.0');

        // Write updated SKILL.md
        const skillMd = generateSkillMd(existing.metadata, existing.instructions);
        fs.writeFileSync(path.join(existing.directory, 'SKILL.md'), skillMd, 'utf-8');

        // Write additional files
        if (args.files && typeof args.files === 'object') {
          for (const [filename, content] of Object.entries(args.files)) {
            const filePath = path.join(existing.directory, filename);
            const fileDir = path.dirname(filePath);
            if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
            fs.writeFileSync(filePath, content as string, 'utf-8');
            existing.files[filename] = content as string;
          }
        }

        logAudit('skills', `update: ${args.name} → v${existing.metadata.version}`, true, undefined, Date.now() - start);
        return result({ success: true, action: 'updated', name: args.name, version: existing.metadata.version });
      }

      case 'delete': {
        if (!args.name) return result({ success: false, error: 'Provide skill name' });
        const skill = skillRegistry.get(args.name);
        if (!skill) return result({ success: false, error: `Skill "${args.name}" not found` });

        // Remove directory
        try { fs.rmSync(skill.directory, { recursive: true, force: true }); } catch { /* */ }
        skillRegistry.delete(args.name);

        logAudit('skills', `delete: ${args.name}`, true, undefined, Date.now() - start);
        return result({ success: true, action: 'deleted', name: args.name });
      }

      case 'search': {
        if (!args.query) return result({ success: false, error: 'Provide search query' });

        // First: vector search
        const vectorResults = searchVectorStore(args.query, 'knowledge', 10, 0.1)
          .filter(r => r.metadata?.type === 'skill');

        // Second: text search across skill names, descriptions, triggers
        const textResults: string[] = [];
        const queryLower = args.query.toLowerCase();
        for (const [name, skill] of skillRegistry) {
          if (name.includes(queryLower) ||
              skill.metadata.description.toLowerCase().includes(queryLower) ||
              skill.metadata.triggers?.some(t => t.toLowerCase().includes(queryLower)) ||
              skill.metadata.tags?.some(t => t.toLowerCase().includes(queryLower)) ||
              skill.instructions.toLowerCase().includes(queryLower)) {
            textResults.push(name);
          }
        }

        // Merge results (deduplicate)
        const resultNames = new Set<string>();
        for (const vr of vectorResults) {
          if (vr.metadata?.name) resultNames.add(vr.metadata.name);
        }
        for (const name of textResults) {
          resultNames.add(name);
        }

        const skills = Array.from(resultNames)
          .slice(0, args.limit || 10)
          .map(name => {
            const s = skillRegistry.get(name);
            return s ? {
              name: s.metadata.name,
              description: s.metadata.description,
              category: s.metadata.category,
              triggers: s.metadata.triggers,
              usageCount: s.metadata.usageCount,
            } : null;
          })
          .filter(Boolean);

        return result({ success: true, query: args.query, results: skills, totalMatches: resultNames.size });
      }

      case 'activate': {
        // Find skills that match the current context via triggers
        const context = (args.context || '').toLowerCase();
        if (!context) return result({ success: false, error: 'Provide context to match against triggers' });

        const matched: Array<{ name: string; trigger: string; description: string; instructions: string }> = [];

        for (const [, skill] of skillRegistry) {
          for (const trigger of skill.metadata.triggers || []) {
            if (context.includes(trigger.toLowerCase())) {
              skill.metadata.usageCount = (skill.metadata.usageCount || 0) + 1;
              matched.push({
                name: skill.metadata.name,
                trigger,
                description: skill.metadata.description,
                instructions: skill.instructions,
              });
              break; // Only match once per skill
            }
          }
        }

        logAudit('skills', `activate: ${matched.length} skills matched context`, true, undefined, Date.now() - start);
        return result({ success: true, activatedSkills: matched, matched: matched.length });
      }

      case 'rate': {
        if (!args.name) return result({ success: false, error: 'Provide skill name' });
        if (!args.rating || args.rating < 1 || args.rating > 5) return result({ success: false, error: 'Provide rating 1-5' });
        
        const skill = skillRegistry.get(args.name);
        if (!skill) return result({ success: false, error: `Skill "${args.name}" not found` });

        const current = skill.metadata.averageRating || 0;
        const count = skill.metadata.usageCount || 1;
        skill.metadata.averageRating = Math.round(((current * (count - 1) + args.rating) / count) * 10) / 10;
        saveSkillMetadata(skill);

        return result({ success: true, name: args.name, newRating: skill.metadata.averageRating });
      }

      case 'import_from_url': {
        if (!args.url) return result({ success: false, error: 'Provide URL to a raw SKILL.md file' });

        try {
          const resp = await fetch(args.url, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return result({ success: false, error: `Failed to fetch: ${resp.status}` });
          const content = await resp.text();

          const { metadata, instructions } = parseSkillMd(content);
          const name = args.name || metadata.name || 'imported-skill-' + Date.now();

          // Create via the standard create path
          return handleSkills({
            action: 'create',
            name,
            description: metadata.description || 'Imported skill',
            instructions,
            category: metadata.category || 'imported',
            triggers: metadata.triggers || [],
            tags: [...(metadata.tags || []), 'imported'],
          });
        } catch (err: any) {
          return result({ success: false, error: `Import failed: ${err.message}` });
        }
      }

      case 'seed_defaults': {
        const seeded = await seedDefaultSkills();
        logAudit('skills', `seed_defaults: ${seeded} skills seeded`, true, undefined, Date.now() - start);
        return result({ success: true, action: 'seeded', skillsCreated: seeded });
      }

      default:
        return result({ success: false, error: `Unknown action: ${args.action}. Use: list, get, create, update, delete, search, activate, rate, import_from_url, seed_defaults` });
    }
  } catch (err: any) {
    logAudit('skills', err.message, false, 'ERROR', Date.now() - start);
    return result({ success: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function saveSkillMetadata(skill: Skill): void {
  try {
    const skillMd = generateSkillMd(skill.metadata, skill.instructions);
    fs.writeFileSync(path.join(skill.directory, 'SKILL.md'), skillMd, 'utf-8');
  } catch { /* non-critical */ }
}

function incrementVersion(ver: string): string {
  const parts = ver.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

async function seedDefaultSkills(): Promise<number> {
  const defaults: Array<{ name: string; description: string; category: string; triggers: string[]; tags: string[]; instructions: string }> = [
    {
      name: 'code-review',
      description: 'Systematic code review with security, performance, and correctness checks',
      category: 'coding',
      triggers: ['review this code', 'code review', 'check this code', 'review my code'],
      tags: ['code', 'review', 'quality'],
      instructions: `# Code Review Skill

## When to Use
Activate when asked to review code, check for bugs, or evaluate code quality.

## Process
1. **Read the code** — understand structure, purpose, and context
2. **Check correctness** — logic errors, edge cases, off-by-one, null handling
3. **Check security** — injection, XSS, auth bypass, secrets in code
4. **Check performance** — N+1 queries, memory leaks, unnecessary allocations
5. **Check style** — naming, formatting, documentation, DRY violations
6. **Grade severity** — 🔴 Critical, 🟡 Warning, 🟢 Suggestion

## Output Format
\`\`\`
🔴 [CRITICAL] Line X: Description
🟡 [WARNING] Line Y: Description  
🟢 [SUGGESTION] Line Z: Description

Overall: X/10 — Summary
\`\`\`

## Guidelines
- Be specific — point to exact lines
- Explain WHY something is an issue
- Provide fix suggestions
- Rank issues by severity
- Keep feedback constructive`,
    },
    {
      name: 'debug-error',
      description: 'Systematic error debugging methodology',
      category: 'coding',
      triggers: ['debug this', 'fix this error', 'why is this failing', 'help me debug', 'troubleshoot'],
      tags: ['debug', 'error', 'troubleshoot'],
      instructions: `# Debug Error Skill

## When to Use
Activate when a user encounters an error, crash, or unexpected behavior.

## Process
1. **Reproduce** — Understand the exact steps to trigger the error
2. **Read error** — Parse stack trace, error code, and message
3. **Isolate** — Narrow down to the specific file, function, and line
4. **Investigate** — Check inputs, state, and dependencies at the failure point
5. **Hypothesize** — Form 2-3 possible root causes, ranked by likelihood
6. **Fix** — Implement the fix, explain why
7. **Verify** — Confirm the fix resolves the issue without side effects
8. **Document** — Store the fix pattern for future reference

## Guidelines
- Always read the FULL stack trace
- Check for common culprits: null/undefined, async race conditions, incorrect types
- Use search_graph to check if this error pattern was seen before
- Store the fix using create_entities for future reference`,
    },
    {
      name: 'architecture-design',
      description: 'System architecture design following best practices',
      category: 'architecture',
      triggers: ['design the architecture', 'system design', 'architect this', 'how should I structure'],
      tags: ['architecture', 'design', 'system'],
      instructions: `# Architecture Design Skill

## When to Use
Activate when designing new systems, modules, or significant features.

## Process
1. **Requirements gathering** — What problem are we solving? What are the constraints?
2. **Component identification** — Break into modules/services
3. **Data modeling** — Define entities, relationships, and data flow
4. **API design** — Define interfaces between components
5. **Technology selection** — Choose appropriate tools and frameworks
6. **Scalability plan** — How will this grow? What are the bottlenecks?
7. **Security review** — Authentication, authorization, data protection
8. **Diagram** — Create ASCII architecture diagram

## Output Format
\`\`\`
## Architecture: [System Name]

### Components
1. [Component] — [Responsibility]

### Data Flow
[Diagram]

### Technology Choices
| Component | Technology | Rationale |

### Trade-offs
- [Decision]: [Pros] vs [Cons]
\`\`\``,
    },
    {
      name: 'test-generation',
      description: 'Generate comprehensive test suites with edge cases',
      category: 'testing',
      triggers: ['write tests', 'generate tests', 'test this', 'add tests', 'unit test'],
      tags: ['testing', 'unit-tests', 'quality'],
      instructions: `# Test Generation Skill

## When to Use
Activate when asked to write tests for code, or when implementing new features.

## Process
1. **Analyze the code** — Identify public API, input types, output types
2. **Happy path tests** — Normal usage, expected inputs
3. **Edge cases** — Boundary values, empty inputs, max values
4. **Error cases** — Invalid inputs, null/undefined, network failures
5. **Integration tests** — Component interactions, data flow
6. **Performance tests** — If relevant, test under load

## Guidelines
- Name tests descriptively: "should [expected behavior] when [condition]"
- One assertion per test when possible
- Use AAA pattern: Arrange, Act, Assert
- Mock external dependencies
- Test both success AND failure paths
- Include at least one edge case per function`,
    },
    {
      name: 'security-audit',
      description: 'Security vulnerability assessment and hardening',
      category: 'security',
      triggers: ['security audit', 'check security', 'find vulnerabilities', 'security review', 'is this secure'],
      tags: ['security', 'audit', 'vulnerability'],
      instructions: `# Security Audit Skill

## When to Use
Activate when reviewing code for security issues or hardening a system.

## Checklist
1. **Injection** — SQL, NoSQL, command, LDAP, XPath
2. **Authentication** — Weak passwords, missing MFA, session management
3. **Authorization** — IDOR, privilege escalation, RBAC bypass
4. **XSS** — Stored, reflected, DOM-based
5. **CSRF** — Missing tokens, SameSite cookies
6. **Secrets** — Hardcoded keys, tokens in URLs, .env exposure
7. **Dependencies** — Known CVEs in packages
8. **Data exposure** — PII in logs, overly broad API responses
9. **Cryptography** — Weak algorithms, improper key management
10. **Configuration** — Debug mode in prod, CORS misconfiguration

## Severity Levels
- 🔴 CRITICAL — Immediate exploitation possible
- 🟠 HIGH — Exploitation with some effort
- 🟡 MEDIUM — Limited impact or requires specific conditions
- 🟢 LOW — Best practice improvement`,
    },
    {
      name: 'refactoring',
      description: 'Code refactoring with systematic improvement patterns',
      category: 'coding',
      triggers: ['refactor this', 'clean up this code', 'improve this code', 'make this better'],
      tags: ['refactor', 'clean-code', 'improvement'],
      instructions: `# Refactoring Skill

## When to Use
Activate when code works but needs improvement in readability, performance, or maintainability.

## Process
1. **Understand** — Don't change what you don't understand
2. **Identify smells** — Long functions, deep nesting, duplicated code, magic numbers
3. **Plan** — List specific refactoring operations
4. **Execute** — Apply one refactoring at a time
5. **Verify** — Ensure behavior is preserved after each change
6. **Document** — Explain what changed and why

## Common Patterns
- Extract function — Break long functions into focused ones
- Extract variable — Name complex expressions
- Rename — Make names reveal intent
- Remove duplication — DRY without over-abstracting
- Simplify conditionals — Guard clauses, strategy pattern
- Reduce nesting — Early returns, inversion

## Rules
- Never refactor and add features simultaneously
- Every refactoring must preserve existing behavior
- If there are no tests, write them FIRST`,
    },
    {
      name: 'api-design',
      description: 'RESTful and GraphQL API design best practices',
      category: 'architecture',
      triggers: ['design an api', 'api design', 'rest api', 'create endpoints'],
      tags: ['api', 'rest', 'design'],
      instructions: `# API Design Skill

## When to Use
Activate when designing new APIs or reviewing existing API designs.

## REST Principles
- Use nouns for resources: /users, /orders
- Use HTTP verbs correctly: GET (read), POST (create), PUT (replace), PATCH (update), DELETE
- Use plural nouns: /users not /user
- Nest sub-resources: /users/{id}/orders
- Version your API: /api/v1/...

## Response Format
\`\`\`json
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "pageSize": 20, "total": 100 },
  "errors": []
}
\`\`\`

## Guidelines
- Always return consistent response shapes
- Use proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Implement pagination for list endpoints
- Rate limit all endpoints
- Document with OpenAPI/Swagger
- Validate all inputs
- Never expose internal IDs or implementation details`,
    },
    {
      name: 'performance-optimization',
      description: 'Performance analysis and optimization techniques',
      category: 'coding',
      triggers: ['optimize performance', 'make this faster', 'performance issue', 'slow code', 'speed up'],
      tags: ['performance', 'optimization', 'speed'],
      instructions: `# Performance Optimization Skill

## When to Use
Activate when code is slow or when optimizing for speed, memory, or throughput.

## Process
1. **Measure first** — Never optimize without profiling
2. **Find the bottleneck** — 80% of time is usually in 20% of code
3. **Set a target** — "Reduce from 500ms to under 100ms"
4. **Apply optimization** — One change at a time
5. **Measure again** — Verify improvement
6. **Document trade-offs** — What did we sacrifice?

## Common Optimizations
- **Caching** — Memoize expensive computations
- **Batching** — Combine multiple operations 
- **Lazy loading** — Don't compute until needed
- **Indexing** — Database indexes for frequent queries
- **Async** — Non-blocking I/O, parallel execution
- **Algorithm** — Better Big-O complexity
- **Pooling** — Connection pools, object pools`,
    },
    {
      name: 'documentation-writer',
      description: 'Write clear, comprehensive documentation',
      category: 'writing',
      triggers: ['write docs', 'document this', 'write documentation', 'create readme', 'add docs'],
      tags: ['documentation', 'writing', 'readme'],
      instructions: `# Documentation Writer Skill

## When to Use
Activate when creating or updating documentation for code, APIs, or projects.

## Document Types
1. **README** — Project overview, setup, usage
2. **API docs** — Endpoints, parameters, responses
3. **Code comments** — Why, not what
4. **Architecture docs** — System design, data flow
5. **User guides** — Step-by-step instructions

## Guidelines
- Start with a clear purpose statement
- Show code examples for EVERY feature
- Keep it up to date (outdated docs are worse than no docs)
- Use headers, lists, and tables for scannability
- Include a "Quick Start" section
- Link to related resources
- Test all code examples`,
    },
    {
      name: 'git-workflow',
      description: 'Git best practices: branching, commits, PRs, and conflict resolution',
      category: 'devops',
      triggers: ['git conflict', 'merge conflict', 'git workflow', 'branching strategy', 'commit message'],
      tags: ['git', 'workflow', 'version-control'],
      instructions: `# Git Workflow Skill

## Commit Messages
Format: \`type(scope): description\`
- feat: New feature
- fix: Bug fix
- refactor: Code change that neither fixes nor adds
- docs: Documentation only
- test: Adding or fixing tests
- chore: Build process or auxiliary tool changes

## Branch Strategy
- main — Production-ready
- develop — Integration branch
- feature/* — New features
- fix/* — Bug fixes
- release/* — Release preparation

## Guidelines
- Commit early, commit often
- Each commit should be a logical, atomic change
- Never commit broken code to main
- Squash noisy commits before merging
- Write meaningful PR descriptions
- Review your own PR before requesting review`,
    },
  ];

  let created = 0;
  for (const skill of defaults) {
    if (!skillRegistry.has(skill.name)) {
      try {
        await handleSkills({
          action: 'create',
          ...skill,
        });
        created++;
      } catch { /* skip if exists */ }
    }
  }
  return created;
}

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
