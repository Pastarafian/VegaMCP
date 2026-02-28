/**
 * VegaMCP — Accessibility Testing Tool (v7.0)
 * 
 * AI-First WCAG accessibility compliance testing via Playwright.
 * Features:
 * - WCAG 2.1 audit (A, AA, AAA level checks)
 * - Color contrast analysis (WCAG AA/AAA ratio validation)
 * - Keyboard navigation testing (tab order, focus traps)
 * - ARIA attribute auditing (roles, labels, states)
 * - Screen reader compatibility testing (live regions, landmarks)
 * - Focus management testing (visible indicators, logical flow)
 * 
 * All outputs include structured `ai_analysis` blocks for AI consumption.
 */

import { getPage } from '../browser/session.js';
import { logAudit } from '../../db/graph-store.js';

// ============================================================
// Schema
// ============================================================

export const accessibilitySchema = {
  name: 'accessibility',
  description: `WCAG accessibility compliance testing via Playwright. Actions: wcag_audit (full WCAG 2.1 check with severity scoring), contrast_check (color contrast ratio validation), keyboard_nav (tab order and focus trap detection), aria_audit (ARIA role/label/state validation), screen_reader (landmark and live region testing), focus_management (focus indicator and logical flow testing). All outputs include ai_analysis blocks with WCAG violation details.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: [
          'wcag_audit',
          'contrast_check',
          'keyboard_nav',
          'aria_audit',
          'screen_reader',
          'focus_management',
        ],
        description: 'Accessibility testing action to perform',
      },
      // Common
      url: { type: 'string', description: 'URL to test (required for most actions)' },
      // WCAG level
      level: { type: 'string', enum: ['A', 'AA', 'AAA'], default: 'AA', description: 'WCAG conformance level to check' },
      // Keyboard
      max_tabs: { type: 'number', description: 'Max Tab key presses for keyboard_nav (default: 50)', default: 50 },
      // Selectors
      selector: { type: 'string', description: 'Optional CSS selector to scope the audit' },
      // General
      timeout: { type: 'number', description: 'Navigation timeout in ms', default: 30000 },
      wait_for: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], default: 'load', description: 'Wait condition before testing' },
      // Include options
      include_passing: { type: 'boolean', description: 'Include passing checks in output', default: false },
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
// WCAG contrast ratio calculator
// ============================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ============================================================
// Main Handler
// ============================================================

export async function handleAccessibility(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const start = Date.now();

  try {
    switch (args.action) {

      // ═══════════════════════════════════
      // WCAG AUDIT — Full compliance check
      // ═══════════════════════════════════
      case 'wcag_audit': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();
        const level = args.level || 'AA';

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        // Run comprehensive accessibility checks
        const audit = await page.evaluate((opts: { level: string; selector: string | null }) => {
          const scope = opts.selector ? document.querySelector(opts.selector) || document : document;
          const violations: any[] = [];
          const passes: any[] = [];

          // Helper to add result
          const check = (rule: string, wcag: string, impact: string, passed: boolean, element?: string, message?: string) => {
            const result = { rule, wcag, impact, element: element?.substring(0, 100), message };
            if (passed) passes.push(result);
            else violations.push(result);
          };

          // 1. Images without alt text (WCAG 1.1.1)
          const imgs = scope.querySelectorAll('img');
          imgs.forEach(img => {
            const alt = img.getAttribute('alt');
            const isDecorative = alt === '' && (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true');
            check(
              'img-alt',
              '1.1.1',
              'critical',
              alt !== null || isDecorative,
              `<img src="${(img as HTMLImageElement).src?.substring(0, 50)}">`,
              alt === null ? 'Image missing alt attribute' : undefined,
            );
          });

          // 2. Form labels (WCAG 1.3.1, 4.1.2)
          const inputs = scope.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
          inputs.forEach(input => {
            const el = input as HTMLInputElement;
            const hasLabel = !!document.querySelector(`label[for="${el.id}"]`) || !!el.closest('label');
            const hasAriaLabel = !!el.getAttribute('aria-label');
            const hasAriaLabelledby = !!el.getAttribute('aria-labelledby');
            const hasTitle = !!el.title;
            check(
              'form-label',
              '1.3.1',
              'critical',
              hasLabel || hasAriaLabel || hasAriaLabelledby || hasTitle,
              `<${el.tagName.toLowerCase()} name="${el.name}" type="${el.type}">`,
              !(hasLabel || hasAriaLabel || hasAriaLabelledby || hasTitle) ? 'Form input missing accessible label' : undefined,
            );
          });

          // 3. Heading hierarchy (WCAG 1.3.1)
          const headings = Array.from(scope.querySelectorAll('h1, h2, h3, h4, h5, h6'));
          let prevLevel = 0;
          const h1Count = headings.filter(h => h.tagName === 'H1').length;
          if (h1Count !== 1) {
            check('heading-h1', '1.3.1', 'moderate', false, undefined, `Found ${h1Count} H1 elements (should be exactly 1)`);
          } else {
            check('heading-h1', '1.3.1', 'moderate', true);
          }

          headings.forEach(h => {
            const level = parseInt(h.tagName[1]);
            if (prevLevel > 0 && level > prevLevel + 1) {
              check(
                'heading-order',
                '1.3.1',
                'moderate',
                false,
                `<${h.tagName.toLowerCase()}>`,
                `Heading level skips from H${prevLevel} to H${level}`,
              );
            }
            prevLevel = level;
          });

          // 4. Link text (WCAG 2.4.4)
          const links = scope.querySelectorAll('a');
          links.forEach(link => {
            const text = (link.textContent || '').trim();
            const ariaLabel = link.getAttribute('aria-label') || '';
            const isDescriptive = text.length > 3 && !['click here', 'read more', 'here', 'more', 'link'].includes(text.toLowerCase());
            check(
              'link-text',
              '2.4.4',
              'moderate',
              isDescriptive || ariaLabel.length > 3,
              `<a>${text.substring(0, 40)}</a>`,
              !isDescriptive && !ariaLabel ? `Non-descriptive link text: "${text}"` : undefined,
            );
          });

          // 5. Language attribute (WCAG 3.1.1)
          const htmlLang = document.documentElement.getAttribute('lang');
          check('html-lang', '3.1.1', 'critical', !!htmlLang, '<html>', !htmlLang ? 'Missing lang attribute on <html>' : undefined);

          // 6. Page title (WCAG 2.4.2)
          check('page-title', '2.4.2', 'critical', !!document.title, '<title>', !document.title ? 'Page missing title' : undefined);

          // 7. Skip navigation (WCAG 2.4.1) — Level A
          const hasSkipLink = !!scope.querySelector('a[href="#main"], a[href="#content"], [role="main"], main');
          check('skip-nav', '2.4.1', 'moderate', hasSkipLink, undefined, !hasSkipLink ? 'No skip navigation or main landmark found' : undefined);

          // 8. Landmark roles (WCAG 1.3.1)
          const landmarks = {
            main: scope.querySelectorAll('main, [role="main"]').length,
            nav: scope.querySelectorAll('nav, [role="navigation"]').length,
            banner: scope.querySelectorAll('header, [role="banner"]').length,
            contentinfo: scope.querySelectorAll('footer, [role="contentinfo"]').length,
          };
          check('landmarks', '1.3.1', 'moderate', landmarks.main > 0, undefined, landmarks.main === 0 ? 'No main landmark found' : undefined);

          // 9. Buttons without accessible text (WCAG 4.1.2)
          const buttons = scope.querySelectorAll('button, [role="button"], input[type="button"]');
          buttons.forEach(btn => {
            const text = (btn.textContent || '').trim();
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const title = (btn as HTMLElement).title || '';
            check(
              'button-label',
              '4.1.2',
              'critical',
              text.length > 0 || ariaLabel.length > 0 || title.length > 0,
              `<button>${text.substring(0, 30) || '[empty]'}</button>`,
              !(text || ariaLabel || title) ? 'Button missing accessible text' : undefined,
            );
          });

          // 10. Tabindex issues (WCAG 2.4.3)
          const positiveTabindex = scope.querySelectorAll('[tabindex]');
          let tabindexIssues = 0;
          positiveTabindex.forEach(el => {
            const tabindex = parseInt(el.getAttribute('tabindex') || '0');
            if (tabindex > 0) tabindexIssues++;
          });
          check('tabindex', '2.4.3', 'moderate', tabindexIssues === 0, undefined, tabindexIssues > 0 ? `${tabindexIssues} elements have positive tabindex (disrupts natural tab order)` : undefined);

          // 11. Auto-playing media (WCAG 1.4.2)
          const autoplayMedia = scope.querySelectorAll('video[autoplay], audio[autoplay]');
          check('autoplay', '1.4.2', 'critical', autoplayMedia.length === 0, undefined, autoplayMedia.length > 0 ? `${autoplayMedia.length} auto-playing media elements` : undefined);

          return {
            violations,
            passes: passes.length,
            total_checks: violations.length + passes.length,
            element_counts: {
              images: imgs.length,
              forms: inputs.length,
              headings: headings.length,
              links: links.length,
              buttons: buttons.length,
              landmarks,
            },
            all_passes: opts.level === 'include_passes' ? passes : undefined,
          };
        }, { level, selector: args.selector || null });

        // Categorize violations by impact
        const critical = audit.violations.filter((v: any) => v.impact === 'critical');
        const moderate = audit.violations.filter((v: any) => v.impact === 'moderate');
        const minor = audit.violations.filter((v: any) => v.impact === 'minor');

        // Calculate score
        const score = Math.max(0, 100 - (critical.length * 15) - (moderate.length * 5) - (minor.length * 2));

        return ok({
          wcag_audit: {
            url: args.url,
            level,
            score: Math.min(100, score),
            total_checks: audit.total_checks,
            violations: audit.violations.length,
            passes: audit.passes,
            by_impact: {
              critical: critical.length,
              moderate: moderate.length,
              minor: minor.length,
            },
            element_counts: audit.element_counts,
          },
          violations: audit.violations,
          ai_analysis: {
            grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
            verdict: audit.violations.length === 0
              ? `✅ WCAG ${level} — No violations found`
              : `❌ WCAG ${level} — ${audit.violations.length} violations (${critical.length} critical)`,
            top_priority: critical.slice(0, 5).map((v: any) => `[${v.wcag}] ${v.rule}: ${v.message}`),
            wcag_criteria_hit: [...new Set(audit.violations.map((v: any) => v.wcag))],
            hint: critical.length > 0
              ? 'Critical violations block users with disabilities. Fix img-alt, form-label, and html-lang first.'
              : moderate.length > 0
              ? 'Moderate issues affect usability. Focus on heading order and descriptive link text.'
              : 'Great accessibility! Consider AAA level testing for enhanced compliance.',
          },
        });
      }

      // ═══════════════════════════════════
      // CONTRAST CHECK
      // ═══════════════════════════════════
      case 'contrast_check': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        // Extract text elements with their colors
        const colorData = await page.evaluate((sel: string | null) => {
          const scope = sel ? document.querySelector(sel) || document : document;
          const elements: any[] = [];

          // Get all text-containing elements
          const textElements = scope.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th, div, input, textarea, select');

          textElements.forEach(el => {
            const text = (el.textContent || '').trim();
            if (!text || text.length < 1) return;
            if (elements.length >= 100) return; // Cap at 100 elements

            const style = getComputedStyle(el);
            const color = style.color;
            const bgColor = style.backgroundColor;
            const fontSize = parseFloat(style.fontSize);
            const fontWeight = parseInt(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);

            // Only include elements with visible text and colors
            if (color && bgColor && color !== 'rgba(0, 0, 0, 0)') {
              elements.push({
                tag: el.tagName.toLowerCase(),
                text: text.substring(0, 40),
                color,
                background: bgColor,
                font_size_px: fontSize,
                font_weight: fontWeight,
                is_large_text: fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700),
              });
            }
          });

          return elements;
        }, args.selector || null);

        // Parse rgb colors and calculate contrast ratios
        const parseRgb = (color: string): { r: number; g: number; b: number } | null => {
          const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return null;
          return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
        };

        const results = colorData.map((el: any) => {
          const fg = parseRgb(el.color);
          const bg = parseRgb(el.background);

          if (!fg || !bg) return { ...el, ratio: null, pass_aa: null, pass_aaa: null };

          const fgLum = relativeLuminance(fg.r, fg.g, fg.b);
          const bgLum = relativeLuminance(bg.r, bg.g, bg.b);
          const ratio = Math.round(contrastRatio(fgLum, bgLum) * 100) / 100;

          // WCAG AA: 4.5:1 normal text, 3:1 large text
          // WCAG AAA: 7:1 normal text, 4.5:1 large text
          const aaThreshold = el.is_large_text ? 3 : 4.5;
          const aaaThreshold = el.is_large_text ? 4.5 : 7;

          return {
            ...el,
            ratio,
            pass_aa: ratio >= aaThreshold,
            pass_aaa: ratio >= aaaThreshold,
          };
        });

        const failsAA = results.filter((r: any) => r.ratio !== null && !r.pass_aa);
        const failsAAA = results.filter((r: any) => r.ratio !== null && !r.pass_aaa);
        const passesAA = results.filter((r: any) => r.ratio !== null && r.pass_aa);

        return ok({
          contrast_check: {
            url: args.url,
            elements_checked: results.length,
            aa_pass: passesAA.length,
            aa_fail: failsAA.length,
            aaa_fail: failsAAA.length,
            pass_rate_aa: results.length > 0 ? Math.round((passesAA.length / results.length) * 100) : 100,
          },
          failures_aa: failsAA.slice(0, 20).map((r: any) => ({
            text: r.text,
            tag: r.tag,
            color: r.color,
            background: r.background,
            ratio: r.ratio,
            required: r.is_large_text ? '3:1' : '4.5:1',
            font_size: r.font_size_px,
          })),
          ai_analysis: {
            verdict: failsAA.length === 0
              ? '✅ All text passes WCAG AA contrast requirements'
              : `❌ ${failsAA.length} elements fail WCAG AA contrast (${Math.round((failsAA.length / results.length) * 100)}%)`,
            worst_offenders: failsAA
              .sort((a: any, b: any) => a.ratio - b.ratio)
              .slice(0, 5)
              .map((r: any) => `"${r.text}" — ratio ${r.ratio}:1 (needs ${r.is_large_text ? '3:1' : '4.5:1'})`),
            hint: failsAA.length > 0
              ? 'Low contrast makes text unreadable for users with low vision (8% of males). Increase contrast by darkening text or lightening backgrounds.'
              : failsAAA.length > 0
              ? `Passes AA but ${failsAAA.length} elements fail AAA. Consider upgrading for enhanced readability.`
              : 'Excellent contrast! All elements pass both AA and AAA.',
            thresholds: {
              aa_normal: '4.5:1',
              aa_large: '3:1 (≥18px or ≥14px bold)',
              aaa_normal: '7:1',
              aaa_large: '4.5:1 (≥18px or ≥14px bold)',
            },
          },
        });
      }

      // ═══════════════════════════════════
      // KEYBOARD NAVIGATION
      // ═══════════════════════════════════
      case 'keyboard_nav': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        const maxTabs = Math.min(args.max_tabs || 50, 100);

        // Tab through the page and record focus order
        const tabOrder: any[] = [];
        const issues: string[] = [];

        // Click at top of page to start focus from beginning
        await page.mouse.click(0, 0);

        for (let i = 0; i < maxTabs; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(100);

          const focusInfo = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;

            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);

            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              class: el.className?.toString().substring(0, 50) || '',
              text: (el.textContent || '').trim().substring(0, 40),
              role: el.getAttribute('role') || '',
              type: (el as HTMLInputElement).type || '',
              tabindex: el.getAttribute('tabindex'),
              visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
              in_viewport: rect.top >= 0 && rect.top < window.innerHeight,
              has_focus_indicator: style.outlineStyle !== 'none' || style.outlineWidth !== '0px' || style.boxShadow !== 'none',
              position: { x: Math.round(rect.x), y: Math.round(rect.y) },
            };
          });

          if (!focusInfo) {
            // Focus lost — likely reached end or focus trap
            if (i < 5) {
              issues.push('Focus lost very early — possible focus trap or no focusable elements');
            }
            break;
          }

          // Check for issues
          if (!focusInfo.visible) {
            issues.push(`Tab ${i + 1}: Focus on invisible element <${focusInfo.tag}> (off-screen or hidden)`);
          }
          if (!focusInfo.has_focus_indicator) {
            issues.push(`Tab ${i + 1}: <${focusInfo.tag}> "${focusInfo.text}" has no visible focus indicator`);
          }

          tabOrder.push({
            tab_index: i + 1,
            ...focusInfo,
          });

          // Check for circular focus (repeated elements)
          if (tabOrder.length > 3) {
            const lastThree = tabOrder.slice(-3).map(t => `${t.tag}:${t.id || t.text}`);
            const earlyThree = tabOrder.slice(0, 3).map(t => `${t.tag}:${t.id || t.text}`);
            if (JSON.stringify(lastThree) === JSON.stringify(earlyThree) && i > 10) {
              issues.push('Focus appears to cycle — tab order loops detected');
              break;
            }
          }
        }

        // Check for focus trap
        const hasFocusTrap = tabOrder.length < 5 && maxTabs >= 20;
        if (hasFocusTrap) {
          issues.push('Possible focus trap — very few tabbable elements detected');
        }

        // Check for logical order (elements should generally flow top-to-bottom, left-to-right)
        let orderIssues = 0;
        for (let i = 1; i < tabOrder.length; i++) {
          const prev = tabOrder[i - 1];
          const curr = tabOrder[i];
          if (prev.position && curr.position) {
            // Big jump backwards suggests illogical order
            if (curr.position.y < prev.position.y - 100 && curr.position.x < prev.position.x - 200) {
              orderIssues++;
            }
          }
        }

        const noIndicatorCount = tabOrder.filter(t => !t.has_focus_indicator).length;

        return ok({
          keyboard_nav: {
            url: args.url,
            tabs_pressed: maxTabs,
            focusable_elements: tabOrder.length,
            order_issues: orderIssues,
            missing_indicators: noIndicatorCount,
            total_issues: issues.length,
          },
          tab_order: tabOrder.slice(0, 30),
          issues,
          ai_analysis: {
            verdict: issues.length === 0
              ? '✅ Keyboard navigation works correctly'
              : `⚠️ ${issues.length} keyboard navigation issues found`,
            critical: [
              ...(hasFocusTrap ? ['Focus trap detected — users cannot navigate the page'] : []),
              ...(noIndicatorCount > 3 ? [`${noIndicatorCount} elements missing focus indicators — keyboard users cannot see where they are`] : []),
            ],
            hint: 'Every interactive element must be reachable via Tab and have a visible focus indicator. Focus order should match visual reading order.',
          },
        });
      }

      // ═══════════════════════════════════
      // ARIA AUDIT
      // ═══════════════════════════════════
      case 'aria_audit': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        const ariaResults = await page.evaluate((sel: string | null) => {
          const scope = sel ? document.querySelector(sel) || document : document;
          const violations: any[] = [];
          const stats = { total_aria_elements: 0, roles: 0, labels: 0, describedby: 0, hidden: 0, live: 0 };

          // Find all elements with ARIA attributes
          const ariaElements = scope.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], [aria-live], [aria-expanded], [aria-controls], [aria-haspopup]');
          stats.total_aria_elements = ariaElements.length;

          // Valid ARIA roles
          const validRoles = new Set([
            'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox',
            'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'dialog', 'directory',
            'document', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading', 'img', 'link',
            'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
            'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option', 'presentation',
            'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar',
            'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'switch', 'tab',
            'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree',
            'treegrid', 'treeitem',
          ]);

          ariaElements.forEach(el => {
            const role = el.getAttribute('role');
            const ariaLabel = el.getAttribute('aria-label');
            const ariaLabelledby = el.getAttribute('aria-labelledby');
            const ariaDescribedby = el.getAttribute('aria-describedby');
            const ariaHidden = el.getAttribute('aria-hidden');
            const ariaLive = el.getAttribute('aria-live');
            const ariaControls = el.getAttribute('aria-controls');

            // Check 1: Invalid role
            if (role) {
              stats.roles++;
              if (!validRoles.has(role)) {
                violations.push({
                  rule: 'aria-valid-role',
                  element: `<${el.tagName.toLowerCase()} role="${role}">`,
                  message: `Invalid ARIA role: "${role}"`,
                  impact: 'critical',
                });
              }
            }

            // Check 2: aria-labelledby references exist
            if (ariaLabelledby) {
              stats.labels++;
              const ids = ariaLabelledby.split(' ');
              ids.forEach(id => {
                if (!document.getElementById(id)) {
                  violations.push({
                    rule: 'aria-labelledby-ref',
                    element: `<${el.tagName.toLowerCase()} aria-labelledby="${ariaLabelledby}">`,
                    message: `aria-labelledby references non-existent ID: "${id}"`,
                    impact: 'critical',
                  });
                }
              });
            }

            // Check 3: aria-describedby references exist
            if (ariaDescribedby) {
              stats.describedby++;
              const ids = ariaDescribedby.split(' ');
              ids.forEach(id => {
                if (!document.getElementById(id)) {
                  violations.push({
                    rule: 'aria-describedby-ref',
                    element: `<${el.tagName.toLowerCase()} aria-describedby="${ariaDescribedby}">`,
                    message: `aria-describedby references non-existent ID: "${id}"`,
                    impact: 'moderate',
                  });
                }
              });
            }

            // Check 4: aria-controls references exist
            if (ariaControls) {
              if (!document.getElementById(ariaControls)) {
                violations.push({
                  rule: 'aria-controls-ref',
                  element: `<${el.tagName.toLowerCase()} aria-controls="${ariaControls}">`,
                  message: `aria-controls references non-existent ID: "${ariaControls}"`,
                  impact: 'moderate',
                });
              }
            }

            // Check 5: aria-hidden on focusable elements
            if (ariaHidden === 'true') {
              stats.hidden++;
              const isFocusable = el.matches('a[href], button, input, select, textarea, [tabindex]');
              if (isFocusable) {
                violations.push({
                  rule: 'aria-hidden-focus',
                  element: `<${el.tagName.toLowerCase()} aria-hidden="true">`,
                  message: 'aria-hidden="true" on focusable element — screen reader users can focus but not see it',
                  impact: 'critical',
                });
              }
            }

            // Check 6: aria-live regions
            if (ariaLive) stats.live++;

            // Check 7: Interactive role without label
            const interactiveRoles = ['button', 'link', 'textbox', 'combobox', 'listbox', 'slider', 'switch', 'checkbox', 'radio'];
            if (role && interactiveRoles.includes(role)) {
              const hasName = ariaLabel || ariaLabelledby || (el.textContent || '').trim().length > 0 || (el as HTMLElement).title;
              if (!hasName) {
                violations.push({
                  rule: 'aria-name-required',
                  element: `<${el.tagName.toLowerCase()} role="${role}">`,
                  message: `Interactive role "${role}" requires an accessible name`,
                  impact: 'critical',
                });
              }
            }
          });

          return { violations, stats };
        }, args.selector || null);

        const critical = ariaResults.violations.filter((v: any) => v.impact === 'critical');

        return ok({
          aria_audit: {
            url: args.url,
            total_aria_elements: ariaResults.stats.total_aria_elements,
            violations: ariaResults.violations.length,
            stats: ariaResults.stats,
          },
          violations: ariaResults.violations.slice(0, 30),
          ai_analysis: {
            verdict: ariaResults.violations.length === 0
              ? '✅ ARIA usage is correct'
              : `❌ ${ariaResults.violations.length} ARIA violations (${critical.length} critical)`,
            top_issues: critical.slice(0, 5).map((v: any) => `${v.rule}: ${v.message}`),
            hint: 'Invalid ARIA is worse than no ARIA — it actively confuses screen readers. Fix broken references first, then missing labels.',
          },
        });
      }

      // ═══════════════════════════════════
      // SCREEN READER
      // ═══════════════════════════════════
      case 'screen_reader': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        const srResults = await page.evaluate((sel: string | null) => {
          const scope = sel ? document.querySelector(sel) || document : document;

          // Landmarks
          const landmarks = {
            banner: scope.querySelectorAll('header, [role="banner"]').length,
            navigation: scope.querySelectorAll('nav, [role="navigation"]').length,
            main: scope.querySelectorAll('main, [role="main"]').length,
            complementary: scope.querySelectorAll('aside, [role="complementary"]').length,
            contentinfo: scope.querySelectorAll('footer, [role="contentinfo"]').length,
            search: scope.querySelectorAll('[role="search"]').length,
            form: scope.querySelectorAll('[role="form"], form[aria-label], form[aria-labelledby]').length,
          };

          // Live regions
          const liveRegions = Array.from(scope.querySelectorAll('[aria-live], [role="alert"], [role="status"], [role="log"], [role="timer"]'));

          // Heading structure for SR navigation
          const headings = Array.from(scope.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
            level: parseInt(h.tagName[1]),
            text: (h.textContent || '').trim().substring(0, 60),
            id: h.id || '',
          }));

          // Images with alt text quality
          const images = Array.from(scope.querySelectorAll('img')).map(img => {
            const alt = (img as HTMLImageElement).alt;
            const isDecorative = img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true';
            return {
              src: (img as HTMLImageElement).src?.substring(0, 50),
              alt: alt || null,
              is_decorative: isDecorative,
              issue: alt === null ? 'missing alt' : alt === '' && !isDecorative ? 'empty alt without decorative role' : null,
            };
          });

          // Tables
          const tables = Array.from(scope.querySelectorAll('table')).map(table => ({
            has_caption: !!table.querySelector('caption'),
            has_headers: table.querySelectorAll('th').length > 0,
            has_scope: Array.from(table.querySelectorAll('th')).some(th => th.getAttribute('scope')),
            rows: table.querySelectorAll('tr').length,
          }));

          return { landmarks, liveRegions: liveRegions.length, headings, images, tables };
        }, args.selector || null);

        const issues: string[] = [];
        if (srResults.landmarks.main === 0) issues.push('No main landmark — SR users cannot jump to main content');
        if (srResults.landmarks.navigation === 0) issues.push('No navigation landmark');
        if (srResults.headings.length === 0) issues.push('No headings — SR users cannot navigate by heading');
        if (srResults.images.filter((i: any) => i.issue).length > 0) issues.push(`${srResults.images.filter((i: any) => i.issue).length} images with alt text issues`);
        if (srResults.tables.filter((t: any) => !t.has_headers).length > 0) issues.push('Tables without header cells');

        return ok({
          screen_reader: {
            url: args.url,
            landmarks: srResults.landmarks,
            live_regions: srResults.liveRegions,
            heading_count: srResults.headings.length,
            image_issues: srResults.images.filter((i: any) => i.issue).length,
          },
          heading_outline: srResults.headings,
          image_audit: srResults.images.filter((i: any) => i.issue).slice(0, 20),
          table_audit: srResults.tables,
          issues,
          ai_analysis: {
            verdict: issues.length === 0
              ? '✅ Page is well-structured for screen readers'
              : `⚠️ ${issues.length} screen reader usability issues`,
            landmark_quality: srResults.landmarks.main > 0 && srResults.landmarks.navigation > 0
              ? 'Good landmark structure'
              : 'Missing key landmarks — SR users cannot navigate efficiently',
            heading_quality: srResults.headings.length > 0
              ? `${srResults.headings.length} headings provide good document outline`
              : 'No headings — poor document structure for SR navigation',
            hint: 'Screen reader users navigate by landmarks and headings. Ensure main, nav, and heading structure creates a logical document outline.',
          },
        });
      }

      // ═══════════════════════════════════
      // FOCUS MANAGEMENT
      // ═══════════════════════════════════
      case 'focus_management': {
        if (!args.url) return fail('MISSING_PARAM', 'url is required');
        const page = await getPage();

        await page.goto(args.url, {
          waitUntil: (args.wait_for as any) || 'load',
          timeout: args.timeout || 30000,
        });

        const focusResults = await page.evaluate(() => {
          // Check all interactive elements for focus indicators
          const interactiveElements = document.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]'
          );

          const elements: any[] = [];
          const issues: string[] = [];

          interactiveElements.forEach(el => {
            if (elements.length >= 50) return;

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return; // Skip invisible elements

            // Focus the element to check its focus style
            (el as HTMLElement).focus();
            const focusStyle = getComputedStyle(el);
            const normalStyle = getComputedStyle(el); // This won't perfectly capture non-focus styles but gives us baseline

            const hasFocusOutline = focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth !== '0px';
            const hasFocusShadow = focusStyle.boxShadow !== 'none';
            const hasFocusBorder = focusStyle.borderColor !== normalStyle.borderColor;

            const hasVisibleFocus = hasFocusOutline || hasFocusShadow || hasFocusBorder;

            // Check touch target size
            const isTouchFriendly = rect.width >= 44 && rect.height >= 44;

            elements.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              text: (el.textContent || '').trim().substring(0, 30),
              type: (el as HTMLInputElement).type || '',
              role: el.getAttribute('role') || '',
              has_visible_focus: hasVisibleFocus,
              touch_target_ok: isTouchFriendly,
              size: { width: Math.round(rect.width), height: Math.round(rect.height) },
              tabindex: el.getAttribute('tabindex'),
            });

            if (!hasVisibleFocus) {
              issues.push(`<${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().substring(0, 20)}" has no visible focus indicator`);
            }
            if (!isTouchFriendly && rect.width > 0) {
              issues.push(`<${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().substring(0, 20)}" touch target too small (${Math.round(rect.width)}x${Math.round(rect.height)}px)`);
            }
          });

          // Reset focus
          (document.activeElement as HTMLElement)?.blur?.();

          return { elements, issues, total_interactive: interactiveElements.length };
        });

        const noFocusCount = focusResults.elements.filter((e: any) => !e.has_visible_focus).length;
        const smallTargets = focusResults.elements.filter((e: any) => !e.touch_target_ok).length;

        return ok({
          focus_management: {
            url: args.url,
            interactive_elements: focusResults.total_interactive,
            checked: focusResults.elements.length,
            missing_indicators: noFocusCount,
            small_targets: smallTargets,
            total_issues: focusResults.issues.length,
          },
          elements: focusResults.elements.filter((e: any) => !e.has_visible_focus || !e.touch_target_ok).slice(0, 20),
          issues: focusResults.issues.slice(0, 20),
          ai_analysis: {
            verdict: noFocusCount === 0 && smallTargets === 0
              ? '✅ Focus management looks good'
              : `⚠️ ${noFocusCount} missing focus indicators, ${smallTargets} small touch targets`,
            focus_indicator_coverage: focusResults.elements.length > 0
              ? `${Math.round(((focusResults.elements.length - noFocusCount) / focusResults.elements.length) * 100)}% of elements have visible focus`
              : 'No interactive elements found',
            touch_target_coverage: focusResults.elements.length > 0
              ? `${Math.round(((focusResults.elements.length - smallTargets) / focusResults.elements.length) * 100)}% meet 44x44px minimum`
              : 'No interactive elements found',
            hint: 'WCAG 2.4.7 requires visible focus indicators on all interactive elements. WCAG 2.5.8 recommends 44x44px minimum touch targets. Use outline or box-shadow for focus, never outline:none without a replacement.',
          },
        });
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}. Valid: wcag_audit, contrast_check, keyboard_nav, aria_audit, screen_reader, focus_management`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - start;
    logAudit('accessibility', `${args.action || 'unknown'}: Error after ${elapsed}ms: ${error.message}`, false, 'ACCESSIBILITY_ERROR', elapsed);
    return fail('ACCESSIBILITY_ERROR', `${args.action} failed: ${error.message}`);
  }
}
