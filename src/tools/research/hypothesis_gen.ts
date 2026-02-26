/**
 * VegaMCP — Hypothesis Generator: Tournament of Ideas (ToI)
 * 
 * Implements a THREE-BODY DEBATE for research hypothesis generation:
 *   1. THE VISIONARY (O3-Mini / fast creative model) — generates wild hypotheses
 *   2. THE ADVERSARY (Claude 3.5 Sonnet / analytical model) — finds prior art to debunk
 *   3. THE ARBITER (DeepSeek-R1 / high-reasoning model) — decides if idea is worth prototyping
 * 
 * Uses the existing Multi-Model Router and Memory Bridge for context enrichment.
 * 
 * FLOW:
 *   Query → ChromaDB Random Node Combination → Visionary Hypothesis
 *   → Adversary Prior Art Search → Arbiter Decision → Learn/Reject
 */

import type { ModelId, TaskPayload, TaskResult } from '../../swarm/types.js';
import {
  learn,
  recall,
  recallFailures,
  recallConstraints,
  createHypothesis,
  updateHypothesis,
  getHypothesis,
  listHypotheses,
  type HypothesisRecord,
  type BridgedMemory,
} from '../../db/vector-graph-bridge.js';

import { searchVectorStore, type VectorEntry } from '../../db/vector-store.js';
import { searchEntities } from '../../db/graph-store.js';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const hypothesisGenSchema = {
  name: 'hypothesis_generator',
  description: `Tournament of Ideas — Multi-model debate system for generating and validating research hypotheses. Three AI agents debate: The Visionary (creative generator), The Adversary (prior art critic), and The Arbiter (final judge). Actions: generate (create new hypothesis), debate (run full 3-body debate), list (view hypotheses), get (fetch specific hypothesis), approve/reject (manual override), evolve (combine existing ideas).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['generate', 'debate', 'list', 'get', 'approve', 'reject', 'evolve'],
        description: 'Action to perform',
      },
      topic: {
        type: 'string',
        description: 'Research topic or domain to generate hypotheses for (for generate/debate)',
      },
      hypothesis_id: {
        type: 'string',
        description: 'Hypothesis ID (for get/approve/reject)',
      },
      constraints: {
        type: 'string',
        description: 'Additional constraints or context for generation',
      },
      seed_ideas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Seed ideas to combine (for evolve action)',
      },
      status_filter: {
        type: 'string',
        enum: ['proposed', 'debating', 'approved', 'rejected', 'prototyping', 'verified', 'failed'],
        description: 'Filter hypotheses by status (for list)',
      },
      creativity: {
        type: 'number',
        description: 'Creativity level 0.0-1.0 for the Visionary (default: 0.8)',
      },
      rigor: {
        type: 'number',
        description: 'Rigor level 0.0-1.0 for the Adversary (default: 0.9)',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// DEBATE MODELS (Multi-Model Router targets)
// ═══════════════════════════════════════════════

const DEBATE_CONFIG = {
  visionary: {
    role: 'The Visionary',
    model: 'deepseek/deepseek-chat' as ModelId,  // Fast, creative
    temperature: 0.85,
    personality: `You are The Visionary — a bold, creative research scientist who generates novel hypotheses by combining disparate concepts. You see patterns others miss. You propose specific, testable ideas with clear mechanisms. Format: HYPOTHESIS: [title]\nMECHANISM: [how it works]\nTESTABLE: [how to verify]\nNOVELTY: [why this hasn't been tried]`,
  },
  adversary: {
    role: 'The Adversary',
    model: 'anthropic/claude-3.5-sonnet' as ModelId,  // Analytical, thorough
    temperature: 0.3,
    personality: `You are The Adversary — a rigorous academic reviewer whose job is to find fatal flaws. Search for: (1) Prior art that already covers this idea, (2) Fundamental theoretical impossibilities, (3) Practical infeasibilities, (4) Logical fallacies. Rate the hypothesis 0-10 on novelty. If score < 5, provide a specific citation or reason it fails.`,
  },
  arbiter: {
    role: 'The Arbiter',
    model: 'deepseek/deepseek-r1' as ModelId,  // High reasoning
    temperature: 0.1,
    personality: `You are The Arbiter — a wise, impartial judge of scientific merit. You've seen the Visionary's hypothesis AND the Adversary's critique. Your job: decide if this idea is worth a CODE PROTOTYPE. Consider: feasibility (40%), novelty (30%), impact (20%), testability (10%). Respond with: VERDICT: [APPROVE/REJECT/REFINE]\nCONFIDENCE: [0-100]\nREASONING: [your analysis]\nNEXT_STEP: [what to do if approved]`,
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleHypothesisGen(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;

  try {
    switch (action) {
      case 'generate':
        return await handleGenerate(args);
      case 'debate':
        return await handleDebate(args);
      case 'list':
        return handleList(args);
      case 'get':
        return handleGet(args);
      case 'approve':
        return handleApprove(args);
      case 'reject':
        return handleReject(args);
      case 'evolve':
        return await handleEvolve(args);
      default:
        return result({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return result({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// ACTION: GENERATE (Visionary Phase)
// ═══════════════════════════════════════════════

async function handleGenerate(args: any) {
  const { topic, constraints, creativity = 0.8 } = args;
  if (!topic) return result({ error: 'Topic is required for hypothesis generation' });

  // 1. Gather context from memory
  const memoryContext = recall(topic, { limit: 5 });
  const pastFailures = recallFailures(topic, 3);
  const activeConstraints = recallConstraints(topic, 3);

  // 2. Find random "seed nodes" from the knowledge base for creative combination
  const seedNodes = findCreativeSeeds(topic);

  // 3. Build the Visionary's prompt
  const visionaryPrompt = buildVisionaryPrompt(
    topic, 
    memoryContext.memories, 
    pastFailures, 
    activeConstraints, 
    seedNodes, 
    constraints, 
    creativity
  );

  // 4. Call the Visionary model
  const visionaryResponse = await callDebateModel('visionary', visionaryPrompt);

  // 5. Parse and store the hypothesis
  const parsed = parseHypothesis(visionaryResponse);
  const hypothesis = createHypothesis(
    parsed.title || `Hypothesis on: ${topic.slice(0, 50)}`,
    visionaryResponse
  );

  // Store in memory
  await learn({
    content: visionaryResponse,
    entityName: hypothesis.hypothesisId,
    entityType: 'hypothesis',
    domain: 'research',
    source: 'agent:visionary',
    confidence: 0.5,
    tags: ['hypothesis', 'visionary', topic],
  });

  updateHypothesis(hypothesis.hypothesisId, {
    visionaryScore: parsed.noveltyEstimate || 7,
    debateEntry: {
      agent: 'visionary',
      position: 'proposal',
      reasoning: visionaryResponse,
    },
  });

  return result({
    hypothesisId: hypothesis.hypothesisId,
    phase: 'generated',
    title: parsed.title,
    description: visionaryResponse,
    seedNodesUsed: seedNodes.length,
    memoryContextUsed: memoryContext.memories.length,
    pastFailuresAvoided: pastFailures.length,
    constraintsApplied: activeConstraints.length,
    nextStep: `Run 'debate' with hypothesis_id="${hypothesis.hypothesisId}" to start the Three-Body Debate`,
  });
}

// ═══════════════════════════════════════════════
// ACTION: DEBATE (Full Three-Body Debate)
// ═══════════════════════════════════════════════

async function handleDebate(args: any) {
  const { topic, hypothesis_id, rigor = 0.9 } = args;

  let hypothesis: HypothesisRecord | null = null;

  // If hypothesis_id provided, use existing; otherwise generate first
  if (hypothesis_id) {
    hypothesis = getHypothesis(hypothesis_id);
    if (!hypothesis) return result({ error: `Hypothesis not found: ${hypothesis_id}` });
  } else if (topic) {
    // Generate first, then debate
    const genResult = await handleGenerate(args);
    const genData = JSON.parse(genResult.content[0].text);
    hypothesis = getHypothesis(genData.hypothesisId);
    if (!hypothesis) return result({ error: 'Failed to generate hypothesis for debate' });
  } else {
    return result({ error: 'Either topic or hypothesis_id is required' });
  }

  // Mark as debating
  updateHypothesis(hypothesis.hypothesisId, { status: 'debating' });

  // === PHASE 2: ADVERSARY ===
  const adversaryPrompt = buildAdversaryPrompt(hypothesis.description, rigor);
  const adversaryResponse = await callDebateModel('adversary', adversaryPrompt);
  const adversaryAnalysis = parseAdversaryResponse(adversaryResponse);

  updateHypothesis(hypothesis.hypothesisId, {
    adversaryScore: adversaryAnalysis.noveltyScore || 5,
    debateEntry: {
      agent: 'adversary',
      position: 'critique',
      reasoning: adversaryResponse,
    },
  });

  // === PHASE 3: ARBITER ===
  const arbiterPrompt = buildArbiterPrompt(hypothesis.description, adversaryResponse);
  const arbiterResponse = await callDebateModel('arbiter', arbiterPrompt);
  const arbiterDecision = parseArbiterResponse(arbiterResponse);

  const finalStatus = arbiterDecision.verdict === 'APPROVE' ? 'approved' 
    : arbiterDecision.verdict === 'REFINE' ? 'proposed'
    : 'rejected';

  updateHypothesis(hypothesis.hypothesisId, {
    status: finalStatus,
    arbiterVerdict: arbiterResponse,
    confidence: (arbiterDecision.confidence || 50) / 100,
    debateEntry: {
      agent: 'arbiter',
      position: arbiterDecision.verdict?.toLowerCase() || 'undecided',
      reasoning: arbiterResponse,
    },
  });

  // If approved, store as validated knowledge
  if (finalStatus === 'approved') {
    await learn({
      content: `APPROVED HYPOTHESIS: ${hypothesis.title}\n${hypothesis.description}`,
      entityName: `approved_${hypothesis.hypothesisId}`,
      entityType: 'validated_hypothesis',
      domain: 'research',
      source: 'tournament-of-ideas',
      confidence: (arbiterDecision.confidence || 50) / 100,
      tags: ['approved', 'tournament', 'validated'],
    });
  }

  return result({
    hypothesisId: hypothesis.hypothesisId,
    title: hypothesis.title,
    debate: {
      visionary: {
        phase: 'Hypothesis Generated',
        summary: hypothesis.description.slice(0, 300),
      },
      adversary: {
        phase: 'Critical Review',
        noveltyScore: adversaryAnalysis.noveltyScore,
        priorArt: adversaryAnalysis.priorArt,
        criticalFlaws: adversaryAnalysis.flaws,
        summary: adversaryResponse.slice(0, 300),
      },
      arbiter: {
        phase: 'Final Judgment',
        verdict: arbiterDecision.verdict,
        confidence: arbiterDecision.confidence,
        nextStep: arbiterDecision.nextStep,
        summary: arbiterResponse.slice(0, 300),
      },
    },
    finalStatus,
    finalConfidence: (arbiterDecision.confidence || 50) / 100,
  });
}

// ═══════════════════════════════════════════════
// ACTION: EVOLVE (Combine Existing Ideas)
// ═══════════════════════════════════════════════

async function handleEvolve(args: any) {
  const { seed_ideas, topic } = args;
  if (!seed_ideas || seed_ideas.length < 2) {
    return result({ error: 'At least 2 seed ideas are required for evolution' });
  }

  // Find memory context for each seed idea
  const seedContexts: string[] = [];
  for (const idea of seed_ideas) {
    const context = recall(idea, { limit: 3 });
    seedContexts.push(
      context.memories.length > 0
        ? context.memories[0].content
        : idea
    );
  }

  const evolvePrompt = `You are an EVOLUTIONARY IDEA COMBINER. Given these ${seed_ideas.length} concepts, create a NOVEL synthesis that combines their strengths:

${seedContexts.map((c, i) => `=== IDEA ${i + 1} ===\n${c}`).join('\n\n')}

${topic ? `DOMAIN CONSTRAINT: ${topic}` : ''}

Generate a SYNTHESIS hypothesis that:
1. Takes the best mechanism from each idea
2. Addresses weaknesses of individual ideas
3. Creates something genuinely new, not just a list of features
4. Is specific and testable

Format:
SYNTHESIS_TITLE: [name]
COMBINED_MECHANISM: [how the synthesis works]
NOVEL_ELEMENT: [what's new vs just combining]
TESTABLE_PREDICTION: [how to verify]`;

  const response = await callDebateModel('visionary', evolvePrompt);
  const parsed = parseHypothesis(response);

  const hypothesis = createHypothesis(
    parsed.title || `Evolved: ${seed_ideas.slice(0, 2).join(' + ')}`,
    response
  );

  await learn({
    content: response,
    entityName: hypothesis.hypothesisId,
    entityType: 'evolved_hypothesis',
    domain: 'research',
    source: 'agent:visionary',
    confidence: 0.5,
    relatedTo: seed_ideas.map((idea: string) => ({
      entityName: idea,
      relationType: 'synthesized_from',
    })),
    tags: ['hypothesis', 'evolved', 'synthesis'],
  });

  return result({
    hypothesisId: hypothesis.hypothesisId,
    title: parsed.title,
    description: response,
    seedIdeas: seed_ideas,
    nextStep: `Run 'debate' with hypothesis_id="${hypothesis.hypothesisId}" to validate`,
  });
}

// ═══════════════════════════════════════════════
// SIMPLE ACTIONS
// ═══════════════════════════════════════════════

function handleList(args: any) {
  const hypotheses = listHypotheses(args.status_filter, 50);
  return result({
    count: hypotheses.length,
    hypotheses: hypotheses.map(h => ({
      id: h.hypothesisId,
      title: h.title,
      status: h.status,
      confidence: h.confidence,
      visionaryScore: h.visionaryScore,
      adversaryScore: h.adversaryScore,
      arbiterVerdict: h.arbiterVerdict?.slice(0, 100),
      debateRounds: h.debateLog.length,
      createdAt: h.createdAt,
    })),
  });
}

function handleGet(args: any) {
  if (!args.hypothesis_id) return result({ error: 'hypothesis_id is required' });
  const hyp = getHypothesis(args.hypothesis_id);
  if (!hyp) return result({ error: `Not found: ${args.hypothesis_id}` });
  return result(hyp);
}

function handleApprove(args: any) {
  if (!args.hypothesis_id) return result({ error: 'hypothesis_id is required' });
  updateHypothesis(args.hypothesis_id, {
    status: 'approved',
    debateEntry: { agent: 'manual', position: 'approve', reasoning: 'Manually approved by user' },
  });
  return result({ hypothesisId: args.hypothesis_id, status: 'approved' });
}

function handleReject(args: any) {
  if (!args.hypothesis_id) return result({ error: 'hypothesis_id is required' });
  updateHypothesis(args.hypothesis_id, {
    status: 'rejected',
    debateEntry: { agent: 'manual', position: 'reject', reasoning: 'Manually rejected by user' },
  });
  return result({ hypothesisId: args.hypothesis_id, status: 'rejected' });
}

// ═══════════════════════════════════════════════
// INTERNAL: PROMPT BUILDERS
// ═══════════════════════════════════════════════

function buildVisionaryPrompt(
  topic: string,
  memories: BridgedMemory[],
  failures: BridgedMemory[],
  constraints: BridgedMemory[],
  seedNodes: string[],
  userConstraints?: string,
  creativity: number = 0.8
): string {
  let prompt = `RESEARCH DOMAIN: ${topic}\n\n`;

  if (memories.length > 0) {
    prompt += `=== EXISTING KNOWLEDGE ===\n`;
    prompt += memories.map(m => `• ${m.content.slice(0, 200)}`).join('\n');
    prompt += '\n\n';
  }

  if (failures.length > 0) {
    prompt += `=== ⚠️ PAST FAILURES (AVOID THESE) ===\n`;
    prompt += failures.map(m => `• ${m.content.slice(0, 200)}`).join('\n');
    prompt += '\n\n';
  }

  if (constraints.length > 0) {
    prompt += `=== 🛡️ LEARNED CONSTRAINTS ===\n`;
    prompt += constraints.map(m => `• ${m.content.slice(0, 200)}`).join('\n');
    prompt += '\n\n';
  }

  if (seedNodes.length > 0) {
    prompt += `=== 🔀 RANDOM SEED CONCEPTS (combine these creatively) ===\n`;
    prompt += seedNodes.map(s => `• ${s}`).join('\n');
    prompt += '\n\n';
  }

  if (userConstraints) {
    prompt += `=== USER CONSTRAINTS ===\n${userConstraints}\n\n`;
  }

  prompt += `CREATIVITY LEVEL: ${Math.round(creativity * 100)}%\n`;
  prompt += `\nGenerate a NOVEL, SPECIFIC, TESTABLE hypothesis that:
1. Combines at least 2 of the seed concepts in a non-obvious way
2. Avoids the past failures listed above
3. Respects the learned constraints
4. Has a clear mechanism of action
5. Can be verified through code or experiment

Be bold. Be specific. Be surprising.`;

  return prompt;
}

function buildAdversaryPrompt(hypothesis: string, rigor: number = 0.9): string {
  return `You must critically evaluate this hypothesis with ${Math.round(rigor * 100)}% rigor.

=== HYPOTHESIS UNDER REVIEW ===
${hypothesis}

Your task:
1. PRIOR ART: Does this already exist? Name specific papers, patents, or projects.
2. THEORETICAL FLAWS: Is the mechanism sound? Any physical/mathematical impossibilities?
3. PRACTICAL BARRIERS: What makes this infeasible to implement?
4. LOGICAL FALLACIES: Any circular reasoning, false analogies, or unfounded assumptions?

NOVELTY SCORE: Rate 0-10 (0 = completely known, 10 = genuinely novel)
FATAL FLAW: If any, describe the single most critical issue.
SALVAGEABLE: Is there a modified version that would work? Describe it briefly.`;
}

function buildArbiterPrompt(hypothesis: string, adversaryResponse: string): string {
  return `You are the final judge in a Three-Body Research Debate.

=== ORIGINAL HYPOTHESIS ===
${hypothesis}

=== ADVERSARY'S CRITIQUE ===
${adversaryResponse}

Consider carefully:
- Feasibility (40%): Can this actually be built/tested?
- Novelty (30%): Is this genuinely new?
- Impact (20%): Would this matter if it works? 
- Testability (10%): Can we quickly validate or invalidate it?

VERDICT: [APPROVE / REJECT / REFINE]
CONFIDENCE: [0-100]
REASONING: [Your detailed analysis considering both sides]
NEXT_STEP: [If approved, what's the first concrete step? If refined, what needs changing?]`;
}

// ═══════════════════════════════════════════════
// INTERNAL: MODEL CALLER (through the queryModel system)
// ═══════════════════════════════════════════════

async function callDebateModel(
  role: 'visionary' | 'adversary' | 'arbiter',
  prompt: string
): Promise<string> {
  const config = DEBATE_CONFIG[role];
  
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    // Fallback: return a structured placeholder when no API key
    return `[${config.role} — No API key configured. Simulated response for: ${prompt.slice(0, 200)}...]\n\nHYPOTHESIS: Placeholder hypothesis\nMECHANISM: Requires API key to generate\nVERDICT: REFINE\nCONFIDENCE: 0`;
  }

  const isOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const url = isOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

  let apiModel: string = config.model;
  if (!isOpenRouter) {
    if (config.model === 'deepseek/deepseek-r1') apiModel = 'deepseek-reasoner';
    else if (config.model === 'deepseek/deepseek-chat') apiModel = 'deepseek-chat';
    else {
      // For non-DeepSeek models without OpenRouter, use deepseek-chat
      apiModel = 'deepseek-chat';
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (isOpenRouter) {
    headers['HTTP-Referer'] = 'https://vegamcp.local';
    headers['X-Title'] = `VegaMCP ${config.role}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 3 min timeout for debate

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'system', content: config.personality },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
        temperature: config.temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`${config.role} API error: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || `[${config.role}: Empty response]`;
  } catch (err: any) {
    clearTimeout(timeout);
    return `[${config.role} Error: ${err.message}]`;
  }
}

// ═══════════════════════════════════════════════
// INTERNAL: RESPONSE PARSERS
// ═══════════════════════════════════════════════

function parseHypothesis(response: string): { title?: string; noveltyEstimate?: number } {
  const titleMatch = response.match(/HYPOTHESIS:\s*(.+)/i) 
    || response.match(/SYNTHESIS_TITLE:\s*(.+)/i);
  return {
    title: titleMatch?.[1]?.trim(),
    noveltyEstimate: 7, // Default estimate
  };
}

function parseAdversaryResponse(response: string): {
  noveltyScore?: number;
  priorArt?: string[];
  flaws?: string[];
} {
  const scoreMatch = response.match(/NOVELTY\s*SCORE:\s*(\d+)/i);
  const priorArtMatch = response.match(/PRIOR\s*ART:\s*([\s\S]*?)(?=\n\n|\nTHEORETICAL|\nPRACTICAL|\nLOGICAL|$)/i);
  const flawMatch = response.match(/FATAL\s*FLAW:\s*([\s\S]*?)(?=\n\n|\nSALVAGE|$)/i);

  return {
    noveltyScore: scoreMatch ? parseInt(scoreMatch[1]) : undefined,
    priorArt: priorArtMatch ? [priorArtMatch[1].trim()] : [],
    flaws: flawMatch ? [flawMatch[1].trim()] : [],
  };
}

function parseArbiterResponse(response: string): {
  verdict?: string;
  confidence?: number;
  nextStep?: string;
} {
  const verdictMatch = response.match(/VERDICT:\s*(APPROVE|REJECT|REFINE)/i);
  const confMatch = response.match(/CONFIDENCE:\s*(\d+)/i);
  const nextMatch = response.match(/NEXT_STEP:\s*([\s\S]*?)(?=\n\n|$)/i);

  return {
    verdict: verdictMatch?.[1]?.toUpperCase(),
    confidence: confMatch ? parseInt(confMatch[1]) : undefined,
    nextStep: nextMatch?.[1]?.trim(),
  };
}

// ═══════════════════════════════════════════════
// INTERNAL: CREATIVE SEED FINDER
// ═══════════════════════════════════════════════

/**
 * Find creative seed nodes by combining random concepts from the knowledge base.
 * This is the "innovation spark" — random recombination of disparate ideas.
 */
function findCreativeSeeds(topic: string): string[] {
  const seeds: string[] = [];

  // 1. Direct semantic search
  const directResults = searchVectorStore(topic, undefined, 3);
  for (const r of directResults) {
    seeds.push(r.content.slice(0, 200));
  }

  // 2. Lateral search — search for tangentially related concepts
  const words = topic.split(/\s+/).filter(w => w.length > 3);
  for (const word of words.slice(0, 2)) {
    const lateral = searchVectorStore(word, undefined, 2, 0.1);
    for (const r of lateral) {
      if (!seeds.includes(r.content.slice(0, 200))) {
        seeds.push(r.content.slice(0, 200));
      }
    }
  }

  // 3. Graph-based serendipity — find entities connected to topic entities
  const graphResults = searchEntities(topic, undefined, undefined, 3);
  for (const entity of graphResults) {
    for (const rel of entity.relations) {
      seeds.push(`[${rel.type}] ${entity.name} → ${rel.relatedEntity}`);
    }
  }

  return seeds.slice(0, 8); // Cap at 8 seeds to avoid context overload
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}
