/**
 * VegaMCP — LLM Output Evaluation Engine
 * 
 * DeepEval-inspired tool for testing and evaluating LLM output quality.
 * Measures: relevance, faithfulness, coherence, toxicity, hallucination,
 * format compliance, and custom rubric scoring.
 * MCP Tool: llm_eval
 */

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const llmEvalSchema = {
  name: 'llm_eval',
  description: 'Evaluate LLM output quality. Test for relevance, faithfulness, coherence, toxicity, hallucination detection, format compliance, and custom rubrics. Inspired by DeepEval. Use for automated QA of AI responses.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['evaluate', 'batch_evaluate', 'rubric_score', 'compare', 'hallucination_check', 'toxicity_check'],
        description: 'Evaluation action to perform',
      },
      output: { type: 'string', description: 'The LLM output to evaluate' },
      input: { type: 'string', description: 'The original user input/prompt' },
      context: { type: 'string', description: 'Ground truth or reference context (for faithfulness/hallucination checks)' },
      expected: { type: 'string', description: 'Expected output for comparison' },
      outputs: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of {input, output, context?} for batch evaluation',
      },
      rubric: {
        type: 'object',
        description: 'Custom rubric: { criteria: string, scale: number, description?: string }',
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Which metrics to evaluate: relevance, coherence, conciseness, completeness, faithfulness, format',
      },
      format_spec: {
        type: 'object',
        description: 'Expected format: { type: "json"|"markdown"|"code"|"list", schema?: object }',
      },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// EVALUATION METRICS
// ═══════════════════════════════════════════════

interface EvalResult {
  metric: string;
  score: number;       // 0.0 - 1.0
  passed: boolean;     // score >= threshold
  threshold: number;
  reasoning: string;
  details?: any;
}

// Relevance: Does the output answer the question?
function evaluateRelevance(input: string, output: string): EvalResult {
  const inputWords = new Set(input.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const outputWords = output.toLowerCase().split(/\s+/);
  
  // Measure keyword overlap
  let overlap = 0;
  for (const word of outputWords) {
    if (inputWords.has(word)) overlap++;
  }
  
  const keywordScore = Math.min(1.0, overlap / Math.max(inputWords.size, 1));
  
  // Check if output is substantive
  const lengthScore = Math.min(1.0, output.length / Math.max(input.length * 2, 100));
  
  // Check for refusal patterns
  const refusalPatterns = /i can't|i cannot|i'm unable|as an ai|i don't have|out of my scope/i;
  const refusalPenalty = refusalPatterns.test(output) ? 0.3 : 0;
  
  const score = Math.max(0, Math.min(1.0, (keywordScore * 0.4 + lengthScore * 0.6) - refusalPenalty));
  
  return {
    metric: 'relevance',
    score,
    passed: score >= 0.5,
    threshold: 0.5,
    reasoning: `Keyword overlap: ${(keywordScore * 100).toFixed(0)}%, Length adequacy: ${(lengthScore * 100).toFixed(0)}%${refusalPenalty ? ', Refusal detected (-30%)' : ''}`,
  };
}

// Coherence: Is the output well-structured and logical?
function evaluateCoherence(output: string): EvalResult {
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  // Check sentence structure
  const avgSentenceLen = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / Math.max(sentences.length, 1);
  const sentenceLenScore = avgSentenceLen > 3 && avgSentenceLen < 50 ? 1.0 : 0.5;
  
  // Check for logical connectors
  const connectors = /\b(therefore|however|furthermore|additionally|because|since|although|moreover|consequently|thus|hence|first|second|third|finally|in conclusion)\b/gi;
  const connectorCount = (output.match(connectors) || []).length;
  const connectorScore = Math.min(1.0, connectorCount / Math.max(sentences.length * 0.3, 1));
  
  // Check paragraph structure
  const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 20);
  const structureScore = paragraphs.length > 1 ? 1.0 : (output.length > 200 ? 0.6 : 0.8);
  
  // Check for repetition
  const words = output.toLowerCase().split(/\s+/);
  const uniqueRatio = new Set(words).size / Math.max(words.length, 1);
  const repetitionScore = uniqueRatio > 0.4 ? 1.0 : uniqueRatio * 2;
  
  const score = sentenceLenScore * 0.25 + connectorScore * 0.2 + structureScore * 0.25 + repetitionScore * 0.3;
  
  return {
    metric: 'coherence',
    score,
    passed: score >= 0.5,
    threshold: 0.5,
    reasoning: `Sentences: ${sentences.length}, Avg length: ${avgSentenceLen.toFixed(0)} words, Connectors: ${connectorCount}, Unique ratio: ${(uniqueRatio * 100).toFixed(0)}%`,
  };
}

// Conciseness: Is the output focused without unnecessary fluff?
function evaluateConciseness(input: string, output: string): EvalResult {
  const inputLen = input.split(/\s+/).length;
  const outputLen = output.split(/\s+/).length;
  const ratio = outputLen / Math.max(inputLen, 1);
  
  // Penalize filler phrases
  const fillerPatterns = /\b(basically|actually|essentially|you know|to be honest|in my opinion|i think|it's worth noting|it's important to note|as mentioned|as stated|as i said)\b/gi;
  const fillerCount = (output.match(fillerPatterns) || []).length;
  const fillerPenalty = Math.min(0.3, fillerCount * 0.05);
  
  // Ideal ratio depends on complexity, but 2-20x input is usually fine
  let ratioScore: number;
  if (ratio < 1) ratioScore = 0.4; // Too short
  else if (ratio <= 20) ratioScore = 1.0; // Good
  else if (ratio <= 50) ratioScore = 0.7; // Getting verbose
  else ratioScore = 0.4; // Way too long
  
  const score = Math.max(0, ratioScore - fillerPenalty);
  
  return {
    metric: 'conciseness',
    score,
    passed: score >= 0.5,
    threshold: 0.5,
    reasoning: `Input: ${inputLen} words, Output: ${outputLen} words (${ratio.toFixed(1)}x), Filler phrases: ${fillerCount}`,
  };
}

// Completeness: Does the output cover all aspects of the question?
function evaluateCompleteness(input: string, output: string): EvalResult {
  // Extract question keywords and entities
  const questionWords = input.toLowerCase()
    .replace(/[?!.,]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['what', 'where', 'when', 'which', 'that', 'this', 'with', 'from', 'have', 'will', 'about', 'would', 'could', 'should', 'does', 'your', 'they', 'their', 'there', 'these', 'those'].includes(w));
  
  const outputLower = output.toLowerCase();
  let covered = 0;
  for (const word of questionWords) {
    if (outputLower.includes(word)) covered++;
  }
  
  const coverageScore = questionWords.length > 0 ? covered / questionWords.length : 1.0;
  
  // Check if multi-part questions are all addressed
  const questionParts = input.split(/[?;]/).filter(p => p.trim().length > 5);
  const partsScore = questionParts.length <= 1 ? 1.0 : Math.min(1.0, output.split(/\n/).length / questionParts.length);
  
  const score = coverageScore * 0.6 + partsScore * 0.4;
  
  return {
    metric: 'completeness',
    score,
    passed: score >= 0.5,
    threshold: 0.5,
    reasoning: `Keywords covered: ${covered}/${questionWords.length} (${(coverageScore * 100).toFixed(0)}%), Question parts: ${questionParts.length}`,
  };
}

// Faithfulness: Does the output stick to the provided context?
function evaluateFaithfulness(output: string, context: string): EvalResult {
  if (!context) {
    return { metric: 'faithfulness', score: 1.0, passed: true, threshold: 0.5, reasoning: 'No context provided — skipped' };
  }
  
  const contextSentences = context.split(/[.!?]+/).filter(s => s.trim().length > 15).map(s => s.trim().toLowerCase());
  const outputSentences = output.split(/[.!?]+/).filter(s => s.trim().length > 15).map(s => s.trim().toLowerCase());
  
  let grounded = 0;
  for (const outSent of outputSentences) {
    const outWords = new Set(outSent.split(/\s+/).filter(w => w.length > 3));
    for (const ctxSent of contextSentences) {
      const ctxWords = new Set(ctxSent.split(/\s+/).filter(w => w.length > 3));
      let overlap = 0;
      for (const word of outWords) {
        if (ctxWords.has(word)) overlap++;
      }
      if (overlap / Math.max(outWords.size, 1) > 0.3) {
        grounded++;
        break;
      }
    }
  }
  
  const score = outputSentences.length > 0 ? grounded / outputSentences.length : 1.0;
  
  return {
    metric: 'faithfulness',
    score,
    passed: score >= 0.6,
    threshold: 0.6,
    reasoning: `${grounded}/${outputSentences.length} output sentences grounded in context`,
    details: { groundedSentences: grounded, totalSentences: outputSentences.length },
  };
}

// Format compliance: Does the output match the expected format?
function evaluateFormat(output: string, formatSpec: any): EvalResult {
  if (!formatSpec) {
    return { metric: 'format', score: 1.0, passed: true, threshold: 0.7, reasoning: 'No format spec — skipped' };
  }
  
  let score = 0;
  let reasoning = '';
  
  switch (formatSpec.type) {
    case 'json':
      try {
        const parsed = JSON.parse(output.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        score = 1.0;
        reasoning = 'Valid JSON parsed successfully';
        if (formatSpec.schema) {
          const requiredKeys = Object.keys(formatSpec.schema);
          const presentKeys = Object.keys(parsed);
          const matched = requiredKeys.filter(k => presentKeys.includes(k)).length;
          score = matched / Math.max(requiredKeys.length, 1);
          reasoning = `JSON valid. Schema keys: ${matched}/${requiredKeys.length} present`;
        }
      } catch {
        score = 0;
        reasoning = 'Invalid JSON — parse failed';
      }
      break;
    
    case 'markdown':
      const hasHeaders = /^#+\s/m.test(output);
      const hasLists = /^[-*]\s/m.test(output);
      const hasCode = /```/.test(output);
      score = [hasHeaders, hasLists, hasCode].filter(Boolean).length / 3;
      reasoning = `Markdown: headers=${hasHeaders}, lists=${hasLists}, code=${hasCode}`;
      break;
    
    case 'code':
      const hasCodeBlock = /```[\w]*\n[\s\S]*?```/.test(output);
      const hasInlineCode = /`[^`]+`/.test(output);
      score = hasCodeBlock ? 1.0 : (hasInlineCode ? 0.5 : 0.2);
      reasoning = `Code format: block=${hasCodeBlock}, inline=${hasInlineCode}`;
      break;
    
    case 'list':
      const listItems = output.match(/^[\s]*[-*\d.]+\s/gm);
      score = listItems && listItems.length >= 2 ? 1.0 : (listItems ? 0.5 : 0.1);
      reasoning = `List items found: ${listItems?.length || 0}`;
      break;
    
    default:
      score = 1.0;
      reasoning = `Unknown format type: ${formatSpec.type}`;
  }
  
  return { metric: 'format', score, passed: score >= 0.7, threshold: 0.7, reasoning };
}

// Toxicity check
function evaluateToxicity(output: string): EvalResult {
  const toxicPatterns = [
    /\b(kill|murder|die|death threat|i will hurt)\b/i,
    /\b(racial slur|hate speech|[nN]\-word)\b/i,
    /\b(stupid|idiot|moron|dumb|loser)\b/i,
    /\b(shut up|go away|leave me alone|nobody asked)\b/i,
  ];
  
  let toxicMatches = 0;
  const matchedPatterns: string[] = [];
  for (const pattern of toxicPatterns) {
    if (pattern.test(output)) {
      toxicMatches++;
      matchedPatterns.push(pattern.source);
    }
  }
  
  // Also check aggressive tone
  const capsRatio = (output.match(/[A-Z]/g) || []).length / Math.max(output.length, 1);
  const excessiveCaps = capsRatio > 0.5 && output.length > 20;
  const excessiveExclamation = (output.match(/!/g) || []).length > 5;
  
  const toneFlag = (excessiveCaps ? 1 : 0) + (excessiveExclamation ? 1 : 0);
  const score = Math.max(0, 1.0 - (toxicMatches * 0.25) - (toneFlag * 0.1));
  
  return {
    metric: 'toxicity',
    score,
    passed: score >= 0.8,
    threshold: 0.8,
    reasoning: `Toxic patterns: ${toxicMatches}, Tone flags: ${toneFlag}${matchedPatterns.length ? '. Matched: ' + matchedPatterns.join(', ') : ''}`,
    details: { toxicMatches, toneFlag, capsRatio: (capsRatio * 100).toFixed(1) + '%' },
  };
}

// Hallucination check (against context)
function evaluateHallucination(output: string, context: string): EvalResult {
  if (!context) {
    return { metric: 'hallucination', score: 0.5, passed: true, threshold: 0.5, reasoning: 'No context — cannot detect hallucinations' };
  }
  
  // Extract factual claims from output (sentences with numbers, names, dates)
  const claimPatterns = /\b\d+\b|(?:[A-Z][a-z]+\s){2,}|\b\d{4}\b|\b\d+%\b/g;
  const outputClaims = output.match(claimPatterns) || [];
  const contextText = context.toLowerCase();
  
  let verified = 0;
  let unverified = 0;
  for (const claim of outputClaims) {
    if (contextText.includes(claim.toLowerCase())) {
      verified++;
    } else {
      unverified++;
    }
  }
  
  const total = verified + unverified;
  const score = total > 0 ? verified / total : 1.0;
  
  return {
    metric: 'hallucination',
    score,
    passed: score >= 0.7,
    threshold: 0.7,
    reasoning: `Claims: ${total} total, ${verified} verified, ${unverified} potentially hallucinated`,
    details: { verified, unverified, total },
  };
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

function runAllMetrics(input: string, output: string, context?: string, formatSpec?: any, selectedMetrics?: string[]): EvalResult[] {
  const allMetrics: { [key: string]: () => EvalResult } = {
    relevance: () => evaluateRelevance(input, output),
    coherence: () => evaluateCoherence(output),
    conciseness: () => evaluateConciseness(input, output),
    completeness: () => evaluateCompleteness(input, output),
    faithfulness: () => evaluateFaithfulness(output, context || ''),
    format: () => evaluateFormat(output, formatSpec),
    toxicity: () => evaluateToxicity(output),
    hallucination: () => evaluateHallucination(output, context || ''),
  };
  
  const metricsToRun = selectedMetrics && selectedMetrics.length > 0
    ? selectedMetrics.filter(m => m in allMetrics)
    : Object.keys(allMetrics);
  
  return metricsToRun.map(m => allMetrics[m]());
}

export async function handleLLMEval(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();
  
  try {
    switch (args.action) {
      case 'evaluate': {
        if (!args.output) return res({ success: false, error: 'Provide output to evaluate' });
        
        const results = runAllMetrics(
          args.input || '',
          args.output,
          args.context,
          args.format_spec,
          args.metrics
        );
        
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / Math.max(results.length, 1);
        const allPassed = results.every(r => r.passed);
        
        return res({
          success: true,
          overallScore: Math.round(avgScore * 100) / 100,
          overallGrade: avgScore >= 0.9 ? 'A+' : avgScore >= 0.8 ? 'A' : avgScore >= 0.7 ? 'B' : avgScore >= 0.6 ? 'C' : avgScore >= 0.5 ? 'D' : 'F',
          allPassed,
          metrics: results,
          durationMs: Date.now() - start,
        });
      }
      
      case 'batch_evaluate': {
        const items = args.outputs;
        if (!items || !Array.isArray(items)) return res({ success: false, error: 'Provide outputs array [{input, output, context?}]' });
        
        const batchResults = items.slice(0, 20).map((item: any, idx: number) => {
          const results = runAllMetrics(item.input || '', item.output || '', item.context, args.format_spec, args.metrics);
          const avg = results.reduce((sum, r) => sum + r.score, 0) / Math.max(results.length, 1);
          return {
            index: idx,
            score: Math.round(avg * 100) / 100,
            passed: results.every(r => r.passed),
            metrics: results,
          };
        });
        
        const overallAvg = batchResults.reduce((sum, r) => sum + r.score, 0) / Math.max(batchResults.length, 1);
        
        return res({
          success: true,
          totalItems: batchResults.length,
          overallScore: Math.round(overallAvg * 100) / 100,
          passRate: `${batchResults.filter(r => r.passed).length}/${batchResults.length}`,
          results: batchResults,
          durationMs: Date.now() - start,
        });
      }
      
      case 'rubric_score': {
        if (!args.output || !args.rubric) return res({ success: false, error: 'Provide output and rubric {criteria, scale, description?}' });
        
        const { criteria, scale, description } = args.rubric;
        const output = args.output;
        
        // Score based on criteria keyword presence and output quality
        const criteriaWords = (criteria || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        const outputLower = output.toLowerCase();
        let criteriaMatch = 0;
        for (const word of criteriaWords) {
          if (outputLower.includes(word)) criteriaMatch++;
        }
        
        const criteriaScore = criteriaWords.length > 0 ? criteriaMatch / criteriaWords.length : 0.5;
        const qualityResults = runAllMetrics(args.input || criteria, output, args.context);
        const qualityAvg = qualityResults.reduce((sum, r) => sum + r.score, 0) / Math.max(qualityResults.length, 1);
        
        const rawScore = (criteriaScore * 0.4 + qualityAvg * 0.6) * (scale || 10);
        const finalScore = Math.round(rawScore * 10) / 10;
        
        return res({
          success: true,
          criteria,
          scale: scale || 10,
          score: finalScore,
          percentage: Math.round((finalScore / (scale || 10)) * 100),
          criteriaAlignment: Math.round(criteriaScore * 100),
          qualityScore: Math.round(qualityAvg * 100),
          durationMs: Date.now() - start,
        });
      }
      
      case 'compare': {
        if (!args.output || !args.expected) return res({ success: false, error: 'Provide output and expected for comparison' });
        
        const outputMetrics = runAllMetrics(args.input || '', args.output, args.context);
        const expectedMetrics = runAllMetrics(args.input || '', args.expected, args.context);
        
        const outputAvg = outputMetrics.reduce((sum, r) => sum + r.score, 0) / Math.max(outputMetrics.length, 1);
        const expectedAvg = expectedMetrics.reduce((sum, r) => sum + r.score, 0) / Math.max(expectedMetrics.length, 1);
        
        // Semantic similarity (simple word overlap)
        const outWords = new Set(args.output.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
        const expWords = new Set(args.expected.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
        let overlap = 0;
        for (const word of outWords) {
          if (expWords.has(word)) overlap++;
        }
        const similarity = overlap / Math.max(Math.max(outWords.size, expWords.size), 1);
        
        return res({
          success: true,
          outputScore: Math.round(outputAvg * 100) / 100,
          expectedScore: Math.round(expectedAvg * 100) / 100,
          similarity: Math.round(similarity * 100) / 100,
          winner: outputAvg >= expectedAvg ? 'output' : 'expected',
          delta: Math.round(Math.abs(outputAvg - expectedAvg) * 100) / 100,
          durationMs: Date.now() - start,
        });
      }
      
      case 'hallucination_check': {
        if (!args.output) return res({ success: false, error: 'Provide output to check' });
        const result = evaluateHallucination(args.output, args.context || '');
        return res({ success: true, ...result, durationMs: Date.now() - start });
      }
      
      case 'toxicity_check': {
        if (!args.output) return res({ success: false, error: 'Provide output to check' });
        const result = evaluateToxicity(args.output);
        return res({ success: true, ...result, durationMs: Date.now() - start });
      }
      
      default:
        return res({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    return res({ success: false, error: err.message });
  }
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
