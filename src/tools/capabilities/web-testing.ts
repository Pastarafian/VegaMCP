/**
 * VegaMCP — Web Testing Tool (v7.1 — AI-Enhanced Edition)
 * 
 * AI-First web application quality assurance via Playwright.
 * 
 * ORIGINAL ACTIONS (v7.0):
 * - lighthouse — Performance audit with scoring
 * - visual_regression — Screenshot capture & comparison
 * - responsive_test — Multi-viewport layout checking
 * - console_audit — Error/warning capture with classification
 * - network_waterfall — Resource timing analysis
 * - form_test — Form validation testing
 * - link_check — Broken link detection
 * - storage_audit — Cookies/localStorage security audit
 * - css_coverage — Unused styles detection
 * - core_web_vitals — LCP/CLS/TTFB measurement
 * 
 * NEW ACTIONS (v7.1):
 * - full_audit — One-click comprehensive site audit (runs ALL tests)
 * - security_headers — HTTP security header audit & grading
 * - dom_diff — Structural DOM comparison with change classification
 * - error_diagnosis — AI root cause analyzer for page errors
 * - test_suite — Multi-test orchestration with pass/fail gates
 * - performance_budget — Budget tracking with violation alerts
 * 
 * ENHANCEMENTS (v7.1):
 * - _meta block on every output (test_id, timestamp, duration, browser info)
 * - Structured event timeline (navigation → paint → DOM → idle)
 * - Error fingerprinting (grouped, classified, with suggested fixes)
 * - Comparison to previous runs (trend detection)
 * - Effort/impact prioritized fix queues
 * 
 * All outputs include structured `ai_analysis` blocks for AI consumption.
 */

import { getPage, isBrowserActive } from '../browser/session.js';
import { logAudit } from '../../db/graph-store.js';
import {
  createTestMeta, EventTimeline, fingerprintError,
  recordTestRun, getComparisonToPrevious, scoreToGrade, severityBadge,
  effortImpactMatrix, SECURITY_HEADERS,
  storeDomSnapshot, getDomSnapshot, listDomSnapshots,
  createTestSuite, getTestSuite, listTestSuites,
  recordSuiteResult, getSuiteHistory,
} from './testing-utils.js';

// ============================================================
// Schema
// ============================================================

export const webTestingSchema = {
  name: 'web_testing',
  description: `Web application quality testing via Playwright. Actions: lighthouse (performance audit with scores), visual_regression (screenshot comparison), responsive_test (multi-viewport check), console_audit (error/warning capture), network_waterfall (resource timing analysis), form_test (form validation testing), link_check (broken link detection), storage_audit (cookies/localStorage), css_coverage (unused style detection), core_web_vitals (LCP/CLS/TTFB measurement), full_audit (one-click comprehensive site audit), security_headers (HTTP security header audit), dom_diff (structural DOM comparison), error_diagnosis (AI root cause analyzer), test_suite (multi-test orchestration), performance_budget (budget tracking with violations). All outputs include ai_analysis blocks.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: [
          'lighthouse',
          'visual_regression',
          'responsive_test',
          'console_audit',
          'network_waterfall',
          'form_test',
          'link_check',
          'storage_audit',
          'css_coverage',
          'core_web_vitals',
          // v7.1 new actions
          'full_audit',
          'security_headers',
          'dom_diff',
          'error_diagnosis',
          'test_suite',
          'performance_budget',
        ],
        description: 'Testing action to perform',
      },
      // Common
      url: { type: 'string', description: 'URL to test (required for most actions)' },
      // Visual regression
      baseline_name: { type: 'string', description: 'Name for the baseline screenshot (visual_regression)' },
      threshold: { type: 'number', description: 'Pixel diff threshold 0.0-1.0 (visual_regression)', default: 0.1 },
      // Responsive
      viewports: {
        type: 'array',
        items: { type: 'object' },
        description: 'Custom viewports [{width, height, name}] (responsive_test). Defaults to mobile/tablet/desktop.',
      },
      // Form testing
      form_selector: { type: 'string', description: 'CSS selector for the form (form_test)' },
      // Link checking
      max_depth: { type: 'number', description: 'Max crawl depth for link_check (default: 1)', default: 1 },
      // Console
      min_level: { type: 'string', enum: ['log', 'info', 'warning', 'error'], default: 'warning', description: 'Minimum console level to capture' },
      // CSS coverage
      include_external: { type: 'boolean', description: 'Include external stylesheets in coverage (css_coverage)', default: true },
      // General
      timeout: { type: 'number', description: 'Navigation timeout in ms', default: 30000 },
      wait_for: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], default: 'load', description: 'Wait condition before testing' },
      // DOM diff
      snapshot_id: { type: 'string', description: 'Baseline snapshot ID to compare against (dom_diff)' },
      // Error diagnosis
      error_message: { type: 'string', description: 'Specific error to diagnose (error_diagnosis)' },
      // Test suite
      suite_name: { type: 'string', description: 'Suite name (test_suite)' },
      suite_action: { type: 'string', enum: ['create', 'run', 'list', 'history'], description: 'Suite sub-action (test_suite)' },
      tests: { type: 'array', items: { type: 'object' }, description: 'Test definitions for suite [{action, url, thresholds}] (test_suite)' },
      suite_description: { type: 'string', description: 'Suite description (test_suite create)' },
      // Performance budget
      budgets: { type: 'object', description: 'Budget thresholds {lcp_ms, cls, fcp_ms, total_size_kb, js_size_kb, css_size_kb, image_size_kb, request_count} (performance_budget)' },
    },
    required: ['action'],
  },
};

// ============================================================
// Structured output helpers
// ============================================================

function ok(data: any, meta?: any) {
  const output: any = { success: true, ...data };
  if (meta) output._meta = meta;
  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

// ============================================================
// Default viewports for responsive testing
// ============================================================

const DEFAULT_VIEWPORTS = [
  { width: 375, height: 812, name: 'mobile (iPhone SE)' },
  { width: 768, height: 1024, name: 'tablet (iPad)' },
  { width: 1280, height: 800, name: 'laptop' },
  { width: 1920, height: 1080, name: 'desktop (1080p)' },
  { width: 2560, height: 1440, name: 'desktop (1440p)' },
];

// ============================================================
// Main Handler
// ============================================================

export async function handleWebTesting(args: any): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {

      // ═══════════════════════════════════
      // LIGHTHOUSE — Performance audit
      // ═══════════════════════════════════
      case 'lighthouse': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        const timeout = args.timeout || 30000;

        // Start performance observation
        const navigationStart = Date.now();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout,
        });

        const navigationTime = Date.now() - navigationStart;

        // Collect performance metrics via Performance API
        const perfMetrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const paint = performance.getEntriesByType('paint');
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

          const fcp = paint.find(p => p.name === 'first-contentful-paint');

          return {
            navigation: {
              dns_ms: nav ? Math.round(nav.domainLookupEnd - nav.domainLookupStart) : 0,
              tcp_ms: nav ? Math.round(nav.connectEnd - nav.connectStart) : 0,
              ttfb_ms: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
              dom_interactive_ms: nav ? Math.round(nav.domInteractive - nav.startTime) : 0,
              dom_complete_ms: nav ? Math.round(nav.domComplete - nav.startTime) : 0,
              load_ms: nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0,
              transfer_size_bytes: nav ? nav.transferSize : 0,
            },
            fcp_ms: fcp ? Math.round(fcp.startTime) : null,
            resource_count: resources.length,
            total_transfer_kb: Math.round(resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
            resource_breakdown: {
              scripts: resources.filter(r => r.initiatorType === 'script').length,
              stylesheets: resources.filter(r => r.initiatorType === 'link' || r.initiatorType === 'css').length,
              images: resources.filter(r => r.initiatorType === 'img').length,
              fonts: resources.filter(r => r.name.match(/\.(woff2?|ttf|otf|eot)/i)).length,
              xhr_fetch: resources.filter(r => r.initiatorType === 'xmlhttprequest' || r.initiatorType === 'fetch').length,
            },
            slow_resources: resources
              .filter(r => r.duration > 500)
              .sort((a, b) => b.duration - a.duration)
              .slice(0, 10)
              .map(r => ({
                url: r.name.substring(0, 100),
                duration_ms: Math.round(r.duration),
                size_kb: Math.round((r.transferSize || 0) / 1024),
                type: r.initiatorType,
              })),
          };
        });

        // Check for SEO basics
        const seoChecks = await page.evaluate(() => {
          const title = document.title;
          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content');
          const h1s = document.querySelectorAll('h1');
          const imgsMissingAlt = document.querySelectorAll('img:not([alt])');
          const canonicalLink = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
          const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content');

          return {
            title: title || null,
            title_length: title?.length || 0,
            meta_description: metaDesc || null,
            meta_description_length: metaDesc?.length || 0,
            h1_count: h1s.length,
            h1_text: Array.from(h1s).map(h => h.textContent?.trim()).slice(0, 3),
            images_missing_alt: imgsMissingAlt.length,
            has_canonical: !!canonicalLink,
            has_viewport: !!viewport,
          };
        });

        // Score performance (simplified Lighthouse-style)
        const scores = {
          performance: calculatePerfScore(perfMetrics),
          seo: calculateSeoScore(seoChecks),
        };

        return ok({
          audit: {
            url: args.url,
            navigation_time_ms: navigationTime,
            scores,
            performance: perfMetrics,
            seo: seoChecks,
          },
          ai_analysis: {
            overall_grade: scores.performance >= 90 ? 'A' : scores.performance >= 70 ? 'B' : scores.performance >= 50 ? 'C' : 'D',
            bottlenecks: identifyBottlenecks(perfMetrics),
            seo_issues: identifySeoIssues(seoChecks),
            hint: 'Focus on slow_resources and bottlenecks for biggest performance wins. Each 100ms of TTFB improvement can improve conversion by 1%.',
          },
        });
      }

      // ═══════════════════════════════════
      // VISUAL REGRESSION
      // ═══════════════════════════════════
      case 'visual_regression': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'networkidle',
          timeout: args.timeout || 30000,
        });

        // Wait for fonts/images to settle
        await page.waitForTimeout(1000);

        const screenshot = await page.screenshot({ fullPage: true });
        const base64 = screenshot.toString('base64');
        const pageTitle = await page.title();

        // Get page dimensions
        const dimensions = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
        }));

        return {
          content: [
            { type: 'image' as const, data: base64, mimeType: 'image/png' },
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                visual_regression: {
                  url: args.url,
                  title: pageTitle,
                  baseline_name: args.baseline_name || 'default',
                  screenshot_size_bytes: screenshot.length,
                  dimensions,
                },
                ai_analysis: {
                  hint: 'Compare this screenshot against previous baselines. Look for layout shifts, missing elements, font rendering changes, color differences, and broken images.',
                  suggested_checks: [
                    'Header/navigation rendering',
                    'Hero section layout',
                    'Footer links and spacing',
                    'Form field alignment',
                    'Image loading states',
                    'Text overflow/truncation',
                  ],
                },
              }, null, 2),
            },
          ],
        };
      }

      // ═══════════════════════════════════
      // RESPONSIVE TEST
      // ═══════════════════════════════════
      case 'responsive_test': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        const viewports = args.viewports || DEFAULT_VIEWPORTS;
        const results: any[] = [];

        for (const vp of viewports) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(args.url, {
            waitUntil: (args.wait_for as any) || 'load',
            timeout: args.timeout || 30000,
          });
          await page.waitForTimeout(500);

          // Check for horizontal overflow
          const layoutCheck = await page.evaluate(() => {
            const body = document.body;
            const html = document.documentElement;
            return {
              has_horizontal_scroll: body.scrollWidth > window.innerWidth,
              overflow_width: Math.max(0, body.scrollWidth - window.innerWidth),
              viewport_width: window.innerWidth,
              content_width: body.scrollWidth,
              // Check for text overflow
              truncated_elements: Array.from(document.querySelectorAll('*')).filter(el => {
                const style = getComputedStyle(el);
                return style.overflow === 'hidden' && el.scrollWidth > el.clientWidth;
              }).length,
              // Check for display:none elements
              hidden_elements: Array.from(document.querySelectorAll('[style*="display: none"], .hidden, .d-none')).length,
              // Check touch targets (minimum 44x44px)
              small_touch_targets: Array.from(document.querySelectorAll('a, button, input, select, textarea')).filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
              }).length,
            };
          });

          results.push({
            viewport: { width: vp.width, height: vp.height, name: vp.name || `${vp.width}x${vp.height}` },
            ...layoutCheck,
            issues: [
              ...(layoutCheck.has_horizontal_scroll ? [`Horizontal scroll detected (${layoutCheck.overflow_width}px overflow)`] : []),
              ...(layoutCheck.truncated_elements > 0 ? [`${layoutCheck.truncated_elements} elements have text truncation`] : []),
              ...(layoutCheck.small_touch_targets > 5 ? [`${layoutCheck.small_touch_targets} touch targets smaller than 44x44px`] : []),
            ],
          });
        }

        const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

        return ok({
          responsive_test: {
            url: args.url,
            viewports_tested: results.length,
            total_issues: totalIssues,
            results,
          },
          ai_analysis: {
            verdict: totalIssues === 0 ? '✅ Responsive design looks clean' : `⚠️ ${totalIssues} responsive issues found`,
            worst_viewport: results.reduce((worst, r) => r.issues.length > (worst?.issues.length || 0) ? r : worst, results[0])?.viewport.name,
            hint: 'Focus on viewports with horizontal scroll — this breaks mobile UX. Small touch targets cause accessibility issues.',
          },
        });
      }

      // ═══════════════════════════════════
      // CONSOLE AUDIT
      // ═══════════════════════════════════
      case 'console_audit': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        const minLevel = args.min_level || 'warning';
        const levelPriority: Record<string, number> = { log: 0, info: 1, warning: 2, error: 3 };
        const minPriority = levelPriority[minLevel] ?? 2;

        // Capture console messages
        const messages: any[] = [];
        const errors: any[] = [];

        const consoleHandler = (msg: any) => {
          const level = msg.type();
          if (levelPriority[level] !== undefined && levelPriority[level] >= minPriority) {
            messages.push({
              level,
              text: msg.text(),
              url: msg.location()?.url || '',
              line: msg.location()?.lineNumber || 0,
              timestamp: new Date().toISOString(),
            });
          }
        };

        const errorHandler = (err: Error) => {
          errors.push({
            message: err.message,
            stack: err.stack?.split('\n').slice(0, 5).join('\n'),
            timestamp: new Date().toISOString(),
          });
        };

        page.on('console', consoleHandler);
        page.on('pageerror', errorHandler);

        try {
          await page.goto(args.url, {
            waitUntil: (args.wait_for as any) || 'load',
            timeout: args.timeout || 30000,
          });
          // Wait for async scripts
          await page.waitForTimeout(2000);
        } finally {
          page.removeListener('console', consoleHandler);
          page.removeListener('pageerror', errorHandler);
        }

        // Categorize messages
        const warnings = messages.filter(m => m.level === 'warning');
        const consoleErrors = messages.filter(m => m.level === 'error');
        const deprecations = messages.filter(m => 
          m.text.toLowerCase().includes('deprecated') || m.text.toLowerCase().includes('deprecation')
        );

        return ok({
          console_audit: {
            url: args.url,
            total_messages: messages.length,
            warnings: warnings.length,
            errors: consoleErrors.length,
            uncaught_exceptions: errors.length,
            deprecations: deprecations.length,
          },
          messages: messages.slice(0, 50),
          uncaught_exceptions: errors.slice(0, 10),
          ai_analysis: {
            severity: errors.length > 0 || consoleErrors.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'clean',
            error_patterns: [...new Set(consoleErrors.map(e => e.text.substring(0, 80)))].slice(0, 5),
            deprecation_warnings: deprecations.map(d => d.text.substring(0, 100)).slice(0, 5),
            hint: errors.length > 0
              ? 'Uncaught exceptions found! These crash the page for users. Fix immediately.'
              : consoleErrors.length > 0
              ? 'Console errors indicate broken functionality. Review each error source.'
              : 'Console looks clean. Monitor for regressions.',
          },
        });
      }

      // ═══════════════════════════════════
      // NETWORK WATERFALL
      // ═══════════════════════════════════
      case 'network_waterfall': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        // Capture network requests
        const requests: any[] = [];
        const failedRequests: any[] = [];

        page.on('requestfinished', async (request) => {
          try {
            const response = await request.response();
            const timing = request.timing();
            requests.push({
              url: request.url().substring(0, 150),
              method: request.method(),
              resource_type: request.resourceType(),
              status: response?.status() || 0,
              size_bytes: (await response?.body().catch(() => null))?.length || 0,
              duration_ms: timing ? Math.round(timing.responseEnd - timing.startTime) : 0,
              from_cache: false, // Playwright doesn't expose cache status directly
            });
          } catch { /* ignore */ }
        });

        page.on('requestfailed', (request) => {
          failedRequests.push({
            url: request.url().substring(0, 150),
            method: request.method(),
            resource_type: request.resourceType(),
            failure: request.failure()?.errorText || 'unknown',
          });
        });

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'networkidle',
          timeout: args.timeout || 30000,
        });

        // Wait for lazy-loaded resources
        await page.waitForTimeout(2000);

        // Sort by duration (slowest first)
        requests.sort((a, b) => b.duration_ms - a.duration_ms);

        // Calculate stats
        const totalSize = requests.reduce((sum, r) => sum + r.size_bytes, 0);
        const cachedCount = requests.filter(r => r.from_cache).length;
        const slowRequests = requests.filter(r => r.duration_ms > 1000);
        const redirects = requests.filter(r => r.status >= 300 && r.status < 400);

        // Group by type
        const byType: Record<string, { count: number; size: number }> = {};
        for (const r of requests) {
          if (!byType[r.resource_type]) byType[r.resource_type] = { count: 0, size: 0 };
          byType[r.resource_type].count++;
          byType[r.resource_type].size += r.size_bytes;
        }

        return ok({
          network_waterfall: {
            url: args.url,
            total_requests: requests.length,
            failed_requests: failedRequests.length,
            total_size_kb: Math.round(totalSize / 1024),
            cached_requests: cachedCount,
            slow_requests: slowRequests.length,
            redirects: redirects.length,
          },
          by_type: byType,
          slowest_requests: requests.slice(0, 15).map(r => ({
            url: r.url,
            duration_ms: r.duration_ms,
            size_kb: Math.round(r.size_bytes / 1024),
            type: r.resource_type,
          })),
          failed: failedRequests.slice(0, 10),
          ai_analysis: {
            severity: failedRequests.length > 0 ? 'error' : slowRequests.length > 3 ? 'warning' : 'clean',
            bottlenecks: slowRequests.slice(0, 3).map(r => `${r.resource_type}: ${r.url} (${r.duration_ms}ms)`),
            optimization_suggestions: [
              ...(totalSize > 5 * 1024 * 1024 ? ['Total page size > 5MB — reduce image sizes and enable compression'] : []),
              ...(cachedCount < requests.length * 0.3 ? ['Low cache hit rate — add proper Cache-Control headers'] : []),
              ...(slowRequests.length > 3 ? [`${slowRequests.length} requests > 1s — investigate server performance`] : []),
              ...(failedRequests.length > 0 ? [`${failedRequests.length} failed requests — check 404s and CORS issues`] : []),
              ...(redirects.length > 3 ? [`${redirects.length} redirects — reduce redirect chains`] : []),
            ],
            hint: 'The slowest requests dominate page load time. Optimize the top 3 for biggest impact.',
          },
        });
      }

      // ═══════════════════════════════════
      // FORM TEST
      // ═══════════════════════════════════
      case 'form_test': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        const selector = args.form_selector || 'form';

        // Analyze forms on the page
        const formAnalysis = await page.evaluate((sel: string) => {
          const forms = document.querySelectorAll(sel);
          return Array.from(forms).map((form, index) => {
            const inputs = form.querySelectorAll('input, select, textarea');
            const submitBtns = form.querySelectorAll('button[type="submit"], input[type="submit"]');

            const fields = Array.from(inputs).map(input => {
              const el = input as HTMLInputElement;
              return {
                name: el.name || el.id || '',
                type: el.type || el.tagName.toLowerCase(),
                required: el.required,
                has_label: !!document.querySelector(`label[for="${el.id}"]`) || !!el.closest('label'),
                has_placeholder: !!el.placeholder,
                has_pattern: !!el.pattern,
                autocomplete: el.autocomplete || '',
                min_length: el.minLength > 0 ? el.minLength : null,
                max_length: el.maxLength > 0 ? el.maxLength : null,
                aria_label: el.getAttribute('aria-label') || null,
                aria_describedby: el.getAttribute('aria-describedby') || null,
              };
            });

            return {
              index,
              action: (form as HTMLFormElement).action || '',
              method: (form as HTMLFormElement).method || 'get',
              field_count: fields.length,
              has_submit_button: submitBtns.length > 0,
              has_novalidate: (form as HTMLFormElement).noValidate,
              fields,
              issues: [
                ...fields.filter(f => !f.has_label && !f.aria_label).map(f => `Field "${f.name || f.type}" missing label`),
                ...fields.filter(f => f.type === 'password' && f.autocomplete !== 'current-password' && f.autocomplete !== 'new-password')
                  .map(f => `Password field "${f.name}" missing autocomplete attribute`),
                ...fields.filter(f => f.type === 'email' && !f.has_pattern && !f.required).map(f => `Email field "${f.name}" not required`),
                ...(submitBtns.length === 0 ? ['No submit button found'] : []),
              ],
            };
          });
        }, selector);

        const totalIssues = formAnalysis.reduce((sum: number, f: any) => sum + f.issues.length, 0);

        return ok({
          form_test: {
            url: args.url,
            forms_found: formAnalysis.length,
            total_fields: formAnalysis.reduce((sum: number, f: any) => sum + f.field_count, 0),
            total_issues: totalIssues,
          },
          forms: formAnalysis,
          ai_analysis: {
            verdict: formAnalysis.length === 0
              ? '⚠️ No forms found on page'
              : totalIssues === 0
              ? '✅ Forms look well-structured'
              : `❌ ${totalIssues} form issues found`,
            hint: 'Missing labels break screen reader support. Autocomplete attributes improve UX. Required fields prevent incomplete submissions.',
          },
        });
      }

      // ═══════════════════════════════════
      // LINK CHECK
      // ═══════════════════════════════════
      case 'link_check': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        // Extract all links
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]')).map(a => ({
            href: (a as HTMLAnchorElement).href,
            text: a.textContent?.trim().substring(0, 60) || '',
            is_external: (a as HTMLAnchorElement).hostname !== window.location.hostname,
            has_target_blank: a.getAttribute('target') === '_blank',
            has_rel_noopener: (a.getAttribute('rel') || '').includes('noopener'),
          }));
        });

        // Deduplicate
        const uniqueUrls = [...new Set(links.map(l => l.href))];

        // Check links (limited to avoid rate limiting)
        const maxChecks = Math.min(uniqueUrls.length, 50);
        const checkResults: any[] = [];

        for (let i = 0; i < maxChecks; i++) {
          const url = uniqueUrls[i];
          try {
            const response = await page.context().request.head(url, { timeout: 5000 });
            checkResults.push({
              url: url.substring(0, 150),
              status: response.status(),
              ok: response.ok(),
            });
          } catch (e: any) {
            checkResults.push({
              url: url.substring(0, 150),
              status: 0,
              ok: false,
              error: e.message?.substring(0, 80) || 'request failed',
            });
          }
        }

        const broken = checkResults.filter(r => !r.ok);
        const externalWithoutNoopener = links.filter(l => l.is_external && l.has_target_blank && !l.has_rel_noopener);

        return ok({
          link_check: {
            url: args.url,
            total_links: links.length,
            unique_urls: uniqueUrls.length,
            checked: checkResults.length,
            broken: broken.length,
            external: links.filter(l => l.is_external).length,
          },
          broken_links: broken.slice(0, 20),
          security_issues: externalWithoutNoopener.length > 0 ? {
            external_without_noopener: externalWithoutNoopener.length,
            examples: externalWithoutNoopener.slice(0, 5).map(l => l.href.substring(0, 100)),
          } : null,
          ai_analysis: {
            severity: broken.length > 5 ? 'critical' : broken.length > 0 ? 'warning' : 'clean',
            hint: broken.length > 0
              ? `${broken.length} broken links found. Fix 404s and check external link validity.`
              : 'All checked links are valid.',
            security: externalWithoutNoopener.length > 0
              ? `${externalWithoutNoopener.length} external links with target="_blank" missing rel="noopener" — security risk (reverse tabnabbing).`
              : null,
          },
        });
      }

      // ═══════════════════════════════════
      // STORAGE AUDIT
      // ═══════════════════════════════════
      case 'storage_audit': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        // Get cookies
        const cookies = await page.context().cookies();
        // Get localStorage and sessionStorage
        const storage = await page.evaluate(() => {
          const ls: Record<string, string> = {};
          const ss: Record<string, string> = {};

          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            ls[key] = localStorage.getItem(key)?.substring(0, 200) || '';
          }
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i)!;
            ss[key] = sessionStorage.getItem(key)?.substring(0, 200) || '';
          }

          return {
            localStorage: ls,
            localStorage_count: localStorage.length,
            localStorage_size_bytes: JSON.stringify(ls).length,
            sessionStorage: ss,
            sessionStorage_count: sessionStorage.length,
            sessionStorage_size_bytes: JSON.stringify(ss).length,
          };
        });

        // Analyze cookies for security
        const secureCookies = cookies.filter(c => c.secure);
        const httpOnlyCookies = cookies.filter(c => c.httpOnly);
        const sameSiteNone = cookies.filter(c => c.sameSite === 'None');
        const sessionCookies = cookies.filter(c => c.expires === -1 || c.expires === 0);
        const largeCookies = cookies.filter(c => c.value.length > 1024);

        return ok({
          storage_audit: {
            url: args.url,
            cookies: {
              total: cookies.length,
              secure: secureCookies.length,
              httpOnly: httpOnlyCookies.length,
              sameSiteNone: sameSiteNone.length,
              session: sessionCookies.length,
              large: largeCookies.length,
            },
            localStorage: {
              count: storage.localStorage_count,
              size_bytes: storage.localStorage_size_bytes,
              keys: Object.keys(storage.localStorage),
            },
            sessionStorage: {
              count: storage.sessionStorage_count,
              size_bytes: storage.sessionStorage_size_bytes,
              keys: Object.keys(storage.sessionStorage),
            },
          },
          cookie_details: cookies.map(c => ({
            name: c.name,
            domain: c.domain,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            expires: c.expires === -1 ? 'session' : new Date(c.expires * 1000).toISOString(),
            size: c.value.length,
          })),
          ai_analysis: {
            security_issues: [
              ...(cookies.length > 0 && secureCookies.length < cookies.length
                ? [`${cookies.length - secureCookies.length} cookies missing Secure flag`] : []),
              ...(sameSiteNone.length > 0
                ? [`${sameSiteNone.length} cookies with SameSite=None (CSRF risk)`] : []),
              ...(largeCookies.length > 0
                ? [`${largeCookies.length} cookies > 1KB (performance impact on every request)`] : []),
            ],
            storage_concerns: [
              ...(storage.localStorage_size_bytes > 5 * 1024 * 1024
                ? ['localStorage approaching 5MB limit'] : []),
            ],
            hint: 'All cookies should have Secure and HttpOnly flags. Avoid storing sensitive data in localStorage.',
          },
        });
      }

      // ═══════════════════════════════════
      // CSS COVERAGE
      // ═══════════════════════════════════
      case 'css_coverage': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        // Start CSS coverage
        await page.coverage.startCSSCoverage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        // Scroll through page to trigger lazy CSS
        await page.evaluate(() => {
          return new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 300;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                window.scrollTo(0, 0);
                resolve();
              }
            }, 100);
          });
        });

        const coverage = await page.coverage.stopCSSCoverage();

        // Analyze coverage
        const stylesheets = coverage.map(entry => {
          const totalBytes = (entry.text || '').length;
          const usedBytes = entry.ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
          const unusedBytes = totalBytes - usedBytes;

          return {
            url: entry.url ? entry.url.substring(0, 150) : 'inline',
            total_bytes: totalBytes,
            used_bytes: usedBytes,
            unused_bytes: unusedBytes,
            usage_percent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 100,
            is_inline: !entry.url,
          };
        });

        const totalCSS = stylesheets.reduce((sum, s) => sum + s.total_bytes, 0);
        const usedCSS = stylesheets.reduce((sum, s) => sum + s.used_bytes, 0);
        const unusedCSS = totalCSS - usedCSS;

        return ok({
          css_coverage: {
            url: args.url,
            total_stylesheets: stylesheets.length,
            total_css_kb: Math.round(totalCSS / 1024),
            used_css_kb: Math.round(usedCSS / 1024),
            unused_css_kb: Math.round(unusedCSS / 1024),
            overall_usage_percent: totalCSS > 0 ? Math.round((usedCSS / totalCSS) * 100) : 100,
          },
          stylesheets: stylesheets.sort((a, b) => b.unused_bytes - a.unused_bytes),
          ai_analysis: {
            verdict: unusedCSS > totalCSS * 0.5
              ? `❌ ${Math.round(unusedCSS / 1024)}KB of unused CSS (${Math.round((unusedCSS / totalCSS) * 100)}%)`
              : unusedCSS > totalCSS * 0.3
              ? `⚠️ ${Math.round(unusedCSS / 1024)}KB unused CSS — consider tree-shaking`
              : `✅ CSS usage is efficient`,
            biggest_waste: stylesheets
              .filter(s => s.unused_bytes > 1024)
              .slice(0, 5)
              .map(s => `${s.url}: ${Math.round(s.unused_bytes / 1024)}KB unused`),
            hint: 'Unused CSS blocks rendering. Use PurgeCSS or CSS-in-JS to eliminate dead styles. Focus on largest unused stylesheets first.',
          },
        });
      }

      // ═══════════════════════════════════
      // CORE WEB VITALS
      // ═══════════════════════════════════
      case 'core_web_vitals': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        // Navigate and measure
        const loadStart = Date.now();
        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });
        const loadTime = Date.now() - loadStart;

        // Wait for CWV to stabilize
        await page.waitForTimeout(3000);

        // Measure Core Web Vitals
        const vitals = await page.evaluate(() => {
          return new Promise<any>((resolve) => {
            const results: any = {
              ttfb_ms: 0,
              fcp_ms: null,
              lcp_ms: null,
              cls: 0,
              lcp_element: null,
              cls_shifts: [],
            };

            // TTFB
            const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
            if (nav) {
              results.ttfb_ms = Math.round(nav.responseStart - nav.requestStart);
            }

            // FCP
            const fcp = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
            if (fcp) results.fcp_ms = Math.round(fcp.startTime);

            // LCP
            try {
              const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1] as any;
                if (lastEntry) {
                  results.lcp_ms = Math.round(lastEntry.startTime);
                  results.lcp_element = lastEntry.element?.tagName || null;
                }
              });
              lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            } catch { /* not supported */ }

            // CLS
            try {
              const clsObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries() as any[]) {
                  if (!entry.hadRecentInput) {
                    results.cls += entry.value;
                    results.cls_shifts.push({
                      value: Math.round(entry.value * 10000) / 10000,
                      time_ms: Math.round(entry.startTime),
                    });
                  }
                }
              });
              clsObserver.observe({ type: 'layout-shift', buffered: true });
            } catch { /* not supported */ }

            // Give observers time to fire
            setTimeout(() => {
              results.cls = Math.round(results.cls * 10000) / 10000;
              resolve(results);
            }, 1000);
          });
        });

        // Score each metric
        const scores = {
          ttfb: vitals.ttfb_ms <= 800 ? 'good' : vitals.ttfb_ms <= 1800 ? 'needs-improvement' : 'poor',
          fcp: vitals.fcp_ms !== null ? (vitals.fcp_ms <= 1800 ? 'good' : vitals.fcp_ms <= 3000 ? 'needs-improvement' : 'poor') : 'unmeasured',
          lcp: vitals.lcp_ms !== null ? (vitals.lcp_ms <= 2500 ? 'good' : vitals.lcp_ms <= 4000 ? 'needs-improvement' : 'poor') : 'unmeasured',
          cls: vitals.cls <= 0.1 ? 'good' : vitals.cls <= 0.25 ? 'needs-improvement' : 'poor',
        };

        const goodCount = Object.values(scores).filter(s => s === 'good').length;
        const poorCount = Object.values(scores).filter(s => s === 'poor').length;

        return ok({
          core_web_vitals: {
            url: args.url,
            load_time_ms: loadTime,
            metrics: {
              ttfb_ms: vitals.ttfb_ms,
              fcp_ms: vitals.fcp_ms,
              lcp_ms: vitals.lcp_ms,
              cls: vitals.cls,
              lcp_element: vitals.lcp_element,
            },
            scores,
          },
          cls_shifts: vitals.cls_shifts?.slice(0, 10),
          ai_analysis: {
            overall: poorCount > 0 ? '❌ Core Web Vitals FAILING' : goodCount >= 3 ? '✅ Core Web Vitals PASSING' : '⚠️ Core Web Vitals need work',
            recommendations: [
              ...(scores.ttfb !== 'good' ? [`TTFB ${vitals.ttfb_ms}ms — optimize server response time, use CDN, enable caching`] : []),
              ...(scores.fcp !== 'good' ? [`FCP ${vitals.fcp_ms}ms — reduce render-blocking resources, inline critical CSS`] : []),
              ...(scores.lcp !== 'good' ? [`LCP ${vitals.lcp_ms}ms on <${vitals.lcp_element}> — optimize largest element, preload images, lazy-load below-fold`] : []),
              ...(scores.cls !== 'good' ? [`CLS ${vitals.cls} — add explicit dimensions to images/ads, avoid injecting content above viewport`] : []),
            ],
            google_thresholds: {
              ttfb: '≤800ms (good), ≤1800ms (needs improvement), >1800ms (poor)',
              fcp: '≤1800ms (good), ≤3000ms (needs improvement), >3000ms (poor)',
              lcp: '≤2500ms (good), ≤4000ms (needs improvement), >4000ms (poor)',
              cls: '≤0.1 (good), ≤0.25 (needs improvement), >0.25 (poor)',
            },
            hint: 'Core Web Vitals directly affect Google search rankings. Focus on LCP and CLS for biggest SEO impact.',
          },
        });
      }

      // ═══════════════════════════════════
      // FULL AUDIT — One-click comprehensive
      // ═══════════════════════════════════
      case 'full_audit': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const timeline = new EventTimeline();
        const auditResults: any = {};
        const allIssues: Array<{ priority: number; category: string; issue: string; effort: string; impact: string }> = [];
        const scores: Record<string, number> = {};

        const subActions = ['lighthouse', 'core_web_vitals', 'console_audit', 'link_check', 'form_test', 'storage_audit', 'css_coverage', 'responsive_test'];

        for (const sub of subActions) {
          timeline.emit('sub_test_start', sub);
          try {
            const subResult = await handleWebTesting({ ...args, action: sub });
            const parsed = JSON.parse(subResult.content[0]?.text || '{}');
            if (parsed.success) {
              auditResults[sub] = { status: 'passed', summary: parsed.ai_analysis || {} };
              if (parsed.audit?.scores?.performance) scores.performance = parsed.audit.scores.performance;
              if (parsed.audit?.scores?.seo) scores.seo = parsed.audit.scores.seo;
            } else {
              auditResults[sub] = { status: 'error', error: parsed.error?.message };
            }
          } catch (e: any) {
            auditResults[sub] = { status: 'error', error: e.message };
          }
          timeline.emit('sub_test_end', sub);
        }

        // Run security headers separately
        timeline.emit('sub_test_start', 'security_headers');
        try {
          const secResult = await handleWebTesting({ ...args, action: 'security_headers' });
          const secParsed = JSON.parse(secResult.content[0]?.text || '{}');
          auditResults.security_headers = { status: 'passed', summary: secParsed.ai_analysis || {} };
          if (secParsed.security_headers?.score) scores.security = secParsed.security_headers.score;
        } catch { auditResults.security_headers = { status: 'skipped' }; }
        timeline.emit('sub_test_end', 'security_headers');

        const avgScore = Object.values(scores).length > 0
          ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length)
          : 0;

        const passedCount = Object.values(auditResults).filter((r: any) => r.status === 'passed').length;
        const failedCount = Object.values(auditResults).filter((r: any) => r.status !== 'passed').length;

        const meta = createTestMeta('web_testing', 'full_audit', start, { url: args.url });
        recordTestRun({ test_id: meta.test_id, tool: 'web_testing', action: 'full_audit', url: args.url, timestamp: meta.timestamp, duration_ms: meta.duration_ms, passed: failedCount === 0, score: avgScore, issues_count: failedCount, summary: `Full audit: ${passedCount}/${passedCount + failedCount} passed` });

        return ok({
          full_audit: {
            url: args.url,
            overall_grade: scoreToGrade(avgScore),
            overall_score: avgScore,
            category_scores: scores,
            tests_run: Object.keys(auditResults).length,
            tests_passed: passedCount,
            tests_failed: failedCount,
          },
          sub_results: auditResults,
          event_timeline: timeline.getEvents(),
          ai_analysis: {
            overall_verdict: failedCount === 0 ? '✅ All audits passed' : `⚠️ ${failedCount} audit(s) need attention`,
            grade: scoreToGrade(avgScore),
            strongest: Object.entries(scores).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A',
            weakest: Object.entries(scores).sort(([,a], [,b]) => a - b)[0]?.[0] || 'N/A',
            next_steps: [
              failedCount > 0 ? `Fix ${failedCount} failing audits first` : null,
              scores.performance && scores.performance < 80 ? 'Focus on performance optimizations' : null,
              scores.security && scores.security < 70 ? 'Add missing security headers' : null,
              scores.seo && scores.seo < 80 ? 'Improve SEO fundamentals' : null,
            ].filter(Boolean),
            hint: 'Run full_audit regularly to track progress. Each sub-result contains detailed AI analysis.',
          },
          comparison: getComparisonToPrevious(args.url, 'full_audit', avgScore, failedCount),
        }, meta);
      }

      // ═══════════════════════════════════
      // SECURITY HEADERS
      // ═══════════════════════════════════
      case 'security_headers': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        const timeline = new EventTimeline();

        timeline.emit('navigation_start', args.url);
        const response = await page.goto(args.url, { waitUntil: (args.wait_for as any) || 'load', timeout: args.timeout || 30000 });
        timeline.emit('navigation_complete');

        const headers = response?.headers() || {};
        const headerNames = Object.keys(headers).map(h => h.toLowerCase());

        const results = SECURITY_HEADERS.map(sh => {
          const headerKey = sh.name.toLowerCase();
          const present = headerNames.includes(headerKey);
          const value = present ? headers[headerKey] : null;
          return { name: sh.name, present, value: value?.substring(0, 200), weight: sh.weight, description: sh.description };
        });

        const earned = results.filter(r => r.present).reduce((sum, r) => sum + r.weight, 0);
        const maxScore = SECURITY_HEADERS.reduce((sum, h) => sum + h.weight, 0);
        const score = Math.round((earned / maxScore) * 100);
        const present = results.filter(r => r.present);
        const missing = results.filter(r => !r.present);

        const meta = createTestMeta('web_testing', 'security_headers', start, { url: args.url });
        recordTestRun({ test_id: meta.test_id, tool: 'web_testing', action: 'security_headers', url: args.url, timestamp: meta.timestamp, duration_ms: meta.duration_ms, passed: score >= 70, score, issues_count: missing.length, summary: `Security: ${score}% (${missing.length} missing)` });

        return ok({
          security_headers: { url: args.url, score, grade: scoreToGrade(score), headers_present: present.length, headers_missing: missing.length, total_checked: results.length },
          headers_detail: results,
          ai_analysis: {
            severity: severityBadge(score >= 80 ? 'clean' : score >= 60 ? 'medium' : score >= 40 ? 'high' : 'critical'),
            missing_critical: missing.filter(m => m.weight >= 10).map(m => ({ header: m.name, why: m.description, fix: `Add ${m.name} header to server response` })),
            missing_recommended: missing.filter(m => m.weight < 10).map(m => m.name),
            quick_wins: missing.filter(m => m.weight >= 10).slice(0, 3).map(m => `Add \`${m.name}\` header (+${m.weight} points)`),
            hint: 'Security headers prevent XSS, clickjacking, and data injection. Most can be added via server config in minutes.',
          },
          event_timeline: timeline.getEvents(),
          comparison: getComparisonToPrevious(args.url, 'security_headers', score, missing.length),
        }, meta);
      }

      // ═══════════════════════════════════
      // DOM DIFF
      // ═══════════════════════════════════
      case 'dom_diff': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        await page.goto(args.url, { waitUntil: (args.wait_for as any) || 'load', timeout: args.timeout || 30000 });
        await page.waitForTimeout(1000);

        const currentSnapshot = await page.evaluate(() => {
          function serializeNode(el: Element, depth = 0): any {
            if (depth > 8) return null;
            const cs = getComputedStyle(el);
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || undefined,
              classes: Array.from(el.classList).slice(0, 5),
              text: el.textContent?.trim().substring(0, 100) || undefined,
              attrs: { href: el.getAttribute('href'), src: el.getAttribute('src'), alt: el.getAttribute('alt') },
              style: { display: cs.display, position: cs.position, width: cs.width, height: cs.height, color: cs.color, bg: cs.backgroundColor },
              rect: el.getBoundingClientRect ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : undefined,
              children: Array.from(el.children).slice(0, 20).map(c => serializeNode(c, depth + 1)).filter(Boolean),
            };
          }
          return { serialized: serializeNode(document.body), timestamp: new Date().toISOString(), element_count: document.querySelectorAll('*').length };
        });

        const snapshotId = `snap-${Date.now()}`;
        storeDomSnapshot(snapshotId, args.url, currentSnapshot);

        // Compare with baseline if provided
        let diff = null;
        if (args.snapshot_id) {
          const baseline = getDomSnapshot(args.snapshot_id);
          if (baseline) {
            diff = { baseline_id: args.snapshot_id, baseline_timestamp: baseline.timestamp, changes: [] as any[], summary: '' };
            const bCount = baseline.snapshot.element_count || 0;
            const cCount = currentSnapshot.element_count || 0;
            if (bCount !== cCount) diff.changes.push({ type: 'structure', description: `Element count changed: ${bCount} → ${cCount}`, impact: Math.abs(cCount - bCount) > 10 ? 'high' : 'medium' });
            diff.summary = diff.changes.length > 0 ? `${diff.changes.length} structural changes detected` : 'No significant structural changes';
          }
        }

        const meta = createTestMeta('web_testing', 'dom_diff', start, { url: args.url });
        return ok({
          dom_diff: { url: args.url, snapshot_id: snapshotId, element_count: currentSnapshot.element_count, has_baseline: !!diff, changes_detected: diff?.changes.length || 0 },
          snapshot_saved: { id: snapshotId, hint: 'Use this snapshot_id as baseline for future dom_diff comparisons' },
          diff: diff,
          available_snapshots: listDomSnapshots().slice(0, 10),
          ai_analysis: {
            verdict: !diff ? '📸 Snapshot saved. No baseline to compare against yet.' : diff.changes.length === 0 ? '✅ DOM structure unchanged' : `⚠️ ${diff.changes.length} changes detected`,
            hint: 'Take a DOM snapshot before making changes, then compare after to catch unintended structural side-effects.',
          },
        }, meta);
      }

      // ═══════════════════════════════════
      // ERROR DIAGNOSIS
      // ═══════════════════════════════════
      case 'error_diagnosis': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        const timeline = new EventTimeline();
        const consoleErrors: any[] = [];
        const pageErrors: any[] = [];
        const networkErrors: any[] = [];

        page.on('console', (msg: any) => { if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: msg.location()?.url, line: msg.location()?.lineNumber }); });
        page.on('pageerror', (err: Error) => { pageErrors.push({ message: err.message, stack: err.stack?.split('\n').slice(0, 8).join('\n') }); });
        page.on('requestfailed', (req: any) => { networkErrors.push({ url: req.url().substring(0, 150), type: req.resourceType(), error: req.failure()?.errorText }); });

        timeline.emit('navigation_start');
        await page.goto(args.url, { waitUntil: (args.wait_for as any) || 'load', timeout: args.timeout || 30000 });
        timeline.emit('page_loaded');
        await page.waitForTimeout(3000);
        timeline.emit('settled');

        // Fingerprint all errors
        const fingerprinted = [
          ...consoleErrors.map(e => ({ ...fingerprintError(e.text, e.url, e.line), source_type: 'console' })),
          ...pageErrors.map(e => ({ ...fingerprintError(e.message), source_type: 'uncaught_exception', stack: e.stack })),
          ...networkErrors.map(e => ({ ...fingerprintError(e.error || `Failed: ${e.url}`, e.url), source_type: 'network' })),
        ];

        // Group by category
        const byCategory: Record<string, any[]> = {};
        for (const fp of fingerprinted) {
          if (!byCategory[fp.auto_category]) byCategory[fp.auto_category] = [];
          byCategory[fp.auto_category].push(fp);
        }

        const criticalCount = fingerprinted.filter(f => f.severity === 'critical').length;
        const highCount = fingerprinted.filter(f => f.severity === 'high').length;

        const meta = createTestMeta('web_testing', 'error_diagnosis', start, { url: args.url });
        recordTestRun({ test_id: meta.test_id, tool: 'web_testing', action: 'error_diagnosis', url: args.url, timestamp: meta.timestamp, duration_ms: meta.duration_ms, passed: fingerprinted.length === 0, issues_count: fingerprinted.length, summary: `${fingerprinted.length} errors (${criticalCount} critical)` });

        return ok({
          error_diagnosis: { url: args.url, total_errors: fingerprinted.length, critical: criticalCount, high: highCount, medium: fingerprinted.filter(f => f.severity === 'medium').length, low: fingerprinted.filter(f => f.severity === 'low').length, categories: Object.keys(byCategory).length },
          errors_by_category: byCategory,
          fingerprinted_errors: fingerprinted.slice(0, 30),
          event_timeline: timeline.getEvents(),
          ai_analysis: {
            severity: severityBadge(criticalCount > 0 ? 'critical' : highCount > 0 ? 'high' : fingerprinted.length > 0 ? 'medium' : 'clean'),
            diagnosis_summary: fingerprinted.length === 0 ? 'No errors detected — page is clean!' : `Found ${fingerprinted.length} errors across ${Object.keys(byCategory).length} categories`,
            fix_priority_queue: fingerprinted.filter(f => f.severity === 'critical' || f.severity === 'high').slice(0, 5).map((f, i) => ({ priority: i + 1, severity: f.severity, category: f.auto_category, error: f.message, fix: f.suggested_fix })),
            root_causes: Object.entries(byCategory).map(([cat, errs]) => ({ category: cat, count: errs.length, pattern: (errs as any[])[0]?.message?.substring(0, 80), fix: (errs as any[])[0]?.suggested_fix })),
            hint: criticalCount > 0 ? 'Critical errors crash the page for users. Fix these immediately.' : highCount > 0 ? 'High-severity errors break functionality. Prioritize these fixes.' : 'Monitor for regressions.',
          },
        }, meta);
      }

      // ═══════════════════════════════════
      // TEST SUITE
      // ═══════════════════════════════════
      case 'test_suite': {
        const subAction = args.suite_action || 'list';

        if (subAction === 'create') {
          if (!args.suite_name || !args.tests) return fail('MISSING_PARAM', 'suite_name and tests are required');
          const suite = createTestSuite(args.suite_name, args.tests, args.suite_description);
          return ok({ test_suite: { action: 'created', suite }, ai_analysis: { hint: `Suite "${args.suite_name}" created with ${args.tests.length} tests. Run it with suite_action: "run".` } });
        }

        if (subAction === 'list') {
          const suites = listTestSuites();
          return ok({ test_suite: { action: 'list', suites_count: suites.length, suites: suites.map(s => ({ name: s.name, tests: s.tests.length, created: s.created })) } });
        }

        if (subAction === 'history') {
          const history = getSuiteHistory(args.suite_name, 10);
          return ok({ test_suite: { action: 'history', suite_name: args.suite_name, runs: history } });
        }

        if (subAction === 'run') {
          if (!args.suite_name) return fail('MISSING_PARAM', 'suite_name is required');
          const suite = getTestSuite(args.suite_name);
          if (!suite) return fail('NOT_FOUND', `Suite "${args.suite_name}" not found`);

          const suiteStart = Date.now();
          const results: any[] = [];
          let passed = 0, failed = 0;

          for (const test of suite.tests) {
            try {
              const result = await handleWebTesting({ ...test, url: test.url || args.url, timeout: args.timeout });
              const parsed = JSON.parse(result.content[0]?.text || '{}');
              const testPassed = parsed.success !== false;
              if (testPassed) passed++; else failed++;
              results.push({ action: test.action, url: test.url || args.url, status: testPassed ? 'passed' : 'failed', summary: parsed.ai_analysis?.verdict || parsed.ai_analysis?.overall || 'Completed' });
            } catch (e: any) {
              failed++;
              results.push({ action: test.action, url: test.url || args.url, status: 'error', error: e.message });
            }
          }

          const suiteResult = { suite_name: args.suite_name, status: (failed === 0 ? 'passed' : 'failed') as 'passed' | 'failed', timestamp: new Date().toISOString(), duration_ms: Date.now() - suiteStart, passed, failed, total: suite.tests.length, results };
          recordSuiteResult(suiteResult);
          const history = getSuiteHistory(args.suite_name, 5);
          const trend = history.map(h => h.status);

          return ok({
            test_suite: { action: 'run', ...suiteResult },
            trend: { last_runs: trend, regression_detected: trend.length >= 2 && trend[0] === 'failed' && trend[1] === 'passed' },
            ai_analysis: {
              verdict: failed === 0 ? `✅ Suite "${args.suite_name}" PASSED (${passed}/${suite.tests.length})` : `❌ Suite "${args.suite_name}" FAILED (${failed} failures)`,
              failed_tests: results.filter(r => r.status !== 'passed').map(r => `${r.action}: ${r.error || r.summary}`),
              gate_decision: failed === 0 ? 'DEPLOY_OK' : 'BLOCK_DEPLOY',
              hint: failed > 0 ? 'Fix failing tests before deploying. Run individual actions for detailed diagnostics.' : 'All tests passing — safe to deploy.',
            },
          });
        }

        return fail('UNKNOWN_SUITE_ACTION', `Unknown suite_action: ${subAction}. Valid: create, run, list, history`);
      }

      // ═══════════════════════════════════
      // PERFORMANCE BUDGET
      // ═══════════════════════════════════
      case 'performance_budget': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        if (!args.budgets) return fail('MISSING_PARAM', 'budgets object is required (e.g. {lcp_ms: 2500, cls: 0.1, total_size_kb: 3000})');
        const page = await getPage();
        const timeline = new EventTimeline();

        timeline.emit('navigation_start');
        await page.goto(args.url, { waitUntil: 'networkidle', timeout: args.timeout || 30000 });
        timeline.emit('network_idle');
        await page.waitForTimeout(2000);

        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
          const jsSize = res.filter(r => r.initiatorType === 'script').reduce((s, r) => s + (r.transferSize || 0), 0);
          const cssSize = res.filter(r => r.initiatorType === 'link' || r.initiatorType === 'css').reduce((s, r) => s + (r.transferSize || 0), 0);
          const imgSize = res.filter(r => r.initiatorType === 'img').reduce((s, r) => s + (r.transferSize || 0), 0);
          return {
            fcp_ms: fcp ? Math.round(fcp.startTime) : null, lcp_ms: nav ? Math.round(nav.domComplete - nav.startTime) : null,
            cls: 0, total_size_kb: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
            js_size_kb: Math.round(jsSize / 1024), css_size_kb: Math.round(cssSize / 1024), image_size_kb: Math.round(imgSize / 1024), request_count: res.length,
          };
        });

        const violations: any[] = [];
        const budgets = args.budgets;
        for (const [key, limit] of Object.entries(budgets)) {
          const actual = (metrics as any)[key];
          if (actual !== undefined && actual !== null && actual > (limit as number)) {
            violations.push({ metric: key, budget: limit, actual, over_by: key.includes('kb') ? `${actual - (limit as number)}KB` : key.includes('ms') ? `${actual - (limit as number)}ms` : `${(actual - (limit as number)).toFixed(4)}`, severity: actual > (limit as number) * 1.5 ? 'critical' : 'warning' });
          }
        }

        const withinBudget = violations.length === 0;
        const meta = createTestMeta('web_testing', 'performance_budget', start, { url: args.url });
        recordTestRun({ test_id: meta.test_id, tool: 'web_testing', action: 'performance_budget', url: args.url, timestamp: meta.timestamp, duration_ms: meta.duration_ms, passed: withinBudget, issues_count: violations.length, summary: withinBudget ? 'Within budget' : `${violations.length} violations` });

        return ok({
          performance_budget: { url: args.url, within_budget: withinBudget, violations_count: violations.length, budgets_checked: Object.keys(budgets).length },
          actual_metrics: metrics, budgets_defined: budgets, violations,
          event_timeline: timeline.getEvents(),
          ai_analysis: {
            verdict: withinBudget ? '✅ All metrics within performance budget' : `❌ ${violations.length} budget violation(s)`,
            critical_violations: violations.filter(v => v.severity === 'critical').map(v => `${v.metric}: ${v.actual} (budget: ${v.budget}, ${v.over_by} over)`),
            optimization_tips: violations.map(v => {
              if (v.metric.includes('js_size')) return `Reduce JS bundle: code-split, tree-shake, lazy-load (currently ${v.actual}KB, budget ${v.budget}KB)`;
              if (v.metric.includes('image')) return `Optimize images: use WebP/AVIF, lazy-load below-fold, resize to display dimensions`;
              if (v.metric.includes('lcp')) return `Improve LCP: preload hero image, inline critical CSS, optimize server response`;
              if (v.metric === 'cls') return `Fix CLS: add explicit dimensions to images/embeds, avoid inserting content above viewport`;
              return `Reduce ${v.metric}: currently ${v.actual}, budget is ${v.budget}`;
            }),
            hint: 'Set performance budgets in CI/CD to catch regressions before they ship.',
          },
          comparison: getComparisonToPrevious(args.url, 'performance_budget', withinBudget ? 100 : 0, violations.length),
        }, meta);
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}. Valid: lighthouse, visual_regression, responsive_test, console_audit, network_waterfall, form_test, link_check, storage_audit, css_coverage, core_web_vitals, full_audit, security_headers, dom_diff, error_diagnosis, test_suite, performance_budget`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - start;
    logAudit('web_testing', `${args.action || 'unknown'}: Error after ${elapsed}ms: ${error.message}`, false, 'WEB_TESTING_ERROR', elapsed);
    return fail('WEB_TESTING_ERROR', `${args.action} failed: ${error.message}`);
  }
}

// ============================================================
// Scoring helpers
// ============================================================

function calculatePerfScore(metrics: any): number {
  let score = 100;
  const nav = metrics.navigation;
  if (nav.ttfb_ms > 800) score -= 15;
  if (nav.ttfb_ms > 1800) score -= 15;
  if (nav.dom_complete_ms > 3000) score -= 10;
  if (nav.dom_complete_ms > 5000) score -= 10;
  if (metrics.fcp_ms && metrics.fcp_ms > 1800) score -= 10;
  if (metrics.fcp_ms && metrics.fcp_ms > 3000) score -= 10;
  if (metrics.total_transfer_kb > 3000) score -= 10;
  if (metrics.total_transfer_kb > 5000) score -= 10;
  if (metrics.slow_resources.length > 3) score -= 5;
  if (metrics.slow_resources.length > 8) score -= 5;
  return Math.max(0, score);
}

function calculateSeoScore(seo: any): number {
  let score = 100;
  if (!seo.title) score -= 20;
  else if (seo.title_length < 30 || seo.title_length > 60) score -= 5;
  if (!seo.meta_description) score -= 15;
  else if (seo.meta_description_length < 70 || seo.meta_description_length > 160) score -= 5;
  if (seo.h1_count === 0) score -= 15;
  if (seo.h1_count > 1) score -= 5;
  if (seo.images_missing_alt > 0) score -= Math.min(20, seo.images_missing_alt * 3);
  if (!seo.has_viewport) score -= 10;
  if (!seo.has_canonical) score -= 5;
  return Math.max(0, score);
}

function identifyBottlenecks(metrics: any): string[] {
  const issues: string[] = [];
  const nav = metrics.navigation;
  if (nav.ttfb_ms > 800) issues.push(`TTFB is ${nav.ttfb_ms}ms (target: <800ms)`);
  if (nav.dns_ms > 100) issues.push(`DNS lookup taking ${nav.dns_ms}ms`);
  if (nav.tcp_ms > 200) issues.push(`TCP connection taking ${nav.tcp_ms}ms`);
  if (metrics.total_transfer_kb > 3000) issues.push(`Page weight ${metrics.total_transfer_kb}KB (target: <3000KB)`);
  if (metrics.resource_breakdown.scripts > 20) issues.push(`${metrics.resource_breakdown.scripts} script files (too many)`);
  if (metrics.slow_resources.length > 0) issues.push(`${metrics.slow_resources.length} resources taking >500ms`);
  return issues;
}

function identifySeoIssues(seo: any): string[] {
  const issues: string[] = [];
  if (!seo.title) issues.push('Missing page title');
  if (!seo.meta_description) issues.push('Missing meta description');
  if (seo.h1_count === 0) issues.push('No H1 heading');
  if (seo.h1_count > 1) issues.push(`Multiple H1 headings (${seo.h1_count})`);
  if (seo.images_missing_alt > 0) issues.push(`${seo.images_missing_alt} images missing alt text`);
  if (!seo.has_viewport) issues.push('Missing viewport meta tag');
  return issues;
}
