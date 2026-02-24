/**
 * VegaMCP — Browser Session Manager
 * Manages a persistent Playwright browser session with console capture.
 */

import { chromium, type Browser, type BrowserContext, type Page, type ConsoleMessage } from 'playwright';

export interface ConsoleEntry {
  level: string;
  text: string;
  timestamp: string;
  stack?: string;
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let consoleBuffer: ConsoleEntry[] = [];
let uncaughtExceptions: Array<{ message: string; timestamp: string }> = [];
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
const INACTIVITY_TIMEOUT = parseInt(process.env.BROWSER_INACTIVITY_TIMEOUT || '300000', 10);

/**
 * Get or create the browser page. Lazily initializes on first call.
 */
export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) {
    resetInactivityTimer();
    return page;
  }

  // Launch browser if needed
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }

  // Create incognito context
  if (!context) {
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      permissions: [], // No special permissions
      bypassCSP: false,
    });
  }

  // Create page with console capture
  page = await context.newPage();
  consoleBuffer = [];
  uncaughtExceptions = [];

  // Capture console messages
  page.on('console', (msg: ConsoleMessage) => {
    if (consoleBuffer.length < 100) {
      consoleBuffer.push({
        level: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Capture uncaught exceptions
  page.on('pageerror', (err: Error) => {
    if (uncaughtExceptions.length < 20) {
      uncaughtExceptions.push({
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  resetInactivityTimer();
  return page;
}

/**
 * Check if browser is currently active.
 */
export function isBrowserActive(): boolean {
  return browser !== null && browser.isConnected() && page !== null && !page.isClosed();
}

/**
 * Get and clear the console buffer.
 */
export function drainConsoleLogs(levelFilter?: string): {
  logs: ConsoleEntry[];
  uncaughtExceptions: Array<{ message: string; timestamp: string }>;
} {
  let logs = [...consoleBuffer];
  if (levelFilter && levelFilter !== 'all') {
    logs = logs.filter(l => l.level === levelFilter);
  }
  const exceptions = [...uncaughtExceptions];

  // Clear buffers after reading
  consoleBuffer = [];
  uncaughtExceptions = [];

  return { logs, uncaughtExceptions: exceptions };
}

/**
 * Close the browser session and release resources.
 */
export async function closeBrowser(): Promise<void> {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  if (page && !page.isClosed()) {
    await page.close().catch(() => {});
    page = null;
  }
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }

  consoleBuffer = [];
  uncaughtExceptions = [];
}

/**
 * Reset the inactivity timer. Browser auto-closes after timeout.
 */
function resetInactivityTimer(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  inactivityTimer = setTimeout(async () => {
    await closeBrowser();
  }, INACTIVITY_TIMEOUT);
}
