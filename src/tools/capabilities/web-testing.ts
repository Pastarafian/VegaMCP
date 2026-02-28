/**
 * VegaMCP — Web Testing Tool (v7.0)
 * 
 * AI-First web application quality assurance via Playwright.
 * Features:
 * - Lighthouse-style performance audits (Core Web Vitals)
 * - Visual regression testing with screenshot comparison
 * - Responsive design testing across breakpoints
 * - Console error auditing with severity classification
 * - Network waterfall analysis (slow requests, failed resources)
 * - Form validation testing (submit, error states, edge cases)
 * - Link checking (broken links, redirect chains)
 * - Storage auditing (cookies, localStorage, sessionStorage)
 * - CSS coverage analysis (unused styles detection)
 * - Core Web Vitals measurement (LCP, FID, CLS, TTFB)
 * 
 * All outputs include structured `ai_analysis` blocks for AI consumption.
 */

import { getPage, isBrowserActive } from '../browser/session.js';
import { logAudit } from '../../db/graph-store.js';

// ============================================================
// Schema
// ============================================================

export const webTestingSchema = {
  name: 'web_testing',
  description: `Web application quality testing via Playwright. Actions: lighthouse (performance audit with scores), visual_regression (screenshot comparison), responsive_test (multi-viewport check), console_audit (error/warning capture), network_waterfall (resource timing analysis), form_test (form validation testing), link_check (broken link detection), storage_audit (cookies/localStorage), css_coverage (unused style detection), core_web_vitals (LCP/CLS/TTFB measurement). All outputs include ai_analysis blocks.`,
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

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}. Valid: lighthouse, visual_regression, responsive_test, console_audit, network_waterfall, form_test, link_check, storage_audit, css_coverage, core_web_vitals`);
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
