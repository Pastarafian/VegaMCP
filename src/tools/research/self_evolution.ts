/**
 * VegaMCP — Self-Evolution Engine (RLM 2.0)
 * 
 * Implements the "Feedback Transformer" loop:
 *   1. EXECUTION — AI writes code for a new idea in the Code Sandbox
 *   2. FAILURE ANALYSIS — Error logs → Post-Mortem Agent
 *   3. LEARNED GUARDRAIL — Post-Mortem writes constraints to Memory Bridge
 *   4. FUTURE AVOIDANCE — Next generation queries past failures first
 * 
 * Also provides:
 *   • Success tracking with confidence boosting
 *   • Pattern extraction from successful runs
 *   • Constraint evolution (constraints can be refined over time)
 *   • Evolution metrics and self-assessment
 */

import {
  learn,
  recall,
  recallFailures,
  recallConstraints,
  learnFromFailure,
  consolidateMemory,
  getBridgeStats,
  type BridgedMemory,
  type ConsolidationReport,
} from '../../db/vector-graph-bridge.js';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const selfEvolutionSchema = {
  name: 'self_evolution',
  description: `Self-Evolution Engine (RLM 2.0) — The feedback transformer that lets the system learn from its own mistakes. Records failures as guardrails, tracks successes as patterns, consolidates memory, and provides evolution metrics. Actions: record_failure (learn from error), record_success (reinforce good patterns), recall_failures (query past mistakes), recall_constraints (query learned guardrails), consolidate (run nightly memory promotion), evolve_constraint (refine an existing guardrail), metrics (system self-assessment), pre_check (query before attempting something new).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: [
          'record_failure', 'record_success', 'recall_failures', 
          'recall_constraints', 'consolidate', 'evolve_constraint',
          'metrics', 'pre_check',
        ],
        description: 'Action to perform',
      },
      error_log: {
        type: 'string',
        description: 'Error log or failure description (for record_failure)',
      },
      context: {
        type: 'string',
        description: 'Context of the execution (what was being attempted)',
      },
      hypothesis_id: {
        type: 'string',
        description: 'Linked hypothesis ID (optional)',
      },
      constraint: {
        type: 'string',
        description: 'Suggested constraint/guardrail to learn (for record_failure)',
      },
      success_description: {
        type: 'string',
        description: 'Description of what succeeded (for record_success)',
      },
      pattern: {
        type: 'string',
        description: 'Pattern extracted from success (for record_success)',
      },
      query: {
        type: 'string',
        description: 'Search query (for recall_failures, recall_constraints, pre_check)',
      },
      constraint_id: {
        type: 'string',
        description: 'ID of constraint to evolve (for evolve_constraint)',
      },
      refined_constraint: {
        type: 'string',
        description: 'Updated constraint text (for evolve_constraint)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 10)',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleSelfEvolution(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;

  try {
    switch (action) {
      case 'record_failure':
        return await handleRecordFailure(args);
      case 'record_success':
        return await handleRecordSuccess(args);
      case 'recall_failures':
        return handleRecallFailures(args);
      case 'recall_constraints':
        return handleRecallConstraints(args);
      case 'consolidate':
        return handleConsolidate();
      case 'evolve_constraint':
        return await handleEvolveConstraint(args);
      case 'metrics':
        return handleMetrics();
      case 'pre_check':
        return handlePreCheck(args);
      default:
        return result({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return result({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// ACTION: RECORD FAILURE
// ═══════════════════════════════════════════════

async function handleRecordFailure(args: any) {
  const { error_log, context, hypothesis_id, constraint } = args;
  if (!error_log) return result({ error: 'error_log is required' });
  if (!context) return result({ error: 'context is required' });

  const memory = await learnFromFailure(
    error_log,
    context,
    hypothesis_id,
    constraint
  );

  return result({
    status: 'failure_recorded',
    failureId: memory.id,
    constraintCreated: !!constraint,
    message: constraint 
      ? `Failure recorded and constraint "${constraint.slice(0, 100)}" learned as guardrail.`
      : 'Failure recorded. Consider adding a constraint suggestion for future avoidance.',
    selfEvolution: {
      failuresRecorded: getBridgeStats().failureEntries,
      constraintsActive: getBridgeStats().constraintEntries,
    },
  });
}

// ═══════════════════════════════════════════════
// ACTION: RECORD SUCCESS
// ═══════════════════════════════════════════════

async function handleRecordSuccess(args: any) {
  const { success_description, pattern, context, hypothesis_id } = args;
  if (!success_description) return result({ error: 'success_description is required' });

  // Record the success
  const successMemory = await learn({
    content: `SUCCESS: ${success_description}${context ? `\nCONTEXT: ${context}` : ''}`,
    entityName: `success_${Date.now()}`,
    entityType: 'success',
    domain: 'self-evolution',
    source: 'feedback-transformer',
    confidence: 0.8,
    tags: ['success', 'reinforcement'],
  });

  // If a pattern was extracted, store it separately
  let patternMemory: BridgedMemory | null = null;
  if (pattern) {
    patternMemory = await learn({
      content: `PATTERN: ${pattern}`,
      entityName: `pattern_${Date.now()}`,
      entityType: 'pattern',
      domain: 'self-evolution',
      source: 'feedback-transformer',
      confidence: 0.7,
      relatedTo: [{
        entityName: successMemory.id,
        relationType: 'extracted_from',
      }],
      tags: ['pattern', 'best-practice', 'auto-learned'],
    });
  }

  return result({
    status: 'success_recorded',
    successId: successMemory.id,
    patternId: patternMemory?.id,
    patternExtracted: !!pattern,
    message: pattern 
      ? `Success recorded with pattern: "${pattern.slice(0, 100)}"`
      : 'Success recorded. Consider extracting a reusable pattern.',
  });
}

// ═══════════════════════════════════════════════
// ACTION: RECALL FAILURES
// ═══════════════════════════════════════════════

function handleRecallFailures(args: any) {
  const { query, limit = 10 } = args;
  if (!query) return result({ error: 'query is required' });

  const failures = recallFailures(query, limit);
  return result({
    query,
    count: failures.length,
    failures: failures.map(f => ({
      id: f.id,
      content: f.content,
      confidence: f.confidenceScore,
      source: f.metadata?.source,
      relatedConstraints: f.relations
        .filter(r => r.type === 'derived_from')
        .map(r => r.relatedEntity),
      lastAccessed: f.lastAccessed,
    })),
    advice: failures.length > 0 
      ? 'Consider these past failures before proceeding. The constraints they generated should be respected.'
      : 'No relevant past failures found. Proceed with caution and monitor for new failure modes.',
  });
}

// ═══════════════════════════════════════════════
// ACTION: RECALL CONSTRAINTS
// ═══════════════════════════════════════════════

function handleRecallConstraints(args: any) {
  const { query, limit = 10 } = args;
  if (!query) return result({ error: 'query is required' });

  const constraints = recallConstraints(query, limit);
  return result({
    query,
    count: constraints.length,
    constraints: constraints.map(c => ({
      id: c.id,
      content: c.content,
      confidence: c.confidenceScore,
      source: c.metadata?.source,
      accessCount: c.accessCount,
      derivedFrom: c.relations
        .filter(r => r.type === 'derived_from')
        .map(r => r.relatedEntity),
    })),
    enforcement: constraints.length > 0
      ? '⚠️ The following guardrails MUST be respected to avoid repeating past mistakes.'
      : 'No relevant constraints found. This is relatively unexplored territory.',
  });
}

// ═══════════════════════════════════════════════
// ACTION: CONSOLIDATE (Nightly Memory Promotion)
// ═══════════════════════════════════════════════

function handleConsolidate() {
  const report = consolidateMemory();
  return result({
    status: 'consolidation_complete',
    report,
    summary: `Reviewed ${report.entriesReviewed} entries: ${report.promoted} promoted, ${report.strengthened} strengthened, ${report.decayed} decayed.`,
    failureCount: report.failures.length,
    health: report.failures.length === 0 ? '✅ Healthy' : '⚠️ Issues detected',
  });
}

// ═══════════════════════════════════════════════
// ACTION: EVOLVE CONSTRAINT
// ═══════════════════════════════════════════════

async function handleEvolveConstraint(args: any) {
  const { constraint_id, refined_constraint, context } = args;
  if (!constraint_id) return result({ error: 'constraint_id is required' });
  if (!refined_constraint) return result({ error: 'refined_constraint is required' });

  // Create evolved constraint linked to the original
  const evolved = await learn({
    content: `EVOLVED CONSTRAINT: ${refined_constraint}`,
    entityName: `constraint_evolved_${Date.now()}`,
    entityType: 'constraint',
    domain: 'self-evolution',
    source: 'constraint-evolution',
    confidence: 0.75,
    isConstraint: true,
    relatedTo: [{
      entityName: constraint_id,
      relationType: 'supersedes',
      strength: 1.0,
    }],
    tags: ['constraint', 'evolved', 'guardrail'],
  });

  return result({
    status: 'constraint_evolved',
    originalId: constraint_id,
    evolvedId: evolved.id,
    newContent: refined_constraint,
    message: `Constraint evolved. Original preserved for audit trail. New constraint: "${refined_constraint.slice(0, 100)}"`,
  });
}

// ═══════════════════════════════════════════════
// ACTION: METRICS (Self-Assessment)
// ═══════════════════════════════════════════════

function handleMetrics() {
  const stats = getBridgeStats();
  
  // Calculate evolution score (0-100)
  const totalMemories = stats.totalBridgedEntries;
  const failureAvoidanceRate = totalMemories > 0 
    ? Math.min(100, (stats.constraintEntries / Math.max(1, stats.failureEntries)) * 50)
    : 0;
  const promotionRate = totalMemories > 0 
    ? (stats.promotedEntries / totalMemories) * 100 
    : 0;
  const currentConfidence = stats.avgConfidence * 100;
  
  const evolutionScore = Math.round(
    (failureAvoidanceRate * 0.3 + promotionRate * 0.3 + currentConfidence * 0.4)
  );

  return result({
    evolutionScore,
    grade: evolutionScore >= 80 ? 'A' : evolutionScore >= 60 ? 'B' 
         : evolutionScore >= 40 ? 'C' : evolutionScore >= 20 ? 'D' : 'F',
    metrics: {
      totalMemories: stats.totalBridgedEntries,
      failures: stats.failureEntries,
      constraints: stats.constraintEntries,
      promoted: stats.promotedEntries,
      avgConfidence: stats.avgConfidence,
      totalAccesses: stats.totalAccessCount,
      failureAvoidanceRate: Math.round(failureAvoidanceRate),
      promotionRate: Math.round(promotionRate),
    },
    hypotheses: stats.hypothesisCounts,
    sources: stats.sourceDistribution,
    lastConsolidation: stats.lastConsolidation,
    vectorStore: stats.vectorStats,
    recommendations: generateRecommendations(stats),
  });
}

// ═══════════════════════════════════════════════
// ACTION: PRE-CHECK (Before Attempting Something)
// ═══════════════════════════════════════════════

function handlePreCheck(args: any) {
  const { query, limit = 5 } = args;
  if (!query) return result({ error: 'query is required' });

  // Check for related failures
  const failures = recallFailures(query, limit);
  
  // Check for constraints
  const constraints = recallConstraints(query, limit);

  // Check for existing knowledge
  const existing = recall(query, { limit, includeFailures: false });

  // Risk assessment
  const riskLevel = failures.length >= 3 ? 'HIGH' 
    : failures.length >= 1 ? 'MEDIUM' 
    : 'LOW';

  return result({
    query,
    riskLevel,
    riskIcon: riskLevel === 'HIGH' ? '🔴' : riskLevel === 'MEDIUM' ? '🟡' : '🟢',
    
    relatedFailures: {
      count: failures.length,
      items: failures.map(f => ({
        content: f.content.slice(0, 200),
        confidence: f.confidenceScore,
      })),
    },
    
    activeConstraints: {
      count: constraints.length,
      items: constraints.map(c => ({
        content: c.content.slice(0, 200),
        confidence: c.confidenceScore,
      })),
    },
    
    existingKnowledge: {
      count: existing.memories.length,
      items: existing.memories.map(m => ({
        content: m.content.slice(0, 200),
        source: m.source,
        confidence: m.confidenceScore,
      })),
    },
    
    advice: riskLevel === 'HIGH'
      ? `⚠️ HIGH RISK: ${failures.length} related past failures found. Review constraints carefully before proceeding.`
      : riskLevel === 'MEDIUM'
        ? `🟡 MODERATE RISK: Some related failures exist. Proceed with extra validation.`
        : `🟢 LOW RISK: No significant past failures found. Proceed normally.`,
  });
}

// ═══════════════════════════════════════════════
// INTERNAL: RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════

function generateRecommendations(stats: ReturnType<typeof getBridgeStats>): string[] {
  const recs: string[] = [];

  if (stats.totalBridgedEntries === 0) {
    recs.push('🌱 No memories yet. Start by learning some domain knowledge.');
  }

  if (stats.failureEntries > 0 && stats.constraintEntries === 0) {
    recs.push('⚠️ Failures recorded but no constraints created. Extract guardrails from failures.');
  }

  if (stats.avgConfidence < 0.3) {
    recs.push('📊 Average confidence is low. Run consolidation to promote verified knowledge.');
  }

  if (stats.promotedEntries === 0 && stats.totalBridgedEntries > 10) {
    recs.push('📈 No entries promoted yet. Run consolidation to promote high-confidence knowledge.');
  }

  if (!stats.lastConsolidation) {
    recs.push('🌙 No consolidation has been run yet. Schedule regular memory consolidation.');
  }

  const totalHypotheses = Object.values(stats.hypothesisCounts).reduce((a, b) => a + b, 0);
  if (totalHypotheses === 0) {
    recs.push('💡 No hypotheses generated. Try the hypothesis_generator tool to start innovating.');
  }

  if (stats.totalAccessCount < stats.totalBridgedEntries) {
    recs.push('🔍 Many memories have never been accessed. Consider running pre-checks more often.');
  }

  if (recs.length === 0) {
    recs.push('✅ System is healthy. Keep generating, debating, and learning!');
  }

  return recs;
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════

function result(data: any): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}
