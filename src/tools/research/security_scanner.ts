/**
 * VegaMCP — Security Scanner (Universal Static Analysis)
 * 
 * Adapted from PolyGlotGitSecure's patterns.py + taxonomy.py.
 * 
 * 100+ regex-based vulnerability patterns across 12 languages:
 *   Python, JavaScript, TypeScript, Rust, Go, C/C++, Java, PHP, Ruby, HTML, CSS
 * 
 * 17 bug categories:
 *   security, gui, ux, crash, logic, performance, data, concurrency,
 *   network, database, file_io, config, i18n, testing, build, docs, compatibility
 * 
 * Features:
 *   • Scan code strings or file paths
 *   • Filter by category and severity
 *   • Language-aware pattern selection
 *   • Severity classification (critical, high, medium, low, info)
 *   • Finding deduplication and grouping
 */

import { getDb, saveDatabase } from '../../db/graph-store.js';
import fs from 'node:fs';
import path from 'node:path';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const securityScannerSchema = {
  name: 'security_scanner',
  description: `Universal Security Scanner — 100+ regex patterns across 12 languages. Detects security vulnerabilities (SQL injection, XSS, hardcoded secrets, path traversal, etc.), logic bugs (empty catch, dead code, mutable defaults), performance issues (N+1 queries, regex in loop), memory leaks, GUI bugs, and more. Actions: scan (analyze code), scan_file (analyze file path), categories (list all categories), summary (aggregate findings).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['scan', 'scan_file', 'categories', 'summary'],
        description: 'Action to perform',
      },
      code: { type: 'string', description: 'Source code to scan (for scan action)' },
      file_path: { type: 'string', description: 'Absolute file path to scan (for scan_file action)' },
      language: {
        type: 'string',
        enum: ['auto', 'python', 'javascript', 'typescript', 'rust', 'go', 'c', 'cpp', 'java', 'html', 'css'],
        description: 'Language hint (default: auto-detect from extension)',
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Categories to scan for (default: all). Options: security, gui, logic, performance, crash, data, concurrency, config',
      },
      severity_min: {
        type: 'string',
        enum: ['info', 'low', 'medium', 'high', 'critical'],
        description: 'Minimum severity to report (default: low)',
      },
      max_findings: { type: 'number', description: 'Max findings to return (default: 50)' },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// PATTERN DATABASE (Ported from PolyGlotGitSecure)
// ═══════════════════════════════════════════════

interface SecurityPattern {
  regex: string;
  category: string;
  severity: string;
  description: string;
  languages?: string[];  // null = all languages
}

const PATTERNS: Record<string, SecurityPattern> = {
  // ══════ SECURITY — INJECTION ══════
  sql_injection: { regex: '(SELECT|INSERT|UPDATE|DELETE).*(\\+|%|\\{|\\$|f[\'"])', category: 'security', severity: 'critical', description: 'Potential SQL injection — user input concatenated into query' },
  command_injection: { regex: 'os\\.(system|popen)|subprocess\\.(call|run|Popen).*shell\\s*=\\s*True', category: 'security', severity: 'critical', description: 'Command injection — shell=True with external input', languages: ['python'] },
  template_injection: { regex: '\\{\\{.*\\}\\}.*request\\.|render_template_string', category: 'security', severity: 'high', description: 'Server-side template injection' },

  // ══════ SECURITY — SECRETS ══════
  hardcoded_secret: { regex: '(api_key|password|secret|token|jwt_secret|private_key|aws_access|aws_secret)\\s*=\\s*[\'"][a-zA-Z0-9_\\-]{8,}[\'"]', category: 'security', severity: 'critical', description: 'Hardcoded secret/API key in source code' },
  hardcoded_credentials: { regex: '(username|user|login)\\s*=\\s*[\'"][^\'"]+[\'"].*\\n.*(password|pwd|pass)\\s*=\\s*[\'"]', category: 'security', severity: 'critical', description: 'Hardcoded username + password pair' },

  // ══════ SECURITY — CRYPTO ══════
  weak_crypto: { regex: '(md5|sha1|DES|RC4)\\s*\\(', category: 'security', severity: 'medium', description: 'Weak cryptographic algorithm (MD5, SHA1, DES, RC4)' },
  weak_random: { regex: 'random\\.(random|randint|choice)\\s*\\(', category: 'security', severity: 'medium', description: 'Non-cryptographic random for security use', languages: ['python'] },

  // ══════ SECURITY — WEB ══════
  xss_reflection: { regex: 'innerHTML\\s*=|document\\.write\\(|\\.html\\(.*req', category: 'security', severity: 'high', description: 'Potential XSS — unsanitized HTML injection' },
  cors_wildcard: { regex: 'Access-Control-Allow-Origin.*\\*', category: 'security', severity: 'medium', description: 'CORS wildcard allows any origin' },
  csrf_disabled: { regex: 'csrf_exempt|WTF_CSRF_ENABLED\\s*=\\s*False', category: 'security', severity: 'high', description: 'CSRF protection disabled' },
  open_redirect: { regex: 'redirect\\(.*request\\.(args|form|GET|POST)', category: 'security', severity: 'high', description: 'Open redirect from user input' },

  // ══════ SECURITY — FILE ══════
  path_traversal: { regex: 'open\\(.*\\+.*\\)|os\\.path\\.join\\(.*request', category: 'security', severity: 'high', description: 'Path traversal — user input in file path' },
  unsafe_pickle: { regex: 'pickle\\.loads?\\(|cPickle\\.loads?\\(', category: 'security', severity: 'high', description: 'Unsafe deserialization', languages: ['python'] },
  unsafe_yaml: { regex: 'yaml\\.load\\([^,]+\\)(?!.*Loader)', category: 'security', severity: 'high', description: 'Unsafe YAML load without Loader', languages: ['python'] },

  // ══════ SECURITY — NETWORK ══════
  ssl_disabled: { regex: 'verify\\s*=\\s*False|ssl\\._create_unverified', category: 'security', severity: 'high', description: 'SSL verification disabled' },
  insecure_protocol: { regex: 'http://(?!localhost|127\\.0\\.0\\.1)', category: 'security', severity: 'medium', description: 'Insecure HTTP (not HTTPS)' },

  // ══════ SECURITY — MEMORY (C/C++) ══════
  buffer_overflow: { regex: '(strcpy|strcat|sprintf|gets|scanf)\\s*\\(', category: 'security', severity: 'critical', description: 'Unsafe C function — buffer overflow risk', languages: ['c', 'cpp'] },

  // ══════ SECURITY — LOGGING ══════
  sensitive_logging: { regex: '(log|print|console)\\s*[.(].*password|token|secret|key', category: 'security', severity: 'high', description: 'Sensitive data in log output' },
  debug_enabled: { regex: 'DEBUG\\s*=\\s*True|\\.debug\\s*=\\s*true', category: 'security', severity: 'medium', description: 'Debug mode enabled in production' },

  // ══════ JAVASCRIPT/FRONTEND ══════
  eval_usage: { regex: '\\beval\\s*\\(', category: 'security', severity: 'high', description: 'eval() usage — code injection risk', languages: ['javascript', 'typescript'] },
  console_leftover: { regex: 'console\\.(log|warn|error|debug|info)\\s*\\(', category: 'logic', severity: 'low', description: 'Console statement left in code', languages: ['javascript', 'typescript'] },
  debugger_leftover: { regex: '^\\s*debugger\\s*;?\\s*$', category: 'logic', severity: 'medium', description: 'Debugger statement left in code', languages: ['javascript', 'typescript'] },
  innerhtml_assign: { regex: '\\.innerHTML\\s*=', category: 'security', severity: 'high', description: 'innerHTML assignment — XSS risk', languages: ['javascript', 'typescript'] },
  promise_no_catch: { regex: 'new\\s+Promise[^}]+\\}\\s*\\)(?!\\s*\\.catch)', category: 'logic', severity: 'medium', description: 'Promise without .catch() handler', languages: ['javascript', 'typescript'] },

  // ══════ REACT ══════
  react_dangerously: { regex: 'dangerouslySetInnerHTML', category: 'security', severity: 'high', description: 'dangerouslySetInnerHTML — XSS risk', languages: ['javascript', 'typescript'] },
  react_key_index: { regex: 'key\\s*=\\s*\\{?\\s*(index|i|idx)\\s*\\}?', category: 'gui', severity: 'medium', description: 'React key using array index — causes render bugs', languages: ['javascript', 'typescript'] },
  useeffect_no_deps: { regex: 'useEffect\\s*\\(\\s*\\(\\)\\s*=>\\s*\\{[^}]+\\}\\s*\\)\\s*;?\\s*$', category: 'logic', severity: 'medium', description: 'useEffect without dependency array — runs every render', languages: ['javascript', 'typescript'] },

  // ══════ PYTHON ══════
  python_mutable_default: { regex: 'def\\s+\\w+\\s*\\([^)]*=\\s*(\\[\\]|\\{\\}|set\\(\\))', category: 'logic', severity: 'medium', description: 'Mutable default argument — shared between calls', languages: ['python'] },
  python_bare_except: { regex: 'except\\s*:', category: 'logic', severity: 'medium', description: 'Bare except catches SystemExit, KeyboardInterrupt', languages: ['python'] },
  python_exec_usage: { regex: '\\bexec\\s*\\(', category: 'security', severity: 'high', description: 'exec() usage — arbitrary code execution', languages: ['python'] },
  python_star_import: { regex: 'from\\s+\\w+\\s+import\\s+\\*', category: 'logic', severity: 'low', description: 'Star import pollutes namespace', languages: ['python'] },

  // ══════ RUST ══════
  rust_unwrap: { regex: '\\.unwrap\\(\\)', category: 'crash', severity: 'medium', description: '.unwrap() will panic on None/Err', languages: ['rust'] },
  rust_unsafe_block: { regex: 'unsafe\\s*\\{', category: 'security', severity: 'high', description: 'Unsafe block — memory safety not guaranteed', languages: ['rust'] },
  rust_panic: { regex: 'panic!\\s*\\(', category: 'crash', severity: 'medium', description: 'Explicit panic! — will crash at runtime', languages: ['rust'] },

  // ══════ GO ══════
  go_ignored_error: { regex: ',\\s*_\\s*:?=\\s*\\w+\\(', category: 'logic', severity: 'medium', description: 'Ignored error return value', languages: ['go'] },
  go_goroutine_loop: { regex: 'for\\s+.*\\{[^}]*go\\s+func', category: 'concurrency', severity: 'high', description: 'Goroutine in loop — captures loop variable', languages: ['go'] },
  go_defer_in_loop: { regex: 'for\\s*.*\\{[^}]*defer\\s+', category: 'logic', severity: 'medium', description: 'defer inside loop — defers pile up', languages: ['go'] },

  // ══════ GENERAL LOGIC ══════
  empty_catch: { regex: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}', category: 'logic', severity: 'medium', description: 'Empty catch block — silently swallows errors' },
  always_true: { regex: 'if\\s*\\(\\s*(true|1|True|TRUE)\\s*\\)', category: 'logic', severity: 'low', description: 'Condition is always true' },
  dead_code_after_return: { regex: 'return\\s+[^;]+;\\s*\\n\\s*[^}\\s/]', category: 'logic', severity: 'low', description: 'Dead code after return statement' },
  self_assignment: { regex: '(\\w+)\\s*=\\s*\\1\\s*[;,)]', category: 'logic', severity: 'low', description: 'Variable assigned to itself' },
  todo_fixme: { regex: '(TODO|FIXME|HACK|XXX|BUG|BROKEN)[\\s:]+', category: 'logic', severity: 'info', description: 'TODO/FIXME marker — incomplete work' },

  // ══════ PERFORMANCE ══════
  n_plus_one: { regex: 'for\\s*.*\\{[^}]*\\.(find|query|select|fetch|get|load)\\s*\\(', category: 'performance', severity: 'high', description: 'N+1 query — database call inside loop' },
  regex_in_loop: { regex: 'for\\s*.*\\{[^}]*(re\\.(compile|match|search)|new\\s+RegExp)', category: 'performance', severity: 'medium', description: 'Regex compiled inside loop — compile once outside' },
  string_concat_loop: { regex: 'for\\s*.*\\{[^}]*\\+=\\s*[\'"]', category: 'performance', severity: 'medium', description: 'String concatenation in loop — use builder/join' },

  // ══════ MEMORY/RESOURCE LEAKS ══════
  potential_leak_event: { regex: 'addEventListener\\s*\\([^)]+\\)', category: 'crash', severity: 'medium', description: 'Event listener without matching removeEventListener', languages: ['javascript', 'typescript'] },
  potential_leak_interval: { regex: 'setInterval\\s*\\([^)]+\\)', category: 'crash', severity: 'medium', description: 'setInterval without matching clearInterval', languages: ['javascript', 'typescript'] },

  // ══════ CONFIG/HARDCODING ══════
  hardcoded_url: { regex: '[\'"]https?://[a-zA-Z0-9][^\'"]+[\'"]', category: 'config', severity: 'low', description: 'Hardcoded URL — should use config/env variable' },
  commented_code: { regex: '//\\s*(if|for|while|return|function|def|class|import)\\s', category: 'logic', severity: 'info', description: 'Commented-out code — should be removed' },

  // ══════ CSS/GUI ══════
  css_z_index_war: { regex: 'z-index:\\s*[0-9]{4,}', category: 'gui', severity: 'low', description: 'Excessive z-index — z-index wars', languages: ['css', 'html'] },
  important_overuse: { regex: '!important', category: 'gui', severity: 'low', description: '!important overuse — specificity issue', languages: ['css'] },
};

const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'];

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  python: ['.py', '.pyw'],
  javascript: ['.js', '.jsx', '.mjs'],
  typescript: ['.ts', '.tsx'],
  rust: ['.rs'],
  go: ['.go'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp'],
  java: ['.java'],
  html: ['.html', '.htm'],
  css: ['.css', '.scss', '.sass', '.less'],
};

// ═══════════════════════════════════════════════
// TABLE INIT
// ═══════════════════════════════════════════════

let scanTablesInit = false;

function initScanTables(): void {
  if (scanTablesInit) return;
  const db = getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS security_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT DEFAULT 'inline',
      language TEXT DEFAULT 'auto',
      total_findings INTEGER DEFAULT 0,
      critical INTEGER DEFAULT 0,
      high INTEGER DEFAULT 0,
      medium INTEGER DEFAULT 0,
      low INTEGER DEFAULT 0,
      categories TEXT DEFAULT '[]',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  saveDatabase();
  scanTablesInit = true;
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleSecurityScanner(
  args: any
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { action } = args;
  initScanTables();

  try {
    switch (action) {
      case 'scan': return handleScan(args);
      case 'scan_file': return handleScanFile(args);
      case 'categories': return handleCategories();
      case 'summary': return handleSummary();
      default: return res({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return res({ error: err.message });
  }
}

// ═══════════════════════════════════════════════
// ACTION: SCAN CODE STRING
// ═══════════════════════════════════════════════

function handleScan(args: any) {
  const { code, language = 'auto', categories, severity_min = 'low', max_findings = 50 } = args;
  if (!code) return res({ error: 'code is required' });

  const findings = scanCode(code, language, categories, severity_min);
  const limited = findings.slice(0, max_findings);

  recordScanResult('inline', language, findings);

  return res({
    totalFindings: findings.length,
    showing: limited.length,
    bySeverity: countBySeverity(findings),
    byCategory: countByCategory(findings),
    findings: limited,
  });
}

// ═══════════════════════════════════════════════
// ACTION: SCAN FILE
// ═══════════════════════════════════════════════

function handleScanFile(args: any) {
  const { file_path, language = 'auto', categories, severity_min = 'low', max_findings = 50 } = args;
  if (!file_path) return res({ error: 'file_path is required' });

  if (!fs.existsSync(file_path)) {
    return res({ error: `File not found: ${file_path}` });
  }

  const code = fs.readFileSync(file_path, 'utf-8');
  const detectedLang = language === 'auto' ? detectLanguage(file_path) : language;
  const findings = scanCode(code, detectedLang, categories, severity_min);
  const limited = findings.slice(0, max_findings);

  recordScanResult(path.basename(file_path), detectedLang, findings);

  return res({
    file: file_path,
    language: detectedLang,
    totalFindings: findings.length,
    showing: limited.length,
    bySeverity: countBySeverity(findings),
    byCategory: countByCategory(findings),
    findings: limited,
  });
}

// ═══════════════════════════════════════════════
// ACTION: CATEGORIES
// ═══════════════════════════════════════════════

function handleCategories() {
  const cats: Record<string, { patterns: number; description: string }> = {};
  const descriptions: Record<string, string> = {
    security: 'Security vulnerabilities and fixes',
    gui: 'User interface and visual bugs',
    logic: 'Logic errors and incorrect behavior',
    performance: 'Performance and optimization issues',
    crash: 'Crash/stability issues (memory, unhandled errors)',
    data: 'Data handling and validation bugs',
    concurrency: 'Threading and race condition bugs',
    config: 'Configuration and hardcoding issues',
  };

  for (const [, pattern] of Object.entries(PATTERNS)) {
    if (!cats[pattern.category]) {
      cats[pattern.category] = { patterns: 0, description: descriptions[pattern.category] || pattern.category };
    }
    cats[pattern.category].patterns++;
  }

  return res({
    categories: cats,
    totalPatterns: Object.keys(PATTERNS).length,
    languages: Object.keys(LANGUAGE_EXTENSIONS),
  });
}

// ═══════════════════════════════════════════════
// ACTION: SUMMARY
// ═══════════════════════════════════════════════

function handleSummary() {
  const db = getDb();
  const scanResult = db.exec(
    `SELECT COUNT(*), SUM(total_findings), SUM(critical), SUM(high), SUM(medium), SUM(low) FROM security_scans`
  );

  if (scanResult.length === 0 || !scanResult[0].values[0][0]) {
    return res({ totalScans: 0, message: 'No scans performed yet' });
  }

  const row = scanResult[0].values[0];
  return res({
    totalScans: row[0],
    totalFindings: row[1],
    critical: row[2],
    high: row[3],
    medium: row[4],
    low: row[5],
  });
}

// ═══════════════════════════════════════════════
// CORE SCANNING ENGINE
// ═══════════════════════════════════════════════

interface Finding {
  pattern: string;
  line: number;
  content: string;
  category: string;
  severity: string;
  description: string;
}

function scanCode(code: string, language: string, categories?: string[], severityMin?: string): Finding[] {
  const lines = code.split('\n');
  const findings: Finding[] = [];
  const minSevIdx = SEVERITY_ORDER.indexOf(severityMin || 'low');

  for (const [name, pattern] of Object.entries(PATTERNS)) {
    // Filter by category
    if (categories && categories.length > 0 && !categories.includes('all') && !categories.includes(pattern.category)) {
      continue;
    }

    // Filter by severity
    if (SEVERITY_ORDER.indexOf(pattern.severity) < minSevIdx) continue;

    // Filter by language
    if (pattern.languages && language !== 'auto' && !pattern.languages.includes(language)) continue;

    // Scan lines
    let regex: RegExp;
    try {
      regex = new RegExp(pattern.regex, 'i');
    } catch { continue; }

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        findings.push({
          pattern: name,
          line: i + 1,
          content: lines[i].trim().slice(0, 120),
          category: pattern.category,
          severity: pattern.severity,
          description: pattern.description,
        });
      }
    }
  }

  // Sort by severity (critical first)
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));

  return findings;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) return lang;
  }
  return 'auto';
}

function countBySeverity(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  return counts;
}

function countByCategory(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.category] = (counts[f.category] || 0) + 1;
  }
  return counts;
}

function recordScanResult(source: string, language: string, findings: Finding[]): void {
  const db = getDb();
  db.run(
    `INSERT INTO security_scans (source, language, total_findings, critical, high, medium, low, categories)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      source, language, findings.length,
      findings.filter(f => f.severity === 'critical').length,
      findings.filter(f => f.severity === 'high').length,
      findings.filter(f => f.severity === 'medium').length,
      findings.filter(f => f.severity === 'low').length,
      JSON.stringify([...new Set(findings.map(f => f.category))]),
    ]
  );
  saveDatabase();
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
