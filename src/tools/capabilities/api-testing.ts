/**
 * VegaMCP — API Testing Tool (v7.0)
 * 
 * AI-First API quality assurance and testing platform.
 * Features:
 * - Endpoint discovery from OpenAPI/Swagger specs
 * - Contract testing (schema validation against spec)
 * - Load testing (concurrent request simulation)
 * - Auth flow testing (JWT, OAuth, API keys)
 * - Response validation (status codes, schemas, timing)
 * - Sequence testing (multi-step API workflows)
 * - Mock server for development
 * - API diff testing (compare two endpoints/environments)
 * 
 * All outputs include structured `ai_analysis` blocks for AI consumption.
 */

import { logAudit } from '../../db/graph-store.js';

// ============================================================
// Schema
// ============================================================

export const apiTestingSchema = {
  name: 'api_testing',
  description: `API quality testing platform. Actions: discover_endpoints (parse OpenAPI/Swagger specs), contract_test (validate responses against schema), load_test (concurrent request stress testing), auth_flow (test authentication flows), validate_response (check status/schema/timing), sequence_test (multi-step API workflows), mock_server (stub endpoints for dev), diff_test (compare endpoint responses across environments). All outputs include ai_analysis blocks.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: [
          'discover_endpoints',
          'contract_test',
          'load_test',
          'auth_flow',
          'validate_response',
          'sequence_test',
          'mock_server',
          'diff_test',
        ],
        description: 'API testing action to perform',
      },
      // Common
      url: { type: 'string', description: 'API endpoint URL' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], default: 'GET', description: 'HTTP method' },
      headers: { type: 'object', description: 'Request headers as key-value pairs' },
      body: { type: 'object', description: 'Request body (for POST/PUT/PATCH)' },
      timeout: { type: 'number', description: 'Request timeout in ms', default: 10000 },
      // Discover
      spec_url: { type: 'string', description: 'OpenAPI/Swagger spec URL (discover_endpoints)' },
      // Contract
      expected_status: { type: 'number', description: 'Expected HTTP status code (contract_test, validate_response)' },
      expected_schema: { type: 'object', description: 'Expected JSON schema for response validation' },
      // Load test
      concurrency: { type: 'number', description: 'Number of concurrent requests (load_test)', default: 10 },
      total_requests: { type: 'number', description: 'Total requests to send (load_test)', default: 50 },
      ramp_up_ms: { type: 'number', description: 'Ramp-up period in ms (load_test)', default: 1000 },
      // Auth
      auth_type: { type: 'string', enum: ['bearer', 'basic', 'api_key', 'oauth2'], description: 'Authentication type (auth_flow)' },
      auth_credentials: { type: 'object', description: 'Auth credentials { token?, username?, password?, key?, client_id?, client_secret?, token_url? }' },
      // Sequence
      steps: {
        type: 'array',
        items: { type: 'object' },
        description: 'Sequence steps [{method, url, headers?, body?, extract?, assert?}] (sequence_test)',
      },
      // Diff
      url_b: { type: 'string', description: 'Second URL to compare against (diff_test)' },
      // Mock
      mock_routes: {
        type: 'array',
        items: { type: 'object' },
        description: 'Mock routes [{method, path, status, response}] (mock_server)',
      },
    },
    required: ['action'],
  },
};

// ============================================================
// Structured output helpers
// ============================================================

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

// ============================================================
// HTTP request helper
// ============================================================

interface RequestResult {
  status: number;
  headers: Record<string, string>;
  body: any;
  rawBody: string;
  duration_ms: number;
  size_bytes: number;
  error?: string;
}

async function makeRequest(
  url: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  body?: any,
  timeoutMs: number = 10000,
): Promise<RequestResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: controller.signal,
    };

    if (body && !['GET', 'HEAD'].includes(method)) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const rawBody = await response.text();
    const duration_ms = Date.now() - start;

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      headers: responseHeaders,
      body: parsedBody,
      rawBody,
      duration_ms,
      size_bytes: rawBody.length,
    };
  } catch (error: any) {
    return {
      status: 0,
      headers: {},
      body: null,
      rawBody: '',
      duration_ms: Date.now() - start,
      size_bytes: 0,
      error: error.message || 'Request failed',
    };
  }
}

// ============================================================
// Schema validation helper
// ============================================================

function validateSchema(data: any, schema: any, path: string = ''): string[] {
  const errors: string[] = [];

  if (!schema || !data) return errors;

  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    if (schema.type !== actualType) {
      errors.push(`${path || 'root'}: expected type "${schema.type}", got "${actualType}"`);
      return errors;
    }
  }

  if (schema.type === 'object' && schema.properties) {
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (data[field] === undefined) {
          errors.push(`${path}.${field}: required field missing`);
        }
      }
    }

    // Check property types
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (data[key] !== undefined) {
        errors.push(...validateSchema(data[key], propSchema as any, `${path}.${key}`));
      }
    }
  }

  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      errors.push(...validateSchema(data[i], schema.items, `${path}[${i}]`));
    }
  }

  return errors;
}

// ============================================================
// Main Handler
// ============================================================

export async function handleApiTesting(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {

      // ═══════════════════════════════════
      // DISCOVER ENDPOINTS
      // ═══════════════════════════════════
      case 'discover_endpoints': {
        const specUrl = args.spec_url || args.url;
        if (!specUrl) return fail('MISSING_PARAM', 'spec_url or url is required');

        const result = await makeRequest(specUrl, 'GET', {}, undefined, args.timeout || 15000);
        if (result.error) return fail('FETCH_ERROR', `Failed to fetch spec: ${result.error}`);

        let spec: any;
        try {
          spec = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
        } catch {
          return fail('PARSE_ERROR', 'Could not parse OpenAPI/Swagger spec as JSON');
        }

        // Parse OpenAPI 3.x or Swagger 2.0
        const isV3 = spec.openapi && spec.openapi.startsWith('3');
        const paths = spec.paths || {};
        const endpoints: any[] = [];

        for (const [path, methods] of Object.entries(paths)) {
          for (const [method, details] of Object.entries(methods as any)) {
            if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
              const op = details as any;
              endpoints.push({
                method: method.toUpperCase(),
                path,
                summary: op.summary || '',
                description: op.description?.substring(0, 100) || '',
                tags: op.tags || [],
                parameters: (op.parameters || []).map((p: any) => ({
                  name: p.name,
                  in: p.in,
                  required: p.required || false,
                  type: p.schema?.type || p.type || '',
                })),
                has_request_body: !!op.requestBody,
                responses: Object.keys(op.responses || {}),
                security: op.security ? Object.keys(op.security[0] || {}) : [],
              });
            }
          }
        }

        // Group by tag
        const byTag: Record<string, number> = {};
        for (const ep of endpoints) {
          const tag = ep.tags[0] || 'untagged';
          byTag[tag] = (byTag[tag] || 0) + 1;
        }

        return ok({
          discover: {
            title: spec.info?.title || 'Unknown API',
            version: spec.info?.version || '',
            spec_version: isV3 ? `OpenAPI ${spec.openapi}` : `Swagger ${spec.swagger}`,
            base_url: isV3 ? spec.servers?.[0]?.url : `${spec.schemes?.[0] || 'https'}://${spec.host}${spec.basePath || ''}`,
            total_endpoints: endpoints.length,
            methods: {
              GET: endpoints.filter(e => e.method === 'GET').length,
              POST: endpoints.filter(e => e.method === 'POST').length,
              PUT: endpoints.filter(e => e.method === 'PUT').length,
              PATCH: endpoints.filter(e => e.method === 'PATCH').length,
              DELETE: endpoints.filter(e => e.method === 'DELETE').length,
            },
            by_tag: byTag,
          },
          endpoints: endpoints.slice(0, 50),
          ai_analysis: {
            hint: `Found ${endpoints.length} endpoints. Use validate_response to test individual endpoints, or sequence_test for multi-step workflows.`,
            auth_schemes: spec.securityDefinitions ? Object.keys(spec.securityDefinitions) : (spec.components?.securitySchemes ? Object.keys(spec.components.securitySchemes) : []),
            coverage_suggestion: `Test the ${Math.min(10, endpoints.length)} most critical endpoints: ${endpoints.filter(e => e.method === 'POST').slice(0, 3).map(e => e.path).concat(endpoints.filter(e => e.method === 'GET').slice(0, 3).map(e => e.path)).join(', ')}`,
          },
        });
      }

      // ═══════════════════════════════════
      // CONTRACT TEST
      // ═══════════════════════════════════
      case 'contract_test': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');

        const result = await makeRequest(
          args.url,
          args.method || 'GET',
          args.headers || {},
          args.body,
          args.timeout || 10000,
        );

        if (result.error) return fail('REQUEST_ERROR', result.error);

        const issues: string[] = [];

        // Check status code
        if (args.expected_status && result.status !== args.expected_status) {
          issues.push(`Status: expected ${args.expected_status}, got ${result.status}`);
        }

        // Check schema
        let schemaErrors: string[] = [];
        if (args.expected_schema) {
          schemaErrors = validateSchema(result.body, args.expected_schema);
          issues.push(...schemaErrors);
        }

        // Check response time
        const timingIssues: string[] = [];
        if (result.duration_ms > 5000) timingIssues.push(`Very slow response: ${result.duration_ms}ms`);
        else if (result.duration_ms > 2000) timingIssues.push(`Slow response: ${result.duration_ms}ms`);

        // Check headers
        const headerIssues: string[] = [];
        if (!result.headers['content-type']) headerIssues.push('Missing Content-Type header');
        if (!result.headers['x-request-id'] && !result.headers['x-trace-id']) headerIssues.push('No request tracing header');

        return ok({
          contract_test: {
            url: args.url,
            method: args.method || 'GET',
            status: result.status,
            duration_ms: result.duration_ms,
            response_size_bytes: result.size_bytes,
            passed: issues.length === 0,
            issues_count: issues.length + timingIssues.length + headerIssues.length,
          },
          response_preview: typeof result.body === 'object'
            ? JSON.stringify(result.body, null, 2).substring(0, 500)
            : result.rawBody.substring(0, 500),
          issues,
          timing_issues: timingIssues,
          header_issues: headerIssues,
          schema_errors: schemaErrors.length > 0 ? schemaErrors : undefined,
          ai_analysis: {
            verdict: issues.length === 0 && timingIssues.length === 0
              ? '✅ Contract test PASSED'
              : `❌ Contract test FAILED (${issues.length + timingIssues.length} issues)`,
            hint: 'Schema mismatches indicate breaking API changes. Status code mismatches suggest endpoint behavior changes.',
          },
        });
      }

      // ═══════════════════════════════════
      // LOAD TEST
      // ═══════════════════════════════════
      case 'load_test': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');

        const concurrency = Math.min(args.concurrency || 10, 50); // Cap at 50
        const totalRequests = Math.min(args.total_requests || 50, 200); // Cap at 200
        const rampUp = args.ramp_up_ms || 1000;

        const results: RequestResult[] = [];
        const batchSize = concurrency;
        const batches = Math.ceil(totalRequests / batchSize);
        const delayBetweenBatches = Math.max(rampUp / batches, 50);

        const loadTestStart = Date.now();

        for (let batch = 0; batch < batches; batch++) {
          const remaining = totalRequests - results.length;
          const thisBatch = Math.min(batchSize, remaining);

          const promises = Array.from({ length: thisBatch }, () =>
            makeRequest(args.url, args.method || 'GET', args.headers || {}, args.body, args.timeout || 10000)
          );

          const batchResults = await Promise.all(promises);
          results.push(...batchResults);

          if (batch < batches - 1) {
            await new Promise(r => setTimeout(r, delayBetweenBatches));
          }
        }

        const totalTime = Date.now() - loadTestStart;

        // Calculate statistics
        const durations = results.map(r => r.duration_ms).sort((a, b) => a - b);
        const successful = results.filter(r => r.status >= 200 && r.status < 400);
        const failed = results.filter(r => r.error || r.status >= 400);

        const statusCounts: Record<number, number> = {};
        for (const r of results) {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        }

        const stats = {
          total_requests: results.length,
          successful: successful.length,
          failed: failed.length,
          error_rate_percent: Math.round((failed.length / results.length) * 100),
          total_duration_ms: totalTime,
          requests_per_second: Math.round((results.length / totalTime) * 1000 * 100) / 100,
          latency: {
            min_ms: durations[0] || 0,
            max_ms: durations[durations.length - 1] || 0,
            avg_ms: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
            p50_ms: durations[Math.floor(durations.length * 0.5)] || 0,
            p90_ms: durations[Math.floor(durations.length * 0.9)] || 0,
            p95_ms: durations[Math.floor(durations.length * 0.95)] || 0,
            p99_ms: durations[Math.floor(durations.length * 0.99)] || 0,
          },
          status_codes: statusCounts,
        };

        return ok({
          load_test: {
            url: args.url,
            method: args.method || 'GET',
            concurrency,
            ...stats,
          },
          ai_analysis: {
            verdict: stats.error_rate_percent > 10
              ? `❌ High error rate: ${stats.error_rate_percent}%`
              : stats.latency.p95_ms > 3000
              ? `⚠️ Slow under load: p95=${stats.latency.p95_ms}ms`
              : `✅ API handles ${concurrency} concurrent users at ${stats.requests_per_second} req/s`,
            performance_grade: stats.latency.p95_ms < 500 ? 'A' : stats.latency.p95_ms < 1000 ? 'B' : stats.latency.p95_ms < 3000 ? 'C' : 'D',
            bottleneck_indicator: stats.latency.p99_ms > stats.latency.p50_ms * 5
              ? 'High variance detected — likely server-side bottleneck under concurrency'
              : 'Response times are consistent under load',
            hint: `Tested ${totalRequests} requests at ${concurrency} concurrency. p95 latency is the key metric for SLA compliance.`,
          },
        });
      }

      // ═══════════════════════════════════
      // AUTH FLOW
      // ═══════════════════════════════════
      case 'auth_flow': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const authType = args.auth_type || 'bearer';
        const creds = args.auth_credentials || {};
        const testResults: any[] = [];

        // Test 1: No auth (should fail with 401/403)
        const noAuth = await makeRequest(args.url, args.method || 'GET', {}, undefined, args.timeout || 10000);
        testResults.push({
          test: 'no_auth',
          status: noAuth.status,
          passed: noAuth.status === 401 || noAuth.status === 403,
          message: (noAuth.status === 401 || noAuth.status === 403)
            ? 'Correctly rejects unauthenticated requests'
            : `Expected 401/403 but got ${noAuth.status} — endpoint may be unprotected!`,
        });

        // Test 2: Invalid auth
        const invalidHeaders: Record<string, string> = {};
        switch (authType) {
          case 'bearer':
            invalidHeaders['Authorization'] = 'Bearer invalid_token_xyz123';
            break;
          case 'basic':
            invalidHeaders['Authorization'] = 'Basic ' + Buffer.from('invalid:invalid').toString('base64');
            break;
          case 'api_key':
            invalidHeaders[creds.header_name || 'X-API-Key'] = 'invalid_key_xyz123';
            break;
        }
        const invalidAuth = await makeRequest(args.url, args.method || 'GET', invalidHeaders, undefined, args.timeout || 10000);
        testResults.push({
          test: 'invalid_auth',
          status: invalidAuth.status,
          passed: invalidAuth.status === 401 || invalidAuth.status === 403,
          message: (invalidAuth.status === 401 || invalidAuth.status === 403)
            ? 'Correctly rejects invalid credentials'
            : `Expected 401/403 but got ${invalidAuth.status} — weak authentication!`,
        });

        // Test 3: Valid auth (if credentials provided)
        if (creds.token || creds.username || creds.key) {
          const validHeaders: Record<string, string> = { ...(args.headers || {}) };
          switch (authType) {
            case 'bearer':
              validHeaders['Authorization'] = `Bearer ${creds.token}`;
              break;
            case 'basic':
              validHeaders['Authorization'] = 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
              break;
            case 'api_key':
              validHeaders[creds.header_name || 'X-API-Key'] = creds.key;
              break;
          }

          const validAuth = await makeRequest(args.url, args.method || 'GET', validHeaders, args.body, args.timeout || 10000);
          testResults.push({
            test: 'valid_auth',
            status: validAuth.status,
            passed: validAuth.status >= 200 && validAuth.status < 400,
            duration_ms: validAuth.duration_ms,
            message: validAuth.status >= 200 && validAuth.status < 400
              ? 'Correctly accepts valid credentials'
              : `Expected 2xx/3xx but got ${validAuth.status} — check credentials`,
          });
        }

        // Test 4: CORS preflight check
        const corsCheck = await makeRequest(args.url, 'OPTIONS', {
          'Origin': 'https://evil-site.com',
          'Access-Control-Request-Method': 'POST',
        }, undefined, 5000);

        const allowOrigin = corsCheck.headers['access-control-allow-origin'];
        testResults.push({
          test: 'cors_check',
          status: corsCheck.status,
          allow_origin: allowOrigin || 'none',
          passed: allowOrigin !== '*',
          message: allowOrigin === '*'
            ? '⚠️ CORS allows all origins — potential security risk'
            : allowOrigin
            ? `CORS restricted to: ${allowOrigin}`
            : 'No CORS headers — API may not support browser access',
        });

        const passCount = testResults.filter(t => t.passed).length;

        return ok({
          auth_flow: {
            url: args.url,
            auth_type: authType,
            tests_run: testResults.length,
            tests_passed: passCount,
          },
          results: testResults,
          ai_analysis: {
            verdict: passCount === testResults.length
              ? '✅ Authentication flow looks secure'
              : `⚠️ ${testResults.length - passCount} auth tests failed — security concerns`,
            critical_issues: testResults.filter(t => !t.passed).map(t => t.message),
            hint: 'The no_auth and invalid_auth tests should fail with 401/403. The valid_auth test should succeed. Wildcard CORS is a security risk.',
          },
        });
      }

      // ═══════════════════════════════════
      // VALIDATE RESPONSE
      // ═══════════════════════════════════
      case 'validate_response': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');

        const result = await makeRequest(
          args.url,
          args.method || 'GET',
          args.headers || {},
          args.body,
          args.timeout || 10000,
        );

        if (result.error) return fail('REQUEST_ERROR', result.error);

        const checks: any[] = [];

        // Status check
        if (args.expected_status) {
          checks.push({
            check: 'status_code',
            expected: args.expected_status,
            actual: result.status,
            passed: result.status === args.expected_status,
          });
        }

        // Schema validation
        if (args.expected_schema) {
          const schemaErrors = validateSchema(result.body, args.expected_schema);
          checks.push({
            check: 'schema',
            passed: schemaErrors.length === 0,
            errors: schemaErrors.length > 0 ? schemaErrors.slice(0, 10) : undefined,
          });
        }

        // Response time check
        checks.push({
          check: 'response_time',
          duration_ms: result.duration_ms,
          passed: result.duration_ms < 3000,
          grade: result.duration_ms < 200 ? 'excellent' : result.duration_ms < 500 ? 'good' : result.duration_ms < 1000 ? 'acceptable' : result.duration_ms < 3000 ? 'slow' : 'critical',
        });

        // Content-Type check
        const contentType = result.headers['content-type'] || '';
        checks.push({
          check: 'content_type',
          value: contentType,
          is_json: contentType.includes('application/json'),
          passed: !!contentType,
        });

        // Security headers
        const securityHeaders = {
          'x-content-type-options': result.headers['x-content-type-options'] || null,
          'x-frame-options': result.headers['x-frame-options'] || null,
          'strict-transport-security': result.headers['strict-transport-security'] || null,
          'content-security-policy': result.headers['content-security-policy'] || null,
          'x-xss-protection': result.headers['x-xss-protection'] || null,
        };
        const missingSecHeaders = Object.entries(securityHeaders).filter(([, v]) => !v).map(([k]) => k);
        checks.push({
          check: 'security_headers',
          headers: securityHeaders,
          missing: missingSecHeaders,
          passed: missingSecHeaders.length <= 2,
        });

        const passCount = checks.filter(c => c.passed).length;

        return ok({
          validate_response: {
            url: args.url,
            method: args.method || 'GET',
            status: result.status,
            duration_ms: result.duration_ms,
            size_bytes: result.size_bytes,
            checks_passed: passCount,
            checks_total: checks.length,
          },
          checks,
          response_preview: typeof result.body === 'object'
            ? JSON.stringify(result.body, null, 2).substring(0, 500)
            : result.rawBody.substring(0, 500),
          ai_analysis: {
            verdict: passCount === checks.length
              ? '✅ All validation checks passed'
              : `⚠️ ${checks.length - passCount} checks failed`,
            hint: 'Focus on status_code and schema checks for correctness. Security headers protect against MITM and XSS attacks.',
          },
        });
      }

      // ═══════════════════════════════════
      // SEQUENCE TEST
      // ═══════════════════════════════════
      case 'sequence_test': {
        if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
          return fail('MISSING_PARAM', 'steps array is required with at least one step');
        }

        const context: Record<string, any> = {};
        const stepResults: any[] = [];
        let allPassed = true;

        for (let i = 0; i < args.steps.length; i++) {
          const step = args.steps[i];

          // Replace context variables in URL and body
          let url = step.url || args.url;
          let body = step.body;

          // Simple template replacement: {{variable}} → context[variable]
          if (url) {
            url = url.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => context[key] || '');
          }
          if (body && typeof body === 'object') {
            const bodyStr = JSON.stringify(body).replace(/"\{\{(\w+)\}\}"/g, (_: string, key: string) => {
              const val = context[key];
              return typeof val === 'string' ? `"${val}"` : JSON.stringify(val);
            });
            try { body = JSON.parse(bodyStr); } catch { /* keep original */ }
          }

          const result = await makeRequest(
            url,
            step.method || 'GET',
            { ...(args.headers || {}), ...(step.headers || {}) },
            body,
            args.timeout || 10000,
          );

          const stepResult: any = {
            step: i + 1,
            name: step.name || `Step ${i + 1}`,
            method: step.method || 'GET',
            url: url?.substring(0, 100),
            status: result.status,
            duration_ms: result.duration_ms,
            passed: true,
          };

          // Extract values for subsequent steps
          if (step.extract && typeof result.body === 'object') {
            for (const [varName, jsonPath] of Object.entries(step.extract)) {
              const path = (jsonPath as string).split('.');
              let value = result.body;
              for (const key of path) {
                value = value?.[key];
              }
              context[varName] = value;
              stepResult.extracted = { ...stepResult.extracted, [varName]: value };
            }
          }

          // Assert conditions
          if (step.assert) {
            const assertResults: any[] = [];
            if (step.assert.status && result.status !== step.assert.status) {
              assertResults.push({ check: 'status', expected: step.assert.status, actual: result.status, passed: false });
              stepResult.passed = false;
              allPassed = false;
            } else if (step.assert.status) {
              assertResults.push({ check: 'status', expected: step.assert.status, actual: result.status, passed: true });
            }

            if (step.assert.body_contains && !result.rawBody.includes(step.assert.body_contains)) {
              assertResults.push({ check: 'body_contains', expected: step.assert.body_contains, passed: false });
              stepResult.passed = false;
              allPassed = false;
            }

            stepResult.assertions = assertResults;
          }

          stepResults.push(stepResult);

          // Stop on failure if configured
          if (!stepResult.passed && step.stop_on_fail !== false) {
            break;
          }
        }

        const passedSteps = stepResults.filter(s => s.passed).length;

        return ok({
          sequence_test: {
            total_steps: args.steps.length,
            executed: stepResults.length,
            passed: passedSteps,
            all_passed: allPassed,
            total_duration_ms: stepResults.reduce((sum, s) => sum + s.duration_ms, 0),
          },
          steps: stepResults,
          context,
          ai_analysis: {
            verdict: allPassed
              ? `✅ All ${stepResults.length} steps passed`
              : `❌ Failed at step ${stepResults.find(s => !s.passed)?.step}`,
            hint: 'Use extract to capture values (like auth tokens or IDs) from responses, then reference them in subsequent steps with {{variable}} syntax.',
          },
        });
      }

      // ═══════════════════════════════════
      // MOCK SERVER
      // ═══════════════════════════════════
      case 'mock_server': {
        // In-memory mock registry (no actual HTTP server needed for AI testing)
        const routes = args.mock_routes || [];
        if (routes.length === 0) return fail('MISSING_PARAM', 'mock_routes array is required');

        const mocks = routes.map((route: any, index: number) => ({
          id: index + 1,
          method: (route.method || 'GET').toUpperCase(),
          path: route.path || '/',
          status: route.status || 200,
          response: route.response || {},
          delay_ms: route.delay_ms || 0,
          headers: route.headers || { 'Content-Type': 'application/json' },
        }));

        return ok({
          mock_server: {
            routes_registered: mocks.length,
            message: 'Mock routes registered. Use these as reference responses for contract testing.',
          },
          routes: mocks,
          ai_analysis: {
            hint: 'These mock definitions can be used as expected responses in contract_test or sequence_test. In a real implementation, start an HTTP server with these routes.',
            usage: 'Pass expected_schema from mock response to contract_test to validate real API matches mock.',
          },
        });
      }

      // ═══════════════════════════════════
      // DIFF TEST
      // ═══════════════════════════════════
      case 'diff_test': {
        if (!args.url) return fail('MISSING_PARAM', 'url (primary) is required');
        if (!args.url_b) return fail('MISSING_PARAM', 'url_b (comparison) is required');

        const [resultA, resultB] = await Promise.all([
          makeRequest(args.url, args.method || 'GET', args.headers || {}, args.body, args.timeout || 10000),
          makeRequest(args.url_b, args.method || 'GET', args.headers || {}, args.body, args.timeout || 10000),
        ]);

        // Compare results
        const diffs: any[] = [];

        if (resultA.status !== resultB.status) {
          diffs.push({ field: 'status', a: resultA.status, b: resultB.status });
        }

        // Compare response structure (keys)
        if (typeof resultA.body === 'object' && typeof resultB.body === 'object') {
          const keysA = new Set(Object.keys(resultA.body || {}));
          const keysB = new Set(Object.keys(resultB.body || {}));
          const onlyInA = [...keysA].filter(k => !keysB.has(k));
          const onlyInB = [...keysB].filter(k => !keysA.has(k));

          if (onlyInA.length > 0) diffs.push({ field: 'response_keys', only_in_a: onlyInA });
          if (onlyInB.length > 0) diffs.push({ field: 'response_keys', only_in_b: onlyInB });

          // Compare value types
          for (const key of [...keysA].filter(k => keysB.has(k))) {
            const typeA = typeof resultA.body[key];
            const typeB = typeof resultB.body[key];
            if (typeA !== typeB) {
              diffs.push({ field: `response.${key}`, type_a: typeA, type_b: typeB });
            }
          }
        }

        // Compare headers
        const headerDiffs: any[] = [];
        const importantHeaders = ['content-type', 'cache-control', 'content-encoding'];
        for (const h of importantHeaders) {
          if (resultA.headers[h] !== resultB.headers[h]) {
            headerDiffs.push({ header: h, a: resultA.headers[h] || 'missing', b: resultB.headers[h] || 'missing' });
          }
        }

        return ok({
          diff_test: {
            url_a: args.url,
            url_b: args.url_b,
            method: args.method || 'GET',
            identical: diffs.length === 0 && headerDiffs.length === 0,
            differences: diffs.length + headerDiffs.length,
            timing: {
              a_ms: resultA.duration_ms,
              b_ms: resultB.duration_ms,
              diff_ms: Math.abs(resultA.duration_ms - resultB.duration_ms),
            },
            size: {
              a_bytes: resultA.size_bytes,
              b_bytes: resultB.size_bytes,
            },
          },
          response_diffs: diffs.length > 0 ? diffs : undefined,
          header_diffs: headerDiffs.length > 0 ? headerDiffs : undefined,
          ai_analysis: {
            verdict: diffs.length === 0 && headerDiffs.length === 0
              ? '✅ Responses are structurally identical'
              : `⚠️ ${diffs.length + headerDiffs.length} differences found between environments`,
            breaking_changes: diffs.filter(d => d.field === 'status' || d.field === 'response_keys'),
            performance_comparison: resultA.duration_ms > resultB.duration_ms * 2
              ? `URL A is ${Math.round(resultA.duration_ms / resultB.duration_ms)}x slower than URL B`
              : resultB.duration_ms > resultA.duration_ms * 2
              ? `URL B is ${Math.round(resultB.duration_ms / resultA.duration_ms)}x slower than URL A`
              : 'Performance is comparable',
            hint: 'Use diff_test to compare staging vs production, or before/after API changes.',
          },
        });
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}. Valid: discover_endpoints, contract_test, load_test, auth_flow, validate_response, sequence_test, mock_server, diff_test`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - start;
    logAudit('api_testing', `${args.action || 'unknown'}: Error after ${elapsed}ms: ${error.message}`, false, 'API_TESTING_ERROR', elapsed);
    return fail('API_TESTING_ERROR', `${args.action} failed: ${error.message}`);
  }
}
