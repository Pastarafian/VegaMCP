/**
 * VegaMCP — Shared Testing Utilities (v7.1)
 * 
 * Common utilities used across all testing tools:
 * - Test metadata generation (_meta blocks)
 * - Structured event logging (timeline events)
 * - AI analysis enrichment helpers
 * - Error fingerprinting
 * - Test history tracking
 * - Comparison analysis
 */

import crypto from 'crypto';

// ============================================================
// Test Metadata (_meta block for every test output)
// ============================================================

export interface TestMeta {
  tool: string;
  action: string;
  test_id: string;
  timestamp: string;
  duration_ms: number;
  browser?: string;
  viewport?: { width: number; height: number };
  url?: string;
  network_conditions?: string;
  user_agent?: string;
}

export function createTestMeta(tool: string, action: string, startTime: number, extra?: Partial<TestMeta>): TestMeta {
  return {
    tool,
    action,
    test_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    ...extra,
  };
}

// ============================================================
// Structured Event Log (Timeline Events)
// ============================================================

export interface TimelineEvent {
  t: number;       // ms since test start
  type: string;    // event type
  detail?: string; // optional detail
  data?: any;      // optional structured data
}

export class EventTimeline {
  private events: TimelineEvent[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  emit(type: string, detail?: string, data?: any): void {
    this.events.push({
      t: Date.now() - this.startTime,
      type,
      ...(detail ? { detail } : {}),
      ...(data ? { data } : {}),
    });
  }

  getEvents(): TimelineEvent[] {
    return this.events;
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }
}

// ============================================================
// Error Fingerprinting
// ============================================================

export interface ErrorFingerprint {
  id: string;
  type: string;
  pattern: string;
  message: string;
  source?: string;
  line?: number;
  auto_category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  suggested_fix?: string;
}

const ERROR_PATTERNS: Array<{ regex: RegExp; category: string; severity: ErrorFingerprint['severity']; fix_template: string }> = [
  { regex: /Cannot read propert(y|ies) of (null|undefined)/i, category: 'null_reference', severity: 'high', fix_template: 'Add optional chaining (?.) or null check before accessing property' },
  { regex: /is not a function/i, category: 'type_error', severity: 'high', fix_template: 'Check that the variable is defined and is a function before calling' },
  { regex: /is not defined/i, category: 'reference_error', severity: 'high', fix_template: 'Ensure the variable is declared and imported correctly' },
  { regex: /Failed to fetch|NetworkError|net::ERR/i, category: 'network_error', severity: 'medium', fix_template: 'Check CORS headers, API endpoint availability, and network connectivity' },
  { regex: /CORS|Access-Control-Allow/i, category: 'cors_error', severity: 'medium', fix_template: 'Configure CORS headers on the API server or use a proxy' },
  { regex: /SyntaxError|Unexpected token/i, category: 'syntax_error', severity: 'critical', fix_template: 'Fix the syntax error in the JavaScript/JSON — likely a parsing issue' },
  { regex: /Maximum call stack|stack overflow/i, category: 'stack_overflow', severity: 'critical', fix_template: 'Check for infinite recursion or circular references' },
  { regex: /out of memory|allocation failed/i, category: 'memory_error', severity: 'critical', fix_template: 'Reduce memory usage — check for memory leaks, large arrays, or DOM node accumulation' },
  { regex: /404|Not Found/i, category: 'resource_not_found', severity: 'medium', fix_template: 'Check the resource URL and ensure the file/API exists at the expected path' },
  { regex: /403|Forbidden/i, category: 'auth_error', severity: 'medium', fix_template: 'Check authentication credentials and permissions' },
  { regex: /500|Internal Server Error/i, category: 'server_error', severity: 'high', fix_template: 'Server-side error — check server logs for the root cause' },
  { regex: /timeout|Timed out/i, category: 'timeout', severity: 'medium', fix_template: 'Increase timeout or optimize the slow operation' },
  { regex: /deprecated/i, category: 'deprecation', severity: 'low', fix_template: 'Update to the recommended replacement API before it is removed' },
  { regex: /mixed content|insecure/i, category: 'security_warning', severity: 'medium', fix_template: 'Serve all resources over HTTPS to avoid mixed content warnings' },
  { regex: /Content Security Policy|CSP/i, category: 'csp_violation', severity: 'medium', fix_template: 'Update Content-Security-Policy header to allow the blocked resource' },
];

export function fingerprintError(message: string, source?: string, line?: number): ErrorFingerprint {
  const match = ERROR_PATTERNS.find(p => p.regex.test(message));
  const hash = crypto.createHash('md5').update(message.substring(0, 100)).digest('hex').substring(0, 12);

  return {
    id: `ERR-${hash}`,
    type: match?.category === 'syntax_error' ? 'SyntaxError' :
          match?.category === 'null_reference' ? 'TypeError' :
          match?.category === 'reference_error' ? 'ReferenceError' :
          match?.category === 'network_error' ? 'NetworkError' :
          'Error',
    pattern: match?.regex.source.substring(0, 60) || 'unclassified',
    message: message.substring(0, 200),
    source,
    line,
    auto_category: match?.category || 'unclassified',
    severity: match?.severity || 'medium',
    suggested_fix: match?.fix_template,
  };
}

// ============================================================
// ALIVE: Instructive Verbal Evaluation (Cognitive Synergy)
// ============================================================

export interface CognitiveEvaluation {
  symptom: string;
  underlying_principle: string;
  instructive_feedback: string;
}

export function generateInstructiveEvaluation(fingerprint: ErrorFingerprint): CognitiveEvaluation {
  // Rather than just returning a raw stack trace, we return "Instructive Verbal Evaluation"
  // based on the ALIVE framework (arXiv:2602.05472) to internalize the logic of correctness.
  
  let principle = "An unhandled exception occurred, violating the runtime execution contract.";
  let feedback = "Review the raw error and trace to identify the exact line of failure.";

  switch (fingerprint.auto_category) {
    case 'null_reference':
      principle = "State-space uncertainty. A variable was assumed to hold a defined object reference, but the actual runtime state evaluated to null or undefined.";
      feedback = "Do not blindly access properties. Implement defensive programming. Enforce a physical contract (e.g., optional chaining or explicit null checks) before accessing nested object properties.";
      break;
    case 'type_error':
      principle = "Interface mismatch. The executed operation is not supported by the data type provided at runtime.";
      feedback = "Verify the logical data flow. The variable's type transformed between assignment and execution. Trace the variable assignment and assert its type before invocation.";
      break;
    case 'syntax_error':
      principle = "Grammatical violation of the interpreter's expected AST (Abstract Syntax Tree).";
      feedback = "The code failed at the parsing stage, not execution. Carefully review brackets, parentheses, and keyword spelling within the modified block.";
      break;
    case 'network_error':
      principle = "I/O boundary failure. The application failed to establish a handshake with an external resource.";
      feedback = "The error is external to the logic. Verify endpoint URLs, network conditions, and consider implementing graceful degradation or retry-with-backoff strategies.";
      break;
    default:
      if (fingerprint.suggested_fix) {
        feedback = `Logical critique: ${fingerprint.suggested_fix}`;
      }
  }

  return {
    symptom: fingerprint.message,
    underlying_principle: principle,
    instructive_feedback: feedback
  };
}

// ============================================================
// Test History (In-Memory Store)
// ============================================================

interface TestRun {
  test_id: string;
  tool: string;
  action: string;
  url?: string;
  timestamp: string;
  duration_ms: number;
  passed: boolean;
  score?: number;
  issues_count: number;
  summary: string;
}

const testHistory: TestRun[] = [];
const MAX_HISTORY = 200;

export function recordTestRun(run: TestRun): void {
  testHistory.unshift(run); // newest first
  if (testHistory.length > MAX_HISTORY) testHistory.pop();
}

export function getTestHistory(url?: string, action?: string, limit = 20): TestRun[] {
  let results = testHistory;
  if (url) results = results.filter(r => r.url === url);
  if (action) results = results.filter(r => r.action === action);
  return results.slice(0, limit);
}

export function getComparisonToPrevious(url: string, action: string, currentScore?: number, currentIssues?: number): any {
  const prev = testHistory.find(r => r.url === url && r.action === action);
  if (!prev) return { has_previous: false, hint: 'No previous run found for comparison. This is the first test.' };

  return {
    has_previous: true,
    previous_run: {
      timestamp: prev.timestamp,
      score: prev.score,
      issues_count: prev.issues_count,
      passed: prev.passed,
    },
    delta: {
      score_change: currentScore !== undefined && prev.score !== undefined ? currentScore - prev.score : null,
      issues_change: currentIssues !== undefined ? (currentIssues - prev.issues_count) : null,
      improved: currentScore !== undefined && prev.score !== undefined ? currentScore > prev.score : null,
      regressed: currentScore !== undefined && prev.score !== undefined ? currentScore < prev.score : null,
    },
    trend_hint: currentScore !== undefined && prev.score !== undefined
      ? (currentScore > prev.score ? '📈 Improving since last test' : currentScore < prev.score ? '📉 Regressed since last test' : '➡️ Unchanged since last test')
      : null,
  };
}

// ============================================================
// AI Analysis Enrichment Helpers
// ============================================================

export function severityBadge(level: 'critical' | 'high' | 'medium' | 'low' | 'clean'): string {
  switch (level) {
    case 'critical': return '🔴 CRITICAL';
    case 'high': return '🟠 HIGH';
    case 'medium': return '🟡 MEDIUM';
    case 'low': return '🟢 LOW';
    case 'clean': return '✅ CLEAN';
  }
}

export function scoreToGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D';
  return 'F';
}

export function effortImpactMatrix(issues: Array<{ issue: string; effort: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high' }>): any[] {
  // Sort by impact desc, then effort asc
  const priorityMap = { high: 3, medium: 2, low: 1 };
  return issues
    .map((i, idx) => ({
      priority: idx + 1,
      ...i,
      roi_score: priorityMap[i.impact] * 3 - priorityMap[i.effort],
    }))
    .sort((a, b) => b.roi_score - a.roi_score)
    .map((i, idx) => ({ ...i, priority: idx + 1 }));
}

// ============================================================
// Security Headers Checker
// ============================================================

export const SECURITY_HEADERS = [
  { name: 'Content-Security-Policy', weight: 20, description: 'Prevents XSS, data injection, and clickjacking attacks' },
  { name: 'Strict-Transport-Security', weight: 15, description: 'Forces HTTPS connections (HSTS)' },
  { name: 'X-Content-Type-Options', weight: 10, description: 'Prevents MIME type sniffing' },
  { name: 'X-Frame-Options', weight: 10, description: 'Prevents clickjacking via iframes' },
  { name: 'X-XSS-Protection', weight: 5, description: 'Legacy XSS filter (deprecated but still useful)' },
  { name: 'Referrer-Policy', weight: 10, description: 'Controls information sent in Referer header' },
  { name: 'Permissions-Policy', weight: 10, description: 'Controls browser features (camera, mic, geolocation)' },
  { name: 'Cross-Origin-Opener-Policy', weight: 5, description: 'Isolates browsing context for security' },
  { name: 'Cross-Origin-Resource-Policy', weight: 5, description: 'Controls cross-origin resource loading' },
  { name: 'Cross-Origin-Embedder-Policy', weight: 5, description: 'Controls cross-origin embedding' },
  { name: 'X-DNS-Prefetch-Control', weight: 2, description: 'Controls DNS prefetching' },
  { name: 'X-Permitted-Cross-Domain-Policies', weight: 3, description: 'Controls Flash/PDF cross-domain access' },
];

// ============================================================
// DOM Snapshot Store (for dom_diff)
// ============================================================

const domSnapshots: Map<string, { timestamp: string; snapshot: any; url: string }> = new Map();

export function storeDomSnapshot(id: string, url: string, snapshot: any): void {
  domSnapshots.set(id, { timestamp: new Date().toISOString(), snapshot, url });
  // Keep max 50 snapshots
  if (domSnapshots.size > 50) {
    const oldest = domSnapshots.keys().next().value;
    if (oldest) domSnapshots.delete(oldest);
  }
}

export function getDomSnapshot(id: string): { timestamp: string; snapshot: any; url: string } | undefined {
  return domSnapshots.get(id);
}

export function listDomSnapshots(): Array<{ id: string; url: string; timestamp: string }> {
  return Array.from(domSnapshots.entries()).map(([id, s]) => ({ id, url: s.url, timestamp: s.timestamp }));
}

// ============================================================
// Test Suite Store (for test_suite)
// ============================================================

interface TestSuiteDefinition {
  name: string;
  description?: string;
  tests: Array<{ action: string; url?: string; args?: any; thresholds?: any }>;
  created: string;
}

interface TestSuiteResult {
  suite_name: string;
  status: 'passed' | 'failed';
  timestamp: string;
  duration_ms: number;
  passed: number;
  failed: number;
  total: number;
  results: any[];
}

const testSuites: Map<string, TestSuiteDefinition> = new Map();
const suiteHistory: TestSuiteResult[] = [];

export function createTestSuite(name: string, tests: any[], description?: string): TestSuiteDefinition {
  const suite: TestSuiteDefinition = { name, tests, description, created: new Date().toISOString() };
  testSuites.set(name, suite);
  return suite;
}

export function getTestSuite(name: string): TestSuiteDefinition | undefined {
  return testSuites.get(name);
}

export function listTestSuites(): TestSuiteDefinition[] {
  return Array.from(testSuites.values());
}

export function recordSuiteResult(result: TestSuiteResult): void {
  suiteHistory.unshift(result);
  if (suiteHistory.length > 50) suiteHistory.pop();
}

export function getSuiteHistory(name?: string, limit = 10): TestSuiteResult[] {
  let results = suiteHistory;
  if (name) results = results.filter(r => r.suite_name === name);
  return results.slice(0, limit);
}

// ============================================================
// Interaction Recording Store
// ============================================================

interface InteractionSession {
  id: string;
  url: string;
  started: string;
  events: Array<{
    t: number;
    type: string;
    target?: string;
    data?: any;
  }>;
  status: 'recording' | 'stopped';
}

const interactionSessions: Map<string, InteractionSession> = new Map();

export function startInteractionSession(url: string): string {
  const id = crypto.randomUUID();
  interactionSessions.set(id, {
    id,
    url,
    started: new Date().toISOString(),
    events: [],
    status: 'recording',
  });
  return id;
}

export function getInteractionSession(id: string): InteractionSession | undefined {
  return interactionSessions.get(id);
}

export function stopInteractionSession(id: string): InteractionSession | undefined {
  const session = interactionSessions.get(id);
  if (session) session.status = 'stopped';
  return session;
}

export function addInteractionEvent(sessionId: string, event: any): void {
  const session = interactionSessions.get(sessionId);
  if (session && session.status === 'recording') {
    session.events.push(event);
  }
}

export function listInteractionSessions(): Array<{ id: string; url: string; started: string; status: string; event_count: number }> {
  return Array.from(interactionSessions.values()).map(s => ({
    id: s.id,
    url: s.url,
    started: s.started,
    status: s.status,
    event_count: s.events.length,
  }));
}
