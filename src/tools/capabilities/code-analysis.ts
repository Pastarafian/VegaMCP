/**
 * VegaMCP — Code Analysis Engine
 * 
 * Static code analysis using regex-based parsing. Extracts function signatures,
 * class hierarchies, import graphs, and complexity metrics from source files.
 * Supports: TypeScript, JavaScript, Python, Rust, Go.
 * MCP Tool: code_analysis
 */

import { logAudit } from '../../db/graph-store.js';
import { addToVectorStore } from '../../db/vector-store.js';

// ═══════════════════════════════════════════════
// MCP TOOL SCHEMA
// ═══════════════════════════════════════════════

export const codeAnalysisSchema = {
  name: 'code_analysis',
  description: 'Static code analysis engine. Parse source code to extract functions, classes, imports, complexity metrics, and dependency graphs. Supports TypeScript, JavaScript, Python, Rust, Go. Much cheaper than sending full files to a reasoning model.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['analyze_code', 'get_imports', 'get_functions', 'get_classes', 'get_complexity', 'get_structure'],
        description: 'Action to perform',
      },
      code: { type: 'string', description: 'Source code to analyze' },
      language: {
        type: 'string',
        enum: ['typescript', 'javascript', 'python', 'rust', 'go', 'auto'],
        description: 'Programming language (auto-detect if not specified)',
        default: 'auto',
      },
      filename: { type: 'string', description: 'Optional filename (helps with language detection and context)' },
      store_results: { type: 'boolean', description: 'Store analysis in knowledge engine', default: false },
    },
    required: ['action'],
  },
};

// ═══════════════════════════════════════════════
// LANGUAGE DETECTION
// ═══════════════════════════════════════════════

function detectLanguage(code: string, filename?: string): string {
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript',
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      py: 'python', pyw: 'python',
      rs: 'rust',
      go: 'go',
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  // Heuristic detection
  if (code.includes('interface ') && code.includes(': ') && (code.includes('export ') || code.includes('import '))) return 'typescript';
  if (code.includes('fn ') && code.includes('let mut') || code.includes('impl ') || code.includes('pub fn')) return 'rust';
  if (code.includes('func ') && code.includes('package ')) return 'go';
  if (code.includes('def ') && code.includes(':') && !code.includes('{')) return 'python';
  if (code.includes('function ') || code.includes('const ') || code.includes('=>')) return 'javascript';

  return 'javascript'; // Default
}

// ═══════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════

interface FunctionInfo {
  name: string;
  params: string;
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  startLine: number;
  lineCount: number;
  complexity: number;
}

interface ClassInfo {
  name: string;
  extends?: string;
  implements?: string[];
  methods: string[];
  properties: string[];
  isExported: boolean;
  startLine: number;
}

interface ImportInfo {
  source: string;
  imports: string[];
  isDefault: boolean;
  isType: boolean;
}

// --- TypeScript / JavaScript Parser ---

function parseTSFunctions(code: string): FunctionInfo[] {
  const lines = code.split('\n');
  const functions: FunctionInfo[] = [];

  const patterns = [
    // function declaration
    /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^\s{]+))?\s*\{?/,
    // arrow function assigned to const/let
    /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s+)?\(?([^)]*)\)?\s*(?::\s*([^\s=>{]+))?\s*=>/,
    // method in class/object
    /^(\s*)(async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*([^\s{]+))?\s*\{/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const isExported = line.includes('export ');
        const isAsync = line.includes('async ');
        const name = match[4] || match[3] || 'anonymous';
        
        if (['if', 'for', 'while', 'switch', 'catch', 'else', 'return', 'new', 'class'].includes(name)) continue;

        // Count function body lines (simple brace matching)
        let braceCount = 0;
        let endLine = i;
        for (let j = i; j < lines.length; j++) {
          braceCount += (lines[j].match(/\{/g) || []).length;
          braceCount -= (lines[j].match(/\}/g) || []).length;
          if (braceCount <= 0 && j > i) {
            endLine = j;
            break;
          }
          if (j === lines.length - 1) endLine = j;
        }

        // Calculate cyclomatic complexity
        const bodySlice = lines.slice(i, endLine + 1).join('\n');
        const complexity = calculateComplexity(bodySlice);

        functions.push({
          name,
          params: match[6] || match[4] || '',
          returnType: match[7] || match[5] || undefined,
          isAsync,
          isExported,
          startLine: i + 1,
          lineCount: endLine - i + 1,
          complexity,
        });
        break;
      }
    }
  }

  return functions;
}

function parseTSClasses(code: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/);
    if (match) {
      const className = match[4];
      const extendsClass = match[5];
      const implementsList = match[6]?.split(',').map(s => s.trim()).filter(Boolean);

      // Extract methods and properties
      const methods: string[] = [];
      const properties: string[] = [];
      let braceCount = 0;

      for (let j = i; j < lines.length; j++) {
        braceCount += (lines[j].match(/\{/g) || []).length;
        braceCount -= (lines[j].match(/\}/g) || []).length;

        if (j > i) {
          const methodMatch = lines[j].match(/^\s+(?:public|private|protected|static|async|readonly|abstract)?\s*(?:async\s+)?(\w+)\s*\(/);
          if (methodMatch && !['if', 'for', 'while', 'switch', 'constructor'].includes(methodMatch[1])) {
            methods.push(methodMatch[1]);
          }
          if (methodMatch?.[1] === 'constructor') methods.push('constructor');

          const propMatch = lines[j].match(/^\s+(?:public|private|protected|static|readonly)\s+(\w+)\s*[;:=]/);
          if (propMatch) properties.push(propMatch[1]);
        }

        if (braceCount <= 0 && j > i) break;
      }

      classes.push({
        name: className,
        extends: extendsClass,
        implements: implementsList,
        methods,
        properties,
        isExported: !!match[2],
        startLine: i + 1,
      });
    }
  }

  return classes;
}

function parseTSImports(code: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = code.split('\n');

  for (const line of lines) {
    // import { a, b } from 'module'
    const namedMatch = line.match(/import\s+(type\s+)?(?:\{([^}]+)\})\s+from\s+['"]([^'"]+)['"]/);
    if (namedMatch) {
      imports.push({
        source: namedMatch[3],
        imports: namedMatch[2].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean),
        isDefault: false,
        isType: !!namedMatch[1],
      });
      continue;
    }

    // import Default from 'module'
    const defaultMatch = line.match(/import\s+(type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (defaultMatch) {
      imports.push({
        source: defaultMatch[3],
        imports: [defaultMatch[2]],
        isDefault: true,
        isType: !!defaultMatch[1],
      });
      continue;
    }

    // import * as X from 'module'
    const starMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (starMatch) {
      imports.push({
        source: starMatch[2],
        imports: [`* as ${starMatch[1]}`],
        isDefault: false,
        isType: false,
      });
    }
  }

  return imports;
}

// --- Python Parser ---

function parsePyFunctions(code: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^\s:]+))?\s*:/);
    if (match) {
      // Count function body by indentation
      const baseIndent = match[1].length;
      let endLine = i;
      for (let j = i + 1; j < lines.length; j++) {
        const lineContent = lines[j];
        if (lineContent.trim() === '') continue;
        const indent = lineContent.match(/^(\s*)/)?.[1].length || 0;
        if (indent <= baseIndent && lineContent.trim() !== '') {
          endLine = j - 1;
          break;
        }
        endLine = j;
      }

      const body = lines.slice(i, endLine + 1).join('\n');

      functions.push({
        name: match[3],
        params: match[4],
        returnType: match[5],
        isAsync: !!match[2],
        isExported: !match[3].startsWith('_'),
        startLine: i + 1,
        lineCount: endLine - i + 1,
        complexity: calculateComplexity(body),
      });
    }
  }

  return functions;
}

function parsePyClasses(code: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
    if (match) {
      const bases = match[3]?.split(',').map(s => s.trim()).filter(Boolean) || [];
      const methods: string[] = [];
      const properties: string[] = [];
      const baseIndent = match[1].length;

      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') continue;
        const indent = lines[j].match(/^(\s*)/)?.[1].length || 0;
        if (indent <= baseIndent && lines[j].trim() !== '') break;

        const methodMatch = lines[j].match(/\s+(?:async\s+)?def\s+(\w+)/);
        if (methodMatch) methods.push(methodMatch[1]);

        const propMatch = lines[j].match(/\s+self\.(\w+)\s*=/);
        if (propMatch && !properties.includes(propMatch[1])) properties.push(propMatch[1]);
      }

      classes.push({
        name: match[2],
        extends: bases[0],
        implements: bases.slice(1),
        methods,
        properties,
        isExported: !match[2].startsWith('_'),
        startLine: i + 1,
      });
    }
  }

  return classes;
}

function parsePyImports(code: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  for (const line of code.split('\n')) {
    const fromMatch = line.match(/^from\s+(\S+)\s+import\s+(.+)/);
    if (fromMatch) {
      imports.push({
        source: fromMatch[1],
        imports: fromMatch[2].split(',').map(s => s.trim().split(' as ')[0].trim()),
        isDefault: false,
        isType: false,
      });
      continue;
    }

    const importMatch = line.match(/^import\s+(\S+)(?:\s+as\s+\w+)?/);
    if (importMatch) {
      imports.push({
        source: importMatch[1],
        imports: [importMatch[1].split('.').pop() || importMatch[1]],
        isDefault: true,
        isType: false,
      });
    }
  }

  return imports;
}

// --- Rust Parser ---

function parseRustFunctions(code: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(pub\s+)?(async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^\s{]+))?\s*\{?/);
    if (match) {
      let braceCount = 0;
      let endLine = i;
      for (let j = i; j < lines.length; j++) {
        braceCount += (lines[j].match(/\{/g) || []).length;
        braceCount -= (lines[j].match(/\}/g) || []).length;
        if (braceCount <= 0 && j > i) { endLine = j; break; }
        if (j === lines.length - 1) endLine = j;
      }

      functions.push({
        name: match[4],
        params: match[5],
        returnType: match[6],
        isAsync: !!match[3],
        isExported: !!match[2],
        startLine: i + 1,
        lineCount: endLine - i + 1,
        complexity: calculateComplexity(lines.slice(i, endLine + 1).join('\n')),
      });
    }
  }

  return functions;
}

// --- Go Parser ---

function parseGoFunctions(code: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^func\s+(?:\((\w+)\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:\(([^)]*)\)|(\w+))?\s*\{?/);
    if (match) {
      let braceCount = 0;
      let endLine = i;
      for (let j = i; j < lines.length; j++) {
        braceCount += (lines[j].match(/\{/g) || []).length;
        braceCount -= (lines[j].match(/\}/g) || []).length;
        if (braceCount <= 0 && j > i) { endLine = j; break; }
        if (j === lines.length - 1) endLine = j;
      }

      functions.push({
        name: match[2],
        params: match[3],
        returnType: match[4] || match[5],
        isAsync: false,
        isExported: match[2][0] === match[2][0].toUpperCase(),
        startLine: i + 1,
        lineCount: endLine - i + 1,
        complexity: calculateComplexity(lines.slice(i, endLine + 1).join('\n')),
      });
    }
  }

  return functions;
}

// ═══════════════════════════════════════════════
// COMPLEXITY METRICS
// ═══════════════════════════════════════════════

function calculateComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Decision points that increase complexity
  const patterns = [
    /\bif\b/g, /\belse\s+if\b/g, /\belif\b/g,
    /\bfor\b/g, /\bwhile\b/g, /\bdo\b/g,
    /\bswitch\b/g, /\bmatch\b/g,
    /\bcatch\b/g, /\bexcept\b/g,
    /\?\?/g, /\?\./g,
    /&&/g, /\|\|/g,
    /\?[^?]/g, // Ternary (but not ??)
  ];

  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) complexity += matches.length;
  }

  return complexity;
}

function getCodeMetrics(code: string): {
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  avgLineLength: number;
} {
  const lines = code.split('\n');
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let totalChars = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blankLines++;
    } else if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      commentLines++;
    } else {
      codeLines++;
      totalChars += trimmed.length;
    }
  }

  return {
    totalLines: lines.length,
    codeLines,
    commentLines,
    blankLines,
    avgLineLength: codeLines > 0 ? Math.round(totalChars / codeLines) : 0,
  };
}

// ═══════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════

export async function handleCodeAnalysis(args: any): Promise<{ content: Array<{ type: string; text: string }> }> {
  const start = Date.now();

  if (!args.code && args.action !== 'get_structure') {
    return res({ success: false, error: 'Provide code to analyze' });
  }

  const code = args.code || '';
  const language = args.language === 'auto' || !args.language
    ? detectLanguage(code, args.filename)
    : args.language;

  try {
    switch (args.action) {
      case 'analyze_code': {
        const functions = parseFunctions(code, language);
        const classes = parseClasses(code, language);
        const imports = parseImports(code, language);
        const metrics = getCodeMetrics(code);

        const totalComplexity = functions.reduce((sum, f) => sum + f.complexity, 0);
        const avgComplexity = functions.length > 0 ? totalComplexity / functions.length : 0;

        const analysis = {
          language,
          filename: args.filename,
          metrics,
          functions: {
            count: functions.length,
            exported: functions.filter(f => f.isExported).length,
            async: functions.filter(f => f.isAsync).length,
            items: functions.map(f => ({
              name: f.name,
              params: f.params,
              returnType: f.returnType,
              lines: f.lineCount,
              complexity: f.complexity,
              isAsync: f.isAsync,
              isExported: f.isExported,
            })),
          },
          classes: {
            count: classes.length,
            items: classes.map(c => ({
              name: c.name,
              extends: c.extends,
              implements: c.implements,
              methods: c.methods,
              properties: c.properties,
            })),
          },
          imports: {
            count: imports.length,
            items: imports,
            externalDeps: imports.filter(i => !i.source.startsWith('.') && !i.source.startsWith('/')).map(i => i.source),
          },
          complexity: {
            totalCyclomatic: totalComplexity,
            averageCyclomatic: Math.round(avgComplexity * 10) / 10,
            highComplexityFunctions: functions.filter(f => f.complexity > 10).map(f => ({
              name: f.name,
              complexity: f.complexity,
              recommendation: f.complexity > 20 ? 'Critical — refactor immediately' : 'High — consider splitting',
            })),
          },
        };

        if (args.store_results) {
          await addToVectorStore(
            `code_analysis_${args.filename || Date.now()}`.replace(/[^a-z0-9_]/gi, '_'),
            `Code Analysis: ${args.filename || 'unknown'}\nLanguage: ${language}\nFunctions: ${functions.map(f => f.name).join(', ')}\nClasses: ${classes.map(c => c.name).join(', ')}\nComplexity: ${totalComplexity}`,
            'code_snippets',
            { source: 'code_analysis', language, filename: args.filename }
          );
        }

        logAudit('code_analysis', `analyze: ${language}, ${functions.length} functions, ${classes.length} classes`, true, undefined, Date.now() - start);
        return res({ success: true, ...analysis });
      }

      case 'get_functions': {
        const functions = parseFunctions(code, language);
        logAudit('code_analysis', `functions: ${language} → ${functions.length}`, true, undefined, Date.now() - start);
        return res({ success: true, language, functions });
      }

      case 'get_classes': {
        const classes = parseClasses(code, language);
        logAudit('code_analysis', `classes: ${language} → ${classes.length}`, true, undefined, Date.now() - start);
        return res({ success: true, language, classes });
      }

      case 'get_imports': {
        const imports = parseImports(code, language);
        const external = imports.filter(i => !i.source.startsWith('.') && !i.source.startsWith('/'));
        const internal = imports.filter(i => i.source.startsWith('.') || i.source.startsWith('/'));

        logAudit('code_analysis', `imports: ${language} → ${imports.length}`, true, undefined, Date.now() - start);
        return res({
          success: true,
          language,
          totalImports: imports.length,
          external: external.map(i => ({ source: i.source, imports: i.imports })),
          internal: internal.map(i => ({ source: i.source, imports: i.imports })),
          dependencyList: external.map(i => i.source),
        });
      }

      case 'get_complexity': {
        const functions = parseFunctions(code, language);
        const metrics = getCodeMetrics(code);
        const overall = calculateComplexity(code);

        const sortedByComplexity = [...functions].sort((a, b) => b.complexity - a.complexity);

        logAudit('code_analysis', `complexity: ${language}`, true, undefined, Date.now() - start);
        return res({
          success: true,
          language,
          overallComplexity: overall,
          metrics,
          functionComplexity: sortedByComplexity.map(f => ({
            name: f.name,
            complexity: f.complexity,
            lines: f.lineCount,
            rating: f.complexity <= 5 ? 'simple' : f.complexity <= 10 ? 'moderate' : f.complexity <= 20 ? 'complex' : 'very-complex',
          })),
          recommendations: sortedByComplexity
            .filter(f => f.complexity > 10)
            .map(f => `${f.name} (complexity: ${f.complexity}) — consider splitting into smaller functions`),
        });
      }

      case 'get_structure': {
        const functions = parseFunctions(code, language);
        const classes = parseClasses(code, language);
        const imports = parseImports(code, language);

        // Generate a visual tree
        const tree: string[] = [];
        tree.push(`📄 ${args.filename || 'source'} (${language})`);

        if (imports.length > 0) {
          tree.push(`├── 📦 Imports (${imports.length})`);
          for (const imp of imports.slice(0, 10)) {
            tree.push(`│   ├── ${imp.source} → {${imp.imports.join(', ')}}`);
          }
        }

        if (classes.length > 0) {
          tree.push(`├── 🏗️ Classes (${classes.length})`);
          for (const cls of classes) {
            tree.push(`│   ├── ${cls.name}${cls.extends ? ` extends ${cls.extends}` : ''}`);
            for (const method of cls.methods.slice(0, 10)) {
              tree.push(`│   │   ├── ${method}()`);
            }
          }
        }

        if (functions.length > 0) {
          tree.push(`├── ⚡ Functions (${functions.length})`);
          for (const fn of functions) {
            const prefix = fn.isExported ? '📤' : '🔒';
            const async = fn.isAsync ? 'async ' : '';
            tree.push(`│   ├── ${prefix} ${async}${fn.name}(${fn.params.slice(0, 30)}) [complexity: ${fn.complexity}]`);
          }
        }

        logAudit('code_analysis', `structure: ${language}`, true, undefined, Date.now() - start);
        return res({
          success: true,
          language,
          tree: tree.join('\n'),
          summary: {
            imports: imports.length,
            classes: classes.length,
            functions: functions.length,
            exportedFunctions: functions.filter(f => f.isExported).length,
          },
        });
      }

      default:
        return res({ success: false, error: `Unknown action: ${args.action}` });
    }
  } catch (err: any) {
    logAudit('code_analysis', err.message, false, 'ERROR', Date.now() - start);
    return res({ success: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════
// PARSER DISPATCH
// ═══════════════════════════════════════════════

function parseFunctions(code: string, language: string): FunctionInfo[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return parseTSFunctions(code);
    case 'python':
      return parsePyFunctions(code);
    case 'rust':
      return parseRustFunctions(code);
    case 'go':
      return parseGoFunctions(code);
    default:
      return parseTSFunctions(code);
  }
}

function parseClasses(code: string, language: string): ClassInfo[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return parseTSClasses(code);
    case 'python':
      return parsePyClasses(code);
    default:
      return parseTSClasses(code);
  }
}

function parseImports(code: string, language: string): ImportInfo[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return parseTSImports(code);
    case 'python':
      return parsePyImports(code);
    default:
      return parseTSImports(code);
  }
}

function res(data: any): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
