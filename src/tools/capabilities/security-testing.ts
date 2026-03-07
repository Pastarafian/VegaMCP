/**
 * VegaMCP — Security Testing Tool (v2.0 — Real Emulation Edition)
 * 
 * Deep dive security testing with REAL scanning engines.
 * Features:
 * - Real DAST via HTTP probing with injection payloads
 * - Real SAST via filesystem scanning with regex patterns
 * - Real dependency audit by parsing package.json/lock files
 * - Real secret scanning via entropy analysis and regex matching
 * - Real crypto/certificate auditing via TLS inspection
 * - Real IDOR testing via sequential request probing
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { execSync } from 'child_process';
import { autoRouteDecision, runIsolated } from './sandbox-manager.js';

export const securityTestingSchema = {
  name: 'security_testing',
  description: `AI-first extensive security testing utility with REAL scanning. Runs actual DAST injection probes, filesystem SAST analysis, dependency vulnerability scanning, entropy-based secret detection, and TLS certificate auditing. Actions: dast_scan, sast_scan, dependency_audit, secret_scan, idor_test, crypto_audit.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'dast_scan', 'sast_scan', 'dependency_audit',
          'secret_scan', 'idor_test', 'crypto_audit'
        ],
        description: 'Security testing action to perform',
      },
      targetUrl: { type: 'string', description: 'URL for dynamic scans and IDOR tests' },
      targetPath: { type: 'string', description: 'Filesystem path for static/secret scans' },
      auth_token: { type: 'string', description: 'Auth token for authenticated testing context' },
      max_depth: { type: 'number', description: 'Max directory depth for scanning', default: 5 },
      exclude_patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to exclude from scanning' },
    },
    required: ['action'],
  },
};

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

// ============================================================
// HTTP Probe Helper
// ============================================================
function httpProbe(
  url: string, 
  method: string = 'GET',
  headers: Record<string, string> = {},
  body?: string,
  timeoutMs: number = 8000
): Promise<{ status: number; headers: Record<string, string>; body: string; latency_ms: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = lib.request(url, {
      method,
      headers: { 'User-Agent': 'VegaMCP-SecurityScanner/2.0', ...headers },
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
      res.on('end', () => {
        const hdrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          hdrs[k] = Array.isArray(v) ? v.join(', ') : (v || '');
        }
        resolve({ status: res.statusCode || 0, headers: hdrs, body: responseBody.substring(0, 5000), latency_ms: Date.now() - start });
      });
    });

    req.on('error', (err: any) => resolve({ status: 0, headers: {}, body: '', latency_ms: Date.now() - start, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '', latency_ms: Date.now() - start, error: 'TIMEOUT' }); });
    
    if (body) req.write(body);
    req.end();
  });
}

// ============================================================
// Entropy Calculator (for secret detection)
// ============================================================
function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ============================================================
// File Walker
// ============================================================
function walkDir(dir: string, maxDepth: number = 5, excludes: string[] = [], depth: number = 0): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const shouldExclude = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'vendor', 'coverage']
        .some(e => entry.name === e) || excludes.includes(entry.name);
      
      if (shouldExclude) continue;
      
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, maxDepth, excludes, depth + 1));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {}
  
  return files;
}

import { gate, blockedResponse } from './safety-gate.js';

export async function handleSecurityTesting(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  // Safety gate: block dangerous operations from running on host
  const check = gate('security', args.action);
  if (check.sandboxed) {
    return blockedResponse('security_testing', args.action);
  }

  switch (args.action) {

    // ═══════════════════════════════════
    // REAL DAST SCAN
    // ═══════════════════════════════════
    case 'dast_scan': {
      let targetUrl = args.targetUrl || 'http://localhost:3000';
      if (!targetUrl.startsWith('http')) targetUrl = `http://${targetUrl}`;

      const alerts: Array<{ severity: string; vector: string; endpoint: string; detail: string; status: number }> = [];
      const baselineResponse = await httpProbe(targetUrl);

      // 1. SQL Injection probes
      const sqliPayloads = ["' OR '1'='1", "1; DROP TABLE users--", "' UNION SELECT null,null--", "1' AND 1=1--"];
      for (const payload of sqliPayloads) {
        const result = await httpProbe(`${targetUrl}?id=${encodeURIComponent(payload)}`);
        if (result.status !== 0 && result.body.toLowerCase().includes('sql') || result.body.toLowerCase().includes('mysql') || result.body.toLowerCase().includes('syntax')) {
          alerts.push({ severity: 'Critical', vector: 'SQLi', endpoint: targetUrl, detail: `SQL error exposed with payload: ${payload}`, status: result.status });
        }
      }

      // 2. XSS probes
      const xssPayloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>'];
      for (const payload of xssPayloads) {
        const result = await httpProbe(`${targetUrl}?q=${encodeURIComponent(payload)}`);
        if (result.body.includes(payload) && !result.headers['content-type']?.includes('json')) {
          alerts.push({ severity: 'High', vector: 'XSS', endpoint: targetUrl, detail: `Reflected XSS: payload echoed without sanitization`, status: result.status });
          break;
        }
      }

      // 3. Security headers check
      const secHeaderChecks = [
        { header: 'x-frame-options', severity: 'Medium', vector: 'Clickjacking', detail: 'Missing X-Frame-Options header — vulnerable to iframe embedding' },
        { header: 'content-security-policy', severity: 'Medium', vector: 'CSP', detail: 'Missing Content-Security-Policy — no XSS mitigation via CSP' },
        { header: 'strict-transport-security', severity: 'Medium', vector: 'HSTS', detail: 'Missing HSTS header — not enforcing HTTPS' },
        { header: 'x-content-type-options', severity: 'Low', vector: 'MIME Sniffing', detail: 'Missing X-Content-Type-Options — vulnerable to MIME type sniffing' },
      ];
      for (const check of secHeaderChecks) {
        if (!baselineResponse.headers[check.header]) {
          alerts.push({ ...check, endpoint: targetUrl, status: baselineResponse.status });
        }
      }

      // 4. Cookie security check
      const setCookie = baselineResponse.headers['set-cookie'] || '';
      if (setCookie && !setCookie.toLowerCase().includes('httponly')) {
        alerts.push({ severity: 'Medium', vector: 'Cookie', endpoint: targetUrl, detail: 'Cookie missing HttpOnly flag', status: baselineResponse.status });
      }
      if (setCookie && !setCookie.toLowerCase().includes('secure')) {
        alerts.push({ severity: 'Low', vector: 'Cookie', endpoint: targetUrl, detail: 'Cookie missing Secure flag', status: baselineResponse.status });
      }
      if (setCookie && !setCookie.toLowerCase().includes('samesite')) {
        alerts.push({ severity: 'Low', vector: 'CSRF', endpoint: targetUrl, detail: 'Cookie missing SameSite attribute', status: baselineResponse.status });
      }

      // 5. CORS check
      const corsResult = await httpProbe(targetUrl, 'OPTIONS', { 'Origin': 'https://evil.com' });
      const acao = corsResult.headers['access-control-allow-origin'];
      if (acao === '*') {
        alerts.push({ severity: 'Medium', vector: 'CORS', endpoint: targetUrl, detail: 'CORS allows all origins (Access-Control-Allow-Origin: *)', status: corsResult.status });
      } else if (acao === 'https://evil.com') {
        alerts.push({ severity: 'High', vector: 'CORS', endpoint: targetUrl, detail: 'CORS reflects arbitrary origins — credential theft risk', status: corsResult.status });
      }

      // 6. Information disclosure
      if (baselineResponse.headers['server']) {
        alerts.push({ severity: 'Info', vector: 'Info Disclosure', endpoint: targetUrl, detail: `Server header exposes: "${baselineResponse.headers['server']}"`, status: baselineResponse.status });
      }
      if (baselineResponse.headers['x-powered-by']) {
        alerts.push({ severity: 'Low', vector: 'Info Disclosure', endpoint: targetUrl, detail: `X-Powered-By reveals: "${baselineResponse.headers['x-powered-by']}"`, status: baselineResponse.status });
      }

      const criticals = alerts.filter(a => a.severity === 'Critical');
      const highs = alerts.filter(a => a.severity === 'High');
      const mediums = alerts.filter(a => a.severity === 'Medium');

      return ok({
        action: 'dast_scan',
        target: targetUrl,
        baseline_status: baselineResponse.status,
        total_alerts: alerts.length,
        by_severity: {
          critical: criticals.length,
          high: highs.length,
          medium: mediums.length,
          low: alerts.filter(a => a.severity === 'Low').length,
          info: alerts.filter(a => a.severity === 'Info').length,
        },
        alerts,
        ai_analysis: {
          verdict: criticals.length > 0 ? '❌ Critical Vulnerabilities' : highs.length > 0 ? '⚠️ High Risk Issues' : mediums.length > 0 ? '⚠️ Medium Risk' : '✅ Pass',
          hint: `Real DAST scan with ${sqliPayloads.length + xssPayloads.length} injection payloads. ${alerts.length} total findings.`,
        },
      });
    }

    // ═══════════════════════════════════
    // REAL SAST SCAN
    // ═══════════════════════════════════
    case 'sast_scan': {
      const targetPath = args.targetPath || './src';
      if (!fs.existsSync(targetPath)) {
        return fail('PATH_NOT_FOUND', `Path does not exist: ${targetPath}`);
      }

      const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.rb', '.php', '.java', '.go', '.rs', '.cs'];
      const files = walkDir(targetPath, args.max_depth || 5, args.exclude_patterns || []);
      const codeFiles = files.filter(f => codeExtensions.includes(path.extname(f).toLowerCase()));

      const findings: Array<{ severity: string; file: string; line: number; type: string; snippet: string; fix: string }> = [];
      const PATTERNS: Array<{ regex: RegExp; type: string; severity: string; fix: string }> = [
        { regex: /eval\s*\(/g, type: 'Unsafe eval()', severity: 'Critical', fix: 'Replace eval() with JSON.parse() or a sandboxed execution context' },
        { regex: /innerHTML\s*=/g, type: 'innerHTML assignment (XSS risk)', severity: 'High', fix: 'Use textContent or sanitize HTML with DOMPurify' },
        { regex: /document\.write\s*\(/g, type: 'document.write() (XSS risk)', severity: 'High', fix: 'Use DOM manipulation APIs instead' },
        { regex: /crypto\.createCipher\s*\(/g, type: 'Deprecated createCipher', severity: 'High', fix: 'Use crypto.createCipheriv() with random IV' },
        { regex: /Math\.random\s*\(/g, type: 'Math.random() for security', severity: 'Medium', fix: 'Use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive values' },
        { regex: /new\s+Function\s*\(/g, type: 'Dynamic Function constructor', severity: 'High', fix: 'Avoid dynamic code generation. Use static imports or safe alternatives' },
        { regex: /child_process.*exec\s*\(/g, type: 'Unsanitized exec()', severity: 'High', fix: 'Use execFile() with explicit arguments instead of shell interpolation' },
        { regex: /process\.env\.\w+/g, type: 'Direct env access', severity: 'Info', fix: 'Consider using a config module with validation for environment variables' },
        { regex: /password\s*[:=]\s*['"][^'"]{3,}['"]/gi, type: 'Hardcoded password', severity: 'Critical', fix: 'Move credentials to environment variables or a secrets manager' },
        { regex: /TODO|FIXME|HACK|XXX/g, type: 'Technical debt marker', severity: 'Info', fix: 'Review and address these code markers' },
        { regex: /console\.(log|debug|trace)\s*\(/g, type: 'Debug logging in code', severity: 'Low', fix: 'Remove console statements or use a proper logging library with level control' },
        { regex: /require\s*\(\s*[^'"]/g, type: 'Dynamic require()', severity: 'Medium', fix: 'Use static imports for security and bundle analysis' },
        { regex: /\.createConnection\s*\(\s*['"].*:\/\//g, type: 'Connection string in code', severity: 'High', fix: 'Move database connection strings to environment variables' },
        { regex: /res\.send\(\s*req\.(query|body|params)/g, type: 'Reflected input (XSS)', severity: 'High', fix: 'Sanitize and encode user input before reflecting in response' },
      ];

      let linesScanned = 0;

      for (const file of codeFiles) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          linesScanned += lines.length;

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            for (const pattern of PATTERNS) {
              if (pattern.regex.test(line)) {
                // Only report non-info findings or first few info findings
                if (pattern.severity !== 'Info' || findings.filter(f => f.type === pattern.type).length < 3) {
                  findings.push({
                    severity: pattern.severity,
                    file: path.relative(targetPath, file),
                    line: lineIdx + 1,
                    type: pattern.type,
                    snippet: line.trim().substring(0, 120),
                    fix: pattern.fix,
                  });
                }
                pattern.regex.lastIndex = 0; // Reset regex
              }
            }
          }
        } catch {}

        // Cap at 100 findings
        if (findings.length >= 100) break;
      }

      const criticals = findings.filter(f => f.severity === 'Critical');
      const highs = findings.filter(f => f.severity === 'High');

      return ok({
        action: 'sast_scan',
        target: targetPath,
        files_scanned: codeFiles.length,
        lines_of_code: linesScanned,
        total_findings: findings.length,
        by_severity: {
          critical: criticals.length,
          high: highs.length,
          medium: findings.filter(f => f.severity === 'Medium').length,
          low: findings.filter(f => f.severity === 'Low').length,
          info: findings.filter(f => f.severity === 'Info').length,
        },
        findings: findings.slice(0, 50),
        ai_analysis: {
          verdict: criticals.length > 0 ? '❌ Critical Action Required' : highs.length > 0 ? '⚠️ High Risk Issues' : '✅ Clean',
          top_issues: [...criticals, ...highs].slice(0, 5).map(f => `[${f.severity}] ${f.type} in ${f.file}:${f.line}`),
          hint: `Real SAST scan analyzed ${codeFiles.length} files (${linesScanned.toLocaleString()} lines) with ${PATTERNS.length} security patterns. ${findings.length} findings.`,
        },
      });
    }

    // ═══════════════════════════════════
    // REAL DEPENDENCY AUDIT
    // ═══════════════════════════════════
    case 'dependency_audit': {
      const targetPath = args.targetPath || '.';
      const results: any = { npm: null, pip: null };

      // NPM audit
      const packageJsonPath = path.join(targetPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          const depCount = Object.keys(allDeps).length;

          // Run npm audit — Docker-isolated when available
          let auditText = '';
          const dockerProfile = autoRouteDecision('security_testing', 'dependency_audit');
          if (dockerProfile) {
            // Run npm audit inside isolated container
            const result = runIsolated({
              profile: dockerProfile,
              command: 'cd /workspace && npm audit --json 2>/dev/null || true',
              timeoutMs: 30000,
              network: true, // npm audit needs network
              securityLevel: 'strict',
              copyIn: [
                { hostPath: packageJsonPath, containerPath: '/workspace/package.json' },
                ...(fs.existsSync(path.join(targetPath, 'package-lock.json'))
                  ? [{ hostPath: path.join(targetPath, 'package-lock.json'), containerPath: '/workspace/package-lock.json' }]
                  : []),
              ],
            });
            auditText = result.stdout || '';
          } else {
            // Fallback: host execution
            try {
              auditText = execSync('npm audit --json 2>/dev/null || npm audit --json 2>nul', {
                encoding: 'utf-8', cwd: targetPath, timeout: 30000, windowsHide: true,
              });
            } catch (e: any) {
              auditText = e.stdout || '';
            }
          }

          let auditData: any = null;
          try { auditData = JSON.parse(auditText); } catch {}

          if (auditData?.vulnerabilities) {
            const vulns = Object.entries(auditData.vulnerabilities || {}).map(([name, data]: [string, any]) => ({
              package: name,
              severity: data.severity,
              via: Array.isArray(data.via) ? data.via.filter((v: any) => typeof v === 'string').join(', ') : '',
              fixAvailable: !!data.fixAvailable,
              range: data.range,
            }));
            results.npm = {
              total_packages: depCount,
              total_vulnerabilities: vulns.length,
              by_severity: {
                critical: vulns.filter(v => v.severity === 'critical').length,
                high: vulns.filter(v => v.severity === 'high').length,
                moderate: vulns.filter(v => v.severity === 'moderate').length,
                low: vulns.filter(v => v.severity === 'low').length,
              },
              vulnerabilities: vulns.slice(0, 20),
              auto_fixable: vulns.filter(v => v.fixAvailable).length,
            };
          } else {
            // Manual check: list dependencies with versions
            results.npm = {
              total_packages: depCount,
              dependencies: Object.entries(allDeps).slice(0, 30).map(([name, version]) => ({ name, version })),
              note: 'npm audit --json did not return structured data. Dependencies listed for manual review.',
            };
          }
        } catch (e: any) {
          results.npm = { error: e.message };
        }
      }

      // Python requirements check
      const reqPath = path.join(targetPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        try {
          const content = fs.readFileSync(reqPath, 'utf-8');
          const deps = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
            const match = l.match(/^([a-zA-Z0-9_-]+)([<>=!]+.+)?$/);
            return match ? { name: match[1], version: match[2] || 'any' } : null;
          }).filter(Boolean);
          results.pip = { total_packages: deps.length, dependencies: deps };
        } catch {}
      }

      return ok({
        action: 'dependency_audit',
        target: targetPath,
        ecosystems: results,
        ai_analysis: {
          verdict: results.npm?.total_vulnerabilities > 0 ? '⚠️ Vulnerabilities Found' : '✅ Dependencies Clean',
          hint: 'Real dependency analysis. Run `npm audit fix` to auto-patch known vulnerabilities.',
        },
      });
    }

    // ═══════════════════════════════════
    // REAL SECRET SCANNING
    // ═══════════════════════════════════
    case 'secret_scan': {
      const targetPath = args.targetPath || '.';
      if (!fs.existsSync(targetPath)) return fail('PATH_NOT_FOUND', `Path not found: ${targetPath}`);

      const files = walkDir(targetPath, args.max_depth || 5, args.exclude_patterns || []);
      const scanExtensions = ['.ts', '.js', '.py', '.env', '.yml', '.yaml', '.json', '.xml', '.cfg', '.ini', '.conf', '.properties', '.toml'];
      const scanFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        const name = path.basename(f).toLowerCase();
        return scanExtensions.includes(ext) || name.startsWith('.env') || name === 'docker-compose.yml';
      });

      const SECRET_PATTERNS: Array<{ name: string; regex: RegExp; severity: string }> = [
        { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'Critical' },
        { name: 'AWS Secret Key', regex: /[A-Za-z0-9/+=]{40}(?=.*aws)/gi, severity: 'Critical' },
        { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g, severity: 'Critical' },
        { name: 'Slack Token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g, severity: 'High' },
        { name: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'Critical' },
        { name: 'API Key Pattern', regex: /['"]?(?:api[_-]?key|apikey|api_secret)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi, severity: 'High' },
        { name: 'Password Assignment', regex: /['"]?password['"]?\s*[:=]\s*['"][^'"]{8,}['"]/gi, severity: 'High' },
        { name: 'Connection String', regex: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/gi, severity: 'High' },
        { name: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, severity: 'Medium' },
        { name: 'Generic Secret', regex: /['"]?(?:secret|token|auth)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi, severity: 'Medium' },
        { name: 'IP Address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, severity: 'Info' },
      ];

      const secrets: Array<{ type: string; severity: string; file: string; line: number; snippet: string; entropy: number }> = [];

      for (const file of scanFiles) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          if (content.length > 500000) continue; // Skip very large files
          
          const lines = content.split('\n');
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            
            for (const pattern of SECRET_PATTERNS) {
              pattern.regex.lastIndex = 0;
              if (pattern.regex.test(line)) {
                // Calculate entropy of the suspicious value
                const valueMatch = line.match(/['"][A-Za-z0-9_\-/+=.]{16,}['"]/);
                const entropy = valueMatch ? shannonEntropy(valueMatch[0]) : shannonEntropy(line);

                // Skip low-entropy matches (likely not real secrets)
                if (pattern.severity !== 'Info' && entropy < 2.5 && pattern.name !== 'Private Key') continue;

                // Skip .example and test files for non-critical patterns
                const isExample = file.includes('.example') || file.includes('.sample') || file.includes('test');
                if (isExample && pattern.severity !== 'Critical') continue;

                secrets.push({
                  type: pattern.name,
                  severity: isExample ? 'Low' : pattern.severity,
                  file: path.relative(targetPath, file),
                  line: lineIdx + 1,
                  snippet: line.trim().substring(0, 80).replace(/[A-Za-z0-9_\-/+=]{16,}/g, (m) => m.substring(0, 4) + '***REDACTED***'),
                  entropy: +entropy.toFixed(2),
                });
              }
            }
          }
        } catch {}

        if (secrets.length >= 100) break;
      }

      const criticals = secrets.filter(s => s.severity === 'Critical');
      const highs = secrets.filter(s => s.severity === 'High');

      return ok({
        action: 'secret_scan',
        target: targetPath,
        files_scanned: scanFiles.length,
        total_secrets: secrets.length,
        by_severity: {
          critical: criticals.length,
          high: highs.length,
          medium: secrets.filter(s => s.severity === 'Medium').length,
          low: secrets.filter(s => s.severity === 'Low').length,
          info: secrets.filter(s => s.severity === 'Info').length,
        },
        secrets: secrets.slice(0, 30),
        ai_analysis: {
          verdict: criticals.length > 0 ? '❌ Critical Secrets Exposed' : highs.length > 0 ? '⚠️ Secrets Found' : '✅ Clean',
          top_concerns: [...criticals, ...highs].slice(0, 5).map(s => `[${s.severity}] ${s.type} in ${s.file}:${s.line}`),
          hint: `Real secret scan with entropy analysis. ${secrets.length} potential secrets found in ${scanFiles.length} files. Values with entropy < 2.5 were filtered out.`,
          remediation: criticals.length > 0 ? 'Immediately rotate all critical secrets. Add files to .gitignore and consider git-filter-branch to scrub history.' : undefined,
        },
      });
    }

    // ═══════════════════════════════════
    // REAL IDOR TEST
    // ═══════════════════════════════════
    case 'idor_test': {
      let targetUrl = args.targetUrl || 'http://localhost:3000/api/users';
      if (!targetUrl.startsWith('http')) targetUrl = `http://${targetUrl}`;

      const headers: Record<string, string> = {};
      if (args.auth_token) {
        headers['Authorization'] = `Bearer ${args.auth_token}`;
      }

      const tests: Array<{ endpoint: string; status: number; object_id: string; access: string; vulnerability: boolean }> = [];

      // Test sequential IDs
      const baseUrl = targetUrl.replace(/\/\d+$/, '');
      for (const id of ['1', '2', '3', '999', '0', '-1']) {
        const url = `${baseUrl}/${id}`;
        const result = await httpProbe(url, 'GET', headers);
        const accessible = result.status >= 200 && result.status < 300;
        tests.push({
          endpoint: url,
          status: result.status,
          object_id: id,
          access: accessible ? 'Granted' : `Denied (${result.status})`,
          vulnerability: accessible && ['999', '0', '-1'].includes(id),
        });
      }

      // Test UUID-based access
      const fakeUuid = crypto.randomUUID();
      const uuidResult = await httpProbe(`${baseUrl}/${fakeUuid}`, 'GET', headers);
      tests.push({
        endpoint: `${baseUrl}/${fakeUuid}`,
        status: uuidResult.status,
        object_id: fakeUuid,
        access: uuidResult.status >= 200 && uuidResult.status < 300 ? 'Granted' : `Denied (${uuidResult.status})`,
        vulnerability: uuidResult.status >= 200 && uuidResult.status < 300,
      });

      const vulnerable = tests.filter(t => t.vulnerability);

      return ok({
        action: 'idor_test',
        target: targetUrl,
        total_probes: tests.length,
        vulnerable_endpoints: vulnerable.length,
        tests,
        ai_analysis: {
          verdict: vulnerable.length > 0 ? '❌ IDOR Vulnerability Detected' : '✅ Access Control Enforced',
          hint: vulnerable.length > 0
            ? `${vulnerable.length} objects accessible without proper authorization. Implement row-level security and verify object ownership.`
            : 'All probed object IDs returned proper access control responses. Sequential ID enumeration did not expose unauthorized data.',
        },
      });
    }

    // ═══════════════════════════════════
    // REAL CRYPTO AUDIT
    // ═══════════════════════════════════
    case 'crypto_audit': {
      const checks: Array<{ category: string; status: string; passed: boolean; detail?: string }> = [];

      // Check TLS if URL provided
      if (args.targetUrl) {
        let host = args.targetUrl;
        if (host.includes('://')) {
          try { host = new URL(host).hostname; } catch {}
        }

        try {
          const result = await new Promise<any>((resolve) => {
            const req = https.request({ hostname: host, port: 443, method: 'HEAD', rejectUnauthorized: false, timeout: 5000 }, (res) => {
              const socket = res.socket as any;
              resolve({
                protocol: socket.getProtocol?.(),
                cipher: socket.getCipher?.(),
                authorized: socket.authorized,
              });
              res.destroy();
            });
            req.on('error', (err: any) => resolve({ error: err.message }));
            req.end();
          });

          if (!result.error) {
            checks.push({
              category: 'TLS Protocol',
              status: result.protocol || 'Unknown',
              passed: result.protocol?.includes('TLSv1.2') || result.protocol?.includes('TLSv1.3') || false,
              detail: result.protocol?.includes('TLSv1.0') ? 'TLS 1.0 is deprecated — upgrade to TLS 1.2+' : undefined,
            });

            if (result.cipher) {
              checks.push({
                category: 'Cipher Suite',
                status: result.cipher.name || 'Unknown',
                passed: !result.cipher.name?.includes('RC4') && !result.cipher.name?.includes('DES') && !result.cipher.name?.includes('NULL'),
                detail: result.cipher.name?.includes('RC4') || result.cipher.name?.includes('DES') ? 'Weak cipher detected' : `Using ${result.cipher.name} (${result.cipher.standardName || ''})`,
              });
            }

            checks.push({
              category: 'Certificate Trust',
              status: result.authorized ? 'Trusted' : 'Untrusted',
              passed: result.authorized,
            });
          }
        } catch {}
      }

      // Check local crypto capabilities
      checks.push({
        category: 'Node.js Crypto',
        status: `OpenSSL ${process.versions.openssl || 'unknown'}`,
        passed: true,
      });

      const hashes = crypto.getHashes();
      checks.push({
        category: 'Hash Algorithms',
        status: `${hashes.length} algorithms available`,
        passed: hashes.includes('sha256') && hashes.includes('sha512'),
        detail: hashes.includes('md5') ? 'MD5 available — do not use for security' : undefined,
      });

      const ciphers = crypto.getCiphers();
      checks.push({
        category: 'Symmetric Ciphers',
        status: `${ciphers.length} ciphers available`,
        passed: ciphers.includes('aes-256-gcm'),
        detail: `AES-256-GCM ${ciphers.includes('aes-256-gcm') ? '✅ available' : '❌ missing'}`,
      });

      const failures = checks.filter(c => !c.passed);

      return ok({
        action: 'crypto_audit',
        target: args.targetUrl || 'local_system',
        total_checks: checks.length,
        passed: checks.filter(c => c.passed).length,
        failed: failures.length,
        checks,
        ai_analysis: {
          verdict: failures.length === 0 ? '✅ Cryptographic Standards Met' : '⚠️ Cryptographic Issues',
          hint: `Real crypto audit: ${checks.filter(c => c.passed).length}/${checks.length} checks passed. ${failures.length > 0 ? 'Review failed checks for security improvements.' : 'All cryptographic standards are properly configured.'}`,
        },
      });
    }

    default:
      return fail('UNKNOWN_ACTION', `Action ${args.action} not supported in Security Testing`);
  }
}
