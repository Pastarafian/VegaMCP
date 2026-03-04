import { logAudit } from '../../db/graph-store.js';

export const securityToolkitSchema = {
  name: 'security_toolkit',
  description: `Universal Security Toolkit. Access expert security patterns, vulnerability scanners, cryptography tools, and security checklists.
Actions:
- scan_code: Basic static analysis for common vulnerabilities (SQLi, XSS, etc.)
- generate_policy: Generate security headers (CSP, CORS, etc.)
- crypto_utils: Common cryptography recommendations and generation
- compliance_check: Check configurations against compliance standards (OWASP, GDPR)
- threat_model: Generate basic threat models for architecture
- audit_guide: Get security auditing steps for specific frameworks`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'scan_code', 'generate_policy', 'crypto_utils', 
          'compliance_check', 'threat_model', 'audit_guide'
        ],
        description: 'Security toolkit action to perform',
      },
      target: { type: 'string', description: 'Target system or framework (e.g., nodejs, react, aws)' },
      code_snippet: { type: 'string', description: 'Code to scan or analyze' },
      query: { type: 'string', description: 'Specific vulnerability or topic to look up' }
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

export async function handleSecurityToolkit(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const start = Date.now();
  
  try {
    switch (args.action) {
      case 'scan_code': {
        const code = args.code_snippet || '';
        const findings: string[] = [];
        let score = 100;
        if (code.match(/eval\(/)) { findings.push('eval() usage detected. This is a critical security risk.'); score -= 40; }
        if (code.match(/innerHTML\w*=/)) { findings.push('innerHTML assignment found. Potential XSS vulnerability.'); score -= 30; }
        if (code.match(/SELECT.*FROM.*WHERE.*=/i) && !code.match(/\?/)) { findings.push('Potential SQL Injection. Ensure parameterized queries are used.'); score -= 40; }
        
        return ok({
          action: 'scan_code',
          rating: {
            security_score: Math.max(score, 0),
            grade: score === 100 ? 'A+' : score >= 80 ? 'B' : score >= 60 ? 'C' : 'F'
          },
          status: findings.length ? 'vulnerable' : 'clean',
          findings,
          ai_analysis: { hint: 'Review these findings. False positives may occur, but they warrant manual inspection.' }
        });
      }

      case 'generate_policy': {
        const policyType = args.query || 'csp';
        let policy = '';
        if (policyType.toLowerCase() === 'csp') {
          policy = "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self';";
        } else if (policyType.toLowerCase() === 'cors') {
          policy = "Access-Control-Allow-Origin: https://yourdomain.com\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE\nAccess-Control-Allow-Headers: Content-Type, Authorization";
        } else {
          policy = "Strict-Transport-Security: max-age=31536000; includeSubDomains\nX-Content-Type-Options: nosniff\nX-Frame-Options: SAMEORIGIN";
        }
        return ok({
          action: 'generate_policy',
          type: policyType,
          policy,
          ai_analysis: { hint: 'Apply these headers at your application edge or web server.' }
        });
      }

      case 'crypto_utils': {
        return ok({
          action: 'crypto_utils',
          topic: args.query || 'password_hashing',
          recommendation: 'Use Argon2id or bcrypt with a high cost factor (e.g., 12+) for password hashing. Never use MD5 or SHA1.',
          example: 'const bcrypt = require("bcrypt");\\nconst saltRounds = 12;\\nconst hash = await bcrypt.hash(password, saltRounds);',
          ai_analysis: { hint: 'Always use established libraries rather than rolling your own crypto.' }
        });
      }

      case 'compliance_check': {
        const standard = args.query || 'owasp';
        const target = args.target || '';
        let complianceScore = 90;
        const checklist: string[] = [];
        if (standard.toLowerCase().includes('owasp')) {
          checklist.push(
            'A01:2021 - Broken Access Control',
            'A02:2021 - Cryptographic Failures',
            'A03:2021 - Injection',
            'A04:2021 - Insecure Design',
            'A05:2021 - Security Misconfiguration'
          );
          // Deduct for specific known vulnerability patterns
          if (target.toLowerCase().includes('eval')) complianceScore -= 15;
          if (target.toLowerCase().includes('http://')) complianceScore -= 10;
        }
        return ok({
          action: 'compliance_check',
          standard,
          rating: {
            compliance_score: complianceScore,
            status: complianceScore >= 85 ? 'Compliant' : 'Needs Assessment'
          },
          checklist,
          ai_analysis: { hint: 'Ensure your automated tests cover these top OWASP categories.' }
        });
      }

      case 'threat_model': {
        return ok({
          action: 'threat_model',
          target: args.target || 'web_application',
          threats: [
            { actor: 'External User', vector: 'Input forms', impact: 'Data exfiltration via SQLi' },
            { actor: 'Internal Employee', vector: 'Admin panel', impact: 'Privilege escalation' }
          ],
          mitigations: 'Implement strict input validation, least privilege access, and comprehensive audit logging.',
          ai_analysis: { hint: 'Use STRIDE methodology to expand this threat model.' }
        });
      }

      case 'audit_guide': {
        return ok({
          action: 'audit_guide',
          framework: args.target || 'general',
          steps: [
            '1. Review dependency tree for known CVEs (npm audit / snyk)',
            '2. Check authentication mechanisms for brute force protection',
            '3. Verify authorization logic on all sensitive endpoints',
            '4. Inspect data-at-rest encryption practices'
          ],
          ai_analysis: { hint: 'Automate step 1 in your CI/CD pipeline.' }
        });
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - start;
    logAudit('security_toolkit', `${args.action || 'unknown'}: Error: ${error.message}`, false, 'SECURITY_TOOLKIT_ERROR', elapsed);
    return fail('SECURITY_TOOLKIT_ERROR', `${args.action} failed: ${error.message}`);
  }
}
