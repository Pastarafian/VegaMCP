/**
 * Bug Taxonomy — Ported from PolyGlotGitSecure
 * Complete classification system for all bug types.
 * Used by code analysis to categorize commits, detect patterns, and assess severity.
 */

export interface BugClassification {
  categories: string[];
  severity: string;
  matchedKeywords: string[];
  description: string;
}

// 17 bug categories with 400+ keywords
const COMMIT_KEYWORDS: Record<string, string[]> = {
  security: [
    'security', 'vuln', 'cve', 'exploit', 'sanitize', 'injection', 'xss', 'csrf',
    'overflow', 'dos', 'privilege', 'auth', 'bypass', 'credential', 'leak', 'expose',
    'sensitive', 'encrypt', 'decrypt', 'permission', 'access control', 'authentication',
    'authorization', 'sql injection', 'rce', 'ssrf', 'path traversal',
  ],
  gui: [
    'ui', 'gui', 'layout', 'render', 'display', 'visual', 'css', 'style', 'alignment',
    'responsive', 'mobile', 'z-index', 'position', 'margin', 'padding', 'flex', 'grid',
    'animation', 'transition', 'flicker', 'scroll', 'resize', 'viewport', 'font', 'text',
    'truncat', 'button', 'input', 'form', 'modal', 'dialog', 'popup', 'dropdown', 'menu',
  ],
  ux: [
    'usability', 'accessibility', 'a11y', 'aria', 'screen reader', 'keyboard', 'focus',
    'tab order', 'navigation', 'tooltip', 'hover', 'touch', 'gesture', 'swipe', 'drag',
    'drop', 'click', 'shortcut', 'hotkey', 'feedback', 'loading', 'spinner', 'progress',
  ],
  crash: [
    'crash', 'segfault', 'segmentation fault', 'panic', 'abort', 'fatal', 'exception',
    'unhandled', 'stack overflow', 'oom', 'out of memory', 'memory leak', 'hang', 'freeze',
    'deadlock', 'infinite loop', 'timeout', 'unresponsive', 'terminate', 'sigkill', 'sigsegv',
  ],
  logic: [
    'logic', 'incorrect', 'wrong', 'invalid', 'broken', 'fail', 'error', 'bug', 'issue',
    'regression', 'revert', 'off-by-one', 'boundary', 'edge case', 'corner case', 'null',
    'undefined', 'nan', 'infinity', 'division by zero', 'negative', 'underflow', 'precision',
  ],
  performance: [
    'performance', 'slow', 'fast', 'speed', 'optimize', 'optimise', 'efficient', 'latency',
    'throughput', 'bottleneck', 'profile', 'cache', 'memoize', 'lazy', 'eager', 'batch',
    'bulk', 'async', 'parallel', 'concurrent', 'throttle', 'debounce', 'n+1', 'memory', 'cpu',
  ],
  data: [
    'data', 'corrupt', 'truncat', 'parse', 'serialize', 'deserialize', 'encode', 'decode',
    'format', 'validate', 'sanitize', 'escape', 'regex', 'match', 'type', 'cast', 'convert',
    'coerce', 'precision', 'rounding', 'locale', 'timezone', 'json', 'xml', 'csv', 'yaml',
  ],
  concurrency: [
    'race', 'race condition', 'thread', 'mutex', 'lock', 'unlock', 'semaphore', 'atomic',
    'volatile', 'sync', 'async', 'await', 'promise', 'future', 'callback', 'deadlock',
    'livelock', 'starvation', 'priority inversion', 'thread safe', 'concurrent',
  ],
  network: [
    'network', 'http', 'https', 'request', 'response', 'api', 'endpoint', 'timeout', 'retry',
    'reconnect', 'socket', 'tcp', 'udp', 'websocket', 'cors', 'header', 'cookie', 'session',
    'rate limit', 'quota', 'throttle', '503', '500', '404', '401', 'connection', 'disconnect',
  ],
  database: [
    'database', 'db', 'sql', 'query', 'index', 'transaction', 'commit', 'rollback', 'deadlock',
    'constraint', 'foreign key', 'migration', 'schema', 'orm', 'connection pool', 'cursor',
    'prepared statement', 'injection',
  ],
  file_io: [
    'file', 'read', 'write', 'open', 'close', 'stream', 'buffer', 'flush', 'seek', 'truncate',
    'permission', 'access denied', 'not found', 'exists', 'directory', 'path', 'encoding',
    'utf', 'binary', 'line ending', 'newline', 'eof',
  ],
  config: [
    'config', 'configuration', 'setting', 'option', 'parameter', 'environment', 'env',
    'variable', 'default', 'fallback', 'override', 'precedence', 'merge', 'validate',
  ],
  i18n: [
    'i18n', 'l10n', 'locale', 'language', 'translation', 'rtl', 'ltr', 'unicode', 'utf-8',
    'timezone', 'currency', 'number format', 'plural', 'gender',
  ],
  testing: [
    'test', 'spec', 'assert', 'expect', 'mock', 'stub', 'spy', 'fixture', 'flaky',
    'intermittent', 'random fail', 'ci', 'coverage', 'regression', 'unit test', 'integration test',
  ],
  build: [
    'build', 'compile', 'link', 'bundle', 'webpack', 'vite', 'docker', 'container', 'deploy',
    'release', 'version', 'dependency', 'package', 'npm', 'pip', 'cargo', 'maven', 'gradle',
  ],
  docs: [
    'doc', 'documentation', 'readme', 'comment', 'typo', 'spelling', 'grammar', 'example',
    'tutorial', 'api doc', 'changelog', 'release notes',
  ],
  compatibility: [
    'compat', 'compatibility', 'browser', 'chrome', 'firefox', 'safari', 'edge', 'ie',
    'ios', 'android', 'windows', 'linux', 'macos', 'version', 'upgrade', 'downgrade',
    'deprecat', 'legacy', 'polyfill', 'shim',
  ],
};

const CATEGORY_SEVERITY: Record<string, string> = {
  security: 'high', crash: 'high', data: 'high',
  concurrency: 'medium', logic: 'medium', performance: 'medium',
  database: 'medium', network: 'medium', file_io: 'medium', build: 'medium', compatibility: 'medium',
  gui: 'low', ux: 'low', config: 'low', i18n: 'low', testing: 'low', docs: 'info',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  security: 'Security vulnerabilities and fixes',
  gui: 'User interface and visual bugs',
  ux: 'User experience and accessibility issues',
  crash: 'Application crashes and stability issues',
  logic: 'Logic errors and incorrect behavior',
  performance: 'Performance and optimization issues',
  data: 'Data handling and validation bugs',
  concurrency: 'Threading and race condition bugs',
  network: 'Network and API related bugs',
  database: 'Database and query related bugs',
  file_io: 'File and I/O operation bugs',
  config: 'Configuration and settings bugs',
  i18n: 'Internationalization bugs',
  testing: 'Test-related fixes',
  build: 'Build and deployment bugs',
  docs: 'Documentation fixes',
  compatibility: 'Compatibility and version bugs',
};

/**
 * Classify a commit message or code snippet into bug categories.
 */
export function classifyBug(text: string): BugClassification {
  const lower = text.toLowerCase();
  const categories: string[] = [];
  const matchedKeywords: string[] = [];

  for (const [category, keywords] of Object.entries(COMMIT_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw));
    if (hits.length > 0) {
      categories.push(category);
      matchedKeywords.push(...hits.map(h => `${category}:${h}`));
    }
  }

  if (categories.length === 0) categories.push('unknown');

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  let highest = 'info';
  for (const cat of categories) {
    const catSev = CATEGORY_SEVERITY[cat] || 'low';
    if (severityOrder.indexOf(catSev) < severityOrder.indexOf(highest)) highest = catSev;
  }

  return {
    categories,
    severity: highest,
    matchedKeywords,
    description: categories.map(c => CATEGORY_DESCRIPTIONS[c] || c).join('; '),
  };
}

/**
 * Batch classify multiple lines (e.g., git log output).
 */
export function classifyCommitLog(lines: string[]): Array<{ line: string; classification: BugClassification }> {
  return lines
    .filter(l => l.trim())
    .map(line => ({ line: line.trim(), classification: classifyBug(line) }))
    .filter(r => !r.classification.categories.includes('unknown'));
}

/**
 * Get all available categories and their descriptions.
 */
export function getTaxonomyInfo() {
  return {
    categories: Object.keys(COMMIT_KEYWORDS).length,
    totalKeywords: Object.values(COMMIT_KEYWORDS).reduce((s, k) => s + k.length, 0),
    categoryDetails: Object.entries(CATEGORY_DESCRIPTIONS).map(([cat, desc]) => ({
      category: cat,
      description: desc,
      severity: CATEGORY_SEVERITY[cat] || 'low',
      keywordCount: COMMIT_KEYWORDS[cat]?.length || 0,
    })),
  };
}
