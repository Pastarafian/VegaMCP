/**
 * VegaMCP — Project Memory Engine
 * 
 * Persistent, cross-session memory for The Claw.
 * Tracks: milestones, decisions, bugs, ideas, brainstorms.
 * 
 * Features:
 *   - Auto-journal: Records every significant action taken by The Claw
 *   - Brainstorm Pipeline: Uses DeepSeek/Ollama to autonomously generate ideas
 *   - Memory Recall: Semantic search across all project memories
 *   - Idea Evolution: Takes existing ideas and evolves them through iteration
 *   - Project Context Window: Compresses full project history into a usable context
 * 
 * Storage: JSON files in .claw-memory/ directory per workspace
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface MemoryEntry {
  id: string;
  timestamp: number;
  type: 'milestone' | 'decision' | 'bug' | 'idea' | 'brainstorm' | 'observation' | 'task_completed' | 'insight';
  project: string;
  title: string;
  content: string;
  tags: string[];
  source: 'human' | 'ai_auto' | 'ai_brainstorm' | 'claw_action';
  confidence?: number;     // 0-1 for AI-generated entries
  parent_id?: string;      // For idea evolution chains
  status?: 'active' | 'archived' | 'rejected' | 'implemented';
  metadata?: Record<string, any>;
}

export interface BrainstormSession {
  id: string;
  timestamp: number;
  project: string;
  seed_topic: string;
  ideas: BrainstormIdea[];
  model_used: string;
  iterations: number;
}

export interface BrainstormIdea {
  id: string;
  title: string;
  description: string;
  feasibility: 'low' | 'medium' | 'high';
  novelty: 'incremental' | 'innovative' | 'breakthrough';
  effort: 'quick_win' | 'medium' | 'major';
  tags: string[];
  score: number; // 0-100 composite score
}

export interface ProjectContext {
  name: string;
  description: string;
  tech_stack: string[];
  recent_milestones: string[];
  active_bugs: string[];
  open_ideas: string[];
  last_updated: number;
}

// ═══════════════════════════════════════════════════════════════
// Memory Store
// ═══════════════════════════════════════════════════════════════

const MEMORY_DIR = path.join(os.homedir(), '.claw-memory');

function ensureMemoryDir(project: string): string {
  const projectDir = path.join(MEMORY_DIR, sanitize(project));
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Load all memories for a project
function loadMemories(project: string): MemoryEntry[] {
  const dir = ensureMemoryDir(project);
  const memFile = path.join(dir, 'memories.json');
  if (!fs.existsSync(memFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(memFile, 'utf-8'));
  } catch { return []; }
}

// Save memories
function saveMemories(project: string, memories: MemoryEntry[]): void {
  const dir = ensureMemoryDir(project);
  fs.writeFileSync(path.join(dir, 'memories.json'), JSON.stringify(memories, null, 2));
}

// Load brainstorm sessions
function loadBrainstorms(project: string): BrainstormSession[] {
  const dir = ensureMemoryDir(project);
  const bsFile = path.join(dir, 'brainstorms.json');
  if (!fs.existsSync(bsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(bsFile, 'utf-8'));
  } catch { return []; }
}

function saveBrainstorms(project: string, sessions: BrainstormSession[]): void {
  const dir = ensureMemoryDir(project);
  fs.writeFileSync(path.join(dir, 'brainstorms.json'), JSON.stringify(sessions, null, 2));
}

// Load/save project context
function loadContext(project: string): ProjectContext | null {
  const dir = ensureMemoryDir(project);
  const ctxFile = path.join(dir, 'context.json');
  if (!fs.existsSync(ctxFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(ctxFile, 'utf-8'));
  } catch { return null; }
}

function saveContext(project: string, ctx: ProjectContext): void {
  const dir = ensureMemoryDir(project);
  fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(ctx, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// Core Memory Operations
// ═══════════════════════════════════════════════════════════════

export function recordMemory(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): MemoryEntry {
  const full: MemoryEntry = {
    ...entry,
    id: generateId(),
    timestamp: Date.now(),
    status: entry.status || 'active',
  };
  const memories = loadMemories(entry.project);
  memories.push(full);
  saveMemories(entry.project, memories);
  return full;
}

export function recallMemories(project: string, query?: string, type?: string, limit = 20): MemoryEntry[] {
  let memories = loadMemories(project);
  
  if (type) {
    memories = memories.filter(m => m.type === type);
  }
  
  if (query) {
    const q = query.toLowerCase();
    memories = memories.filter(m => 
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  
  return memories
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function getProjectTimeline(project: string): MemoryEntry[] {
  return loadMemories(project).sort((a, b) => a.timestamp - b.timestamp);
}

export function archiveMemory(project: string, memoryId: string): boolean {
  const memories = loadMemories(project);
  const idx = memories.findIndex(m => m.id === memoryId);
  if (idx === -1) return false;
  memories[idx].status = 'archived';
  saveMemories(project, memories);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Brainstorm Engine
// ═══════════════════════════════════════════════════════════════

const BRAINSTORM_SYSTEM_PROMPT = `You are a senior AI product strategist and creative technologist. You brainstorm ideas for software projects.

RULES:
- Generate exactly 5 ideas per request
- Each idea must be SPECIFIC and ACTIONABLE, not vague
- Rate each idea on feasibility (low/medium/high), novelty (incremental/innovative/breakthrough), and effort (quick_win/medium/major)
- Think about what would genuinely impress users and make the product stand out
- Consider the existing tech stack and recent project history
- Be bold. Don't suggest boring features. Think "what would make this 10x better?"

OUTPUT FORMAT (strict JSON array):
[
  {
    "title": "Feature Name",
    "description": "2-3 sentence description of what it does and WHY it matters",
    "feasibility": "high",
    "novelty": "innovative",
    "effort": "medium",
    "tags": ["tag1", "tag2"]
  }
]`;

export async function brainstorm(
  project: string,
  seedTopic: string,
  iterations: number = 1
): Promise<BrainstormSession> {
  // Build context from project memory
  const memories = loadMemories(project);
  const recentMilestones = memories
    .filter(m => m.type === 'milestone')
    .slice(-5)
    .map(m => `- ${m.title}: ${m.content}`);
  const existingIdeas = memories
    .filter(m => m.type === 'idea' && m.status === 'active')
    .slice(-10)
    .map(m => `- ${m.title}`);
  const ctx = loadContext(project);

  const contextBlock = `
PROJECT: ${ctx?.name || project}
DESCRIPTION: ${ctx?.description || 'No description set'}
TECH STACK: ${ctx?.tech_stack?.join(', ') || 'Unknown'}

RECENT MILESTONES:
${recentMilestones.length > 0 ? recentMilestones.join('\n') : '(none recorded)'}

EXISTING IDEAS (avoid duplicates):
${existingIdeas.length > 0 ? existingIdeas.join('\n') : '(none yet)'}

BRAINSTORM TOPIC: ${seedTopic}
`;

  const session: BrainstormSession = {
    id: `bs_${Date.now()}`,
    timestamp: Date.now(),
    project,
    seed_topic: seedTopic,
    ideas: [],
    model_used: 'pending',
    iterations,
  };

  for (let i = 0; i < iterations; i++) {
    const iterationPrompt = i === 0
      ? contextBlock
      : `${contextBlock}\n\nPREVIOUS ITERATION IDEAS (build on or diverge from these):\n${session.ideas.map(id => `- ${id.title}`).join('\n')}`;

    const result = await callLLM(BRAINSTORM_SYSTEM_PROMPT, iterationPrompt);
    session.model_used = result.model;

    try {
      const parsed = JSON.parse(result.text);
      if (Array.isArray(parsed)) {
        const newIdeas: BrainstormIdea[] = parsed.map((idea: any, idx: number) => ({
          id: `idea_${Date.now()}_${idx}`,
          title: idea.title || 'Untitled',
          description: idea.description || '',
          feasibility: idea.feasibility || 'medium',
          novelty: idea.novelty || 'incremental',
          effort: idea.effort || 'medium',
          tags: idea.tags || [],
          score: computeScore(idea),
        }));
        session.ideas.push(...newIdeas);
      }
    } catch {
      // If JSON parsing fails, try to extract ideas from raw text
      session.ideas.push({
        id: `idea_${Date.now()}_raw`,
        title: 'Raw Brainstorm Output',
        description: result.text.substring(0, 500),
        feasibility: 'medium',
        novelty: 'incremental',
        effort: 'medium',
        tags: ['raw', 'needs-review'],
        score: 30,
      });
    }
  }

  // Sort by score
  session.ideas.sort((a, b) => b.score - a.score);

  // Save session
  const sessions = loadBrainstorms(project);
  sessions.push(session);
  saveBrainstorms(project, sessions);

  // Auto-record top ideas as memory entries
  for (const idea of session.ideas.slice(0, 3)) {
    recordMemory({
      type: 'idea',
      project,
      title: idea.title,
      content: idea.description,
      tags: [...idea.tags, 'auto-brainstorm'],
      source: 'ai_brainstorm',
      confidence: idea.score / 100,
    });
  }

  return session;
}

function computeScore(idea: any): number {
  let score = 50;
  // Feasibility bonus
  if (idea.feasibility === 'high') score += 15;
  else if (idea.feasibility === 'medium') score += 5;
  // Novelty bonus
  if (idea.novelty === 'breakthrough') score += 25;
  else if (idea.novelty === 'innovative') score += 15;
  else score += 5;
  // Effort adjustment (quick wins score higher)
  if (idea.effort === 'quick_win') score += 10;
  else if (idea.effort === 'major') score -= 5;
  return Math.min(100, Math.max(0, score));
}

// ═══════════════════════════════════════════════════════════════
// Idea Evolution: Take an existing idea and mutate/evolve it
// ═══════════════════════════════════════════════════════════════

export async function evolveIdea(project: string, ideaId: string): Promise<BrainstormIdea[]> {
  const memories = loadMemories(project);
  const original = memories.find(m => m.id === ideaId);
  if (!original) throw new Error(`Memory '${ideaId}' not found`);

  const prompt = `Take this existing idea and produce 3 evolved/improved versions of it. Each should be a distinct direction:
1. A "10x bigger" version
2. A "simpler MVP" version  
3. A "wild pivot" version

ORIGINAL IDEA:
Title: ${original.title}
Description: ${original.content}
Tags: ${original.tags.join(', ')}

OUTPUT FORMAT: Same JSON array as before.`;

  const result = await callLLM(BRAINSTORM_SYSTEM_PROMPT, prompt);
  
  try {
    const parsed = JSON.parse(result.text);
    if (Array.isArray(parsed)) {
      const evolved: BrainstormIdea[] = parsed.map((idea: any, idx: number) => ({
        id: `evolved_${Date.now()}_${idx}`,
        title: idea.title || 'Untitled',
        description: idea.description || '',
        feasibility: idea.feasibility || 'medium',
        novelty: idea.novelty || 'innovative',
        effort: idea.effort || 'medium',
        tags: [...(idea.tags || []), 'evolved', `from:${ideaId}`],
        score: computeScore(idea),
      }));

      // Record evolved ideas
      for (const idea of evolved) {
        recordMemory({
          type: 'idea',
          project,
          title: `[Evolved] ${idea.title}`,
          content: idea.description,
          tags: idea.tags,
          source: 'ai_brainstorm',
          confidence: idea.score / 100,
          parent_id: ideaId,
        });
      }

      return evolved;
    }
  } catch {}

  return [];
}

// ═══════════════════════════════════════════════════════════════
// Context Compression: Build a usable project summary
// ═══════════════════════════════════════════════════════════════

export function buildProjectContext(project: string): string {
  const memories = loadMemories(project);
  const ctx = loadContext(project);
  const sessions = loadBrainstorms(project);

  const milestones = memories.filter(m => m.type === 'milestone').slice(-10);
  const decisions = memories.filter(m => m.type === 'decision').slice(-5);
  const bugs = memories.filter(m => m.type === 'bug' && m.status === 'active');
  const ideas = memories.filter(m => m.type === 'idea' && m.status === 'active').slice(-10);
  const insights = memories.filter(m => m.type === 'insight').slice(-5);

  return `
═══ PROJECT MEMORY: ${ctx?.name || project} ═══
Tech Stack: ${ctx?.tech_stack?.join(', ') || 'Not set'}
Total Memories: ${memories.length}
Brainstorm Sessions: ${sessions.length}
Last Updated: ${ctx?.last_updated ? new Date(ctx.last_updated).toLocaleString() : 'Never'}

── Recent Milestones ──
${milestones.map(m => `• [${new Date(m.timestamp).toLocaleDateString()}] ${m.title}`).join('\n') || '(none)'}

── Key Decisions ──
${decisions.map(m => `• ${m.title}: ${m.content.substring(0, 100)}`).join('\n') || '(none)'}

── Active Bugs ──
${bugs.map(m => `• ${m.title}`).join('\n') || '(none — clean slate!)'}

── Open Ideas (${ideas.length}) ──
${ideas.map(m => `• ${m.title} [${m.confidence ? Math.round(m.confidence * 100) + '%' : '?'}]`).join('\n') || '(none)'}

── Recent Insights ──
${insights.map(m => `• ${m.content.substring(0, 120)}`).join('\n') || '(none)'}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// LLM Caller (DeepSeek → Ollama → OpenRouter fallback)
// ═══════════════════════════════════════════════════════════════

async function callLLM(systemPrompt: string, userPrompt: string): Promise<{ text: string; model: string }> {
  // Tier 1: DeepSeek API (preferred for brainstorming — creative & cheap)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.85,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const text = data?.choices?.[0]?.message?.content || '';
        return { text, model: 'deepseek-chat' };
      }
    } catch { /* fallback */ }
  }

  // Tier 2: Ollama local (free, private)
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModels = ['deepseek-r1:8b', 'llama3.1:8b', 'mistral', 'qwen2.5:7b'];
  for (const model of ollamaModels) {
    try {
      const resp = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: { temperature: 0.85, num_predict: 2000 },
          format: 'json',
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        return { text: data?.response || '', model: `ollama:${model}` };
      }
    } catch { /* next model */ }
  }

  // Tier 3: OpenRouter cloud
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`,
          'HTTP-Referer': 'https://vegamcp.dev',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.85,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        return { text: data?.choices?.[0]?.message?.content || '', model: 'openrouter:deepseek-chat' };
      }
    } catch { /* no LLM available */ }
  }

  return { text: '[]', model: 'none' };
}

// ═══════════════════════════════════════════════════════════════
// Auto-Journal: Called by The Claw after significant actions
// ═══════════════════════════════════════════════════════════════

export function autoJournal(project: string, action: string, details: string): MemoryEntry {
  return recordMemory({
    type: 'observation',
    project,
    title: `[Auto] ${action}`,
    content: details,
    tags: ['auto-journal', 'claw-action'],
    source: 'claw_action',
    confidence: 1.0,
  });
}

// ═══════════════════════════════════════════════════════════════
// Project Setup
// ═══════════════════════════════════════════════════════════════

export function initProject(name: string, description: string, techStack: string[]): ProjectContext {
  const ctx: ProjectContext = {
    name,
    description,
    tech_stack: techStack,
    recent_milestones: [],
    active_bugs: [],
    open_ideas: [],
    last_updated: Date.now(),
  };
  saveContext(name, ctx);
  
  recordMemory({
    type: 'milestone',
    project: name,
    title: 'Project Initialized',
    content: `Project "${name}" memory system initialized. Stack: ${techStack.join(', ')}`,
    tags: ['init', 'system'],
    source: 'ai_auto',
    confidence: 1.0,
  });

  return ctx;
}

// ═══════════════════════════════════════════════════════════════
// Cross-Project Pollination Engine
// ═══════════════════════════════════════════════════════════════

export function listAllProjects(): string[] {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  return fs.readdirSync(MEMORY_DIR)
    .filter(f => {
      const full = path.join(MEMORY_DIR, f);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'memories.json'));
    });
}

// Search across ALL projects for matching memories
export function crossProjectSearch(query: string, limit = 30): MemoryEntry[] {
  const allProjects = listAllProjects();
  const results: MemoryEntry[] = [];
  const q = query.toLowerCase();

  for (const proj of allProjects) {
    const memories = loadMemories(proj);
    const matches = memories.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
    results.push(...matches);
  }

  return results
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

// Cross-pollinate: Pull patterns from other projects to inspire a new one
export async function crossPollinate(
  targetProject: string,
  seedTopic: string
): Promise<BrainstormSession> {
  const allProjects = listAllProjects().filter(p => p !== sanitize(targetProject));

  // Gather the best ideas and insights from ALL other projects
  const crossMemories: string[] = [];
  for (const proj of allProjects) {
    const memories = loadMemories(proj);
    const ctx = loadContext(proj);
    const projectName = ctx?.name || proj;

    // Get top ideas
    const topIdeas = memories
      .filter(m => m.type === 'idea' && m.status === 'active' && (m.confidence || 0) >= 0.6)
      .slice(-3)
      .map(m => `[${projectName}] ${m.title}: ${m.content.substring(0, 100)}`);

    // Get key architectural decisions
    const decisions = memories
      .filter(m => m.type === 'decision')
      .slice(-2)
      .map(m => `[${projectName}] ${m.title}`);

    // Get insights
    const insights = memories
      .filter(m => m.type === 'insight')
      .slice(-2)
      .map(m => `[${projectName}] ${m.content.substring(0, 100)}`);

    crossMemories.push(...topIdeas, ...decisions, ...insights);
  }

  const CROSS_POLLINATE_PROMPT = `You are a cross-domain innovation specialist. Your job is to take patterns, ideas, and insights from MULTIPLE existing projects and remix them into NEW ideas for a TARGET project.

KEY PRINCIPLE: The best innovations come from applying solutions from one domain to problems in another.

RULES:
- Generate 5 ideas that are INSPIRED BY the cross-project memories below
- For each idea, note which source project/pattern inspired it
- Ideas should be novel COMBINATIONS, not copies
- Output strict JSON array with same format plus an "inspired_by" field

OUTPUT FORMAT:
[
  {
    "title": "Feature Name",
    "description": "Description + WHY this cross-pollination makes sense",
    "feasibility": "high",
    "novelty": "innovative", 
    "effort": "medium",
    "tags": ["cross-pollinated", "tag2"],
    "inspired_by": "ProjectName: Original Pattern"
  }
]`;

  const contextBlock = `
TARGET PROJECT: ${targetProject}
BRAINSTORM TOPIC: ${seedTopic}

═══ CROSS-PROJECT MEMORY BANK (${crossMemories.length} entries from ${allProjects.length} projects) ═══
${crossMemories.slice(0, 30).join('\n')}
`;

  const result = await callLLM(CROSS_POLLINATE_PROMPT, contextBlock);
  
  const session: BrainstormSession = {
    id: `xpol_${Date.now()}`,
    timestamp: Date.now(),
    project: targetProject,
    seed_topic: `[Cross-Pollinated] ${seedTopic}`,
    ideas: [],
    model_used: result.model,
    iterations: 1,
  };

  try {
    const parsed = JSON.parse(result.text);
    if (Array.isArray(parsed)) {
      session.ideas = parsed.map((idea: any, idx: number) => ({
        id: `xpol_idea_${Date.now()}_${idx}`,
        title: idea.title || 'Untitled',
        description: `${idea.description || ''}\n\n💡 Inspired by: ${idea.inspired_by || 'multiple projects'}`,
        feasibility: idea.feasibility || 'medium',
        novelty: idea.novelty || 'innovative',
        effort: idea.effort || 'medium',
        tags: [...(idea.tags || []), 'cross-pollinated'],
        score: computeScore(idea) + 5, // Bonus for cross-pollination novelty
      }));
    }
  } catch {
    session.ideas.push({
      id: `xpol_raw_${Date.now()}`,
      title: 'Cross-Pollination Output (Raw)',
      description: result.text.substring(0, 500),
      feasibility: 'medium',
      novelty: 'innovative',
      effort: 'medium',
      tags: ['cross-pollinated', 'raw'],
      score: 40,
    });
  }

  session.ideas.sort((a, b) => b.score - a.score);

  // Save
  const sessions = loadBrainstorms(targetProject);
  sessions.push(session);
  saveBrainstorms(targetProject, sessions);

  // Auto-record top ideas
  for (const idea of session.ideas.slice(0, 3)) {
    recordMemory({
      type: 'idea',
      project: targetProject,
      title: `[X-Pol] ${idea.title}`,
      content: idea.description,
      tags: idea.tags,
      source: 'ai_brainstorm',
      confidence: idea.score / 100,
    });
  }

  return session;
}

// ═══════════════════════════════════════════════════════════════
// New Project Bootstrapper: Generate a full project plan from memories
// ═══════════════════════════════════════════════════════════════

export async function bootstrapNewProject(
  name: string,
  description: string,
  inspirationQuery: string
): Promise<{ context: ProjectContext; ideas: BrainstormIdea[] }> {
  // First, search ALL existing project memories for inspiration
  const inspiration = crossProjectSearch(inspirationQuery, 20);
  
  // Detect common tech stacks from similar projects
  const allProjects = listAllProjects();
  const techStacks: string[] = [];
  for (const proj of allProjects) {
    const ctx = loadContext(proj);
    if (ctx?.tech_stack) techStacks.push(...ctx.tech_stack);
  }
  // Find most common tech
  const techFreq: Record<string, number> = {};
  for (const t of techStacks) {
    techFreq[t] = (techFreq[t] || 0) + 1;
  }
  const suggestedStack = Object.entries(techFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tech]) => tech);

  // Init the project
  const ctx = initProject(name, description, suggestedStack);

  // Record the inspiration sources
  if (inspiration.length > 0) {
    recordMemory({
      type: 'insight',
      project: name,
      title: 'Bootstrap Inspiration Sources',
      content: `This project was inspired by patterns from: ${[...new Set(inspiration.map(m => m.project))].join(', ')}. Key patterns: ${inspiration.slice(0, 5).map(m => m.title).join('; ')}`,
      tags: ['bootstrap', 'cross-project'],
      source: 'ai_auto',
      confidence: 0.9,
    });
  }

  // Now brainstorm initial ideas using cross-pollination
  const session = await crossPollinate(name, `New project: ${description}`);

  return { context: ctx, ideas: session.ideas };
}

// ═══════════════════════════════════════════════════════════════
// Export all for The Claw integration
// ═══════════════════════════════════════════════════════════════

export const ProjectMemory = {
  record: recordMemory,
  recall: recallMemories,
  timeline: getProjectTimeline,
  archive: archiveMemory,
  brainstorm,
  evolve: evolveIdea,
  context: buildProjectContext,
  journal: autoJournal,
  init: initProject,
  loadContext,
  // Cross-project
  listProjects: listAllProjects,
  crossSearch: crossProjectSearch,
  crossPollinate,
  bootstrapProject: bootstrapNewProject,
};
