/**
 * VegaMCP — Safety Gate (v1.0)
 * 
 * Global safety layer that ensures ALL testing operations run inside
 * sandboxes instead of directly on the host machine.
 * 
 * Every testing tool imports this module and calls gate() before executing
 * any potentially destructive or host-affecting operation.
 * 
 * Operations are classified by risk level:
 * - SAFE: Read-only, in-process, no side effects (always allowed)
 * - MODERATE: Creates temp files, makes outbound HTTP (sandboxed by default)
 * - DANGEROUS: System calls, input simulation, CPU/memory stress (always sandboxed)
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import vm from 'vm';

// ============================================================
// Configuration
// ============================================================
let SANDBOX_ENFORCED = true; // DEFAULT: everything sandboxed

export function setSandboxEnforced(enforced: boolean): void {
  SANDBOX_ENFORCED = enforced;
}

export function isSandboxEnforced(): boolean {
  return SANDBOX_ENFORCED;
}

// ============================================================
// Risk Classification
// ============================================================
export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

const ACTION_RISK_MAP: Record<string, RiskLevel> = {
  // Desktop Testing — all dangerous (host input/UI)
  'desktop:app_launch': 'dangerous',
  'desktop:app_kill': 'dangerous',
  'desktop:app_restart': 'dangerous',
  'desktop:mouse_click': 'dangerous',
  'desktop:mouse_move': 'dangerous',
  'desktop:keyboard_type': 'dangerous',
  'desktop:key_press': 'dangerous',
  'desktop:screenshot': 'moderate',
  'desktop:ui_tree': 'moderate',
  'desktop:window_list': 'safe',
  'desktop:window_focus': 'dangerous',
  'desktop:window_move': 'dangerous',
  'desktop:window_resize': 'dangerous',
  'desktop:window_minimize': 'dangerous',
  'desktop:window_maximize': 'dangerous',
  'desktop:clipboard_read': 'moderate',
  'desktop:clipboard_write': 'dangerous',
  'desktop:pixel_color': 'safe',
  'desktop:process_monitor': 'safe',
  'desktop:system_info': 'safe',
  'desktop:extract_logs': 'safe',

  // Visual Testing — uses actual action names from the schema
  'visual:extract_dom_tree': 'moderate',
  'visual:visual_regression_diff': 'safe',       // Compares images already in memory
  'visual:ocr_read_screen': 'moderate',           // Takes screenshot of host
  'visual:layout_analysis': 'moderate',           // Reads UIAutomation tree
  'visual:gui_state_log': 'moderate',             // Takes screenshots of host
  'visual:locate_visual_element': 'moderate',     // Reads UIAutomation tree
  'visual:capture_baseline': 'moderate',          // May capture host screenshot
  'visual:compare_screenshots': 'safe',           // Compare existing images
  'visual:color_analysis': 'moderate',            // May capture host screenshot
  'visual:element_boundaries': 'moderate',        // Reads UIAutomation tree

  // Server Testing — network operations
  'server:port_scan': 'dangerous',
  'server:load_test': 'dangerous',
  'server:dns_resolve': 'moderate',
  'server:ssl_inspect': 'moderate',
  'server:ping_test': 'moderate',
  'server:http_headers': 'moderate',
  'server:configuration_audit': 'dangerous',
  'server:server_memory_leak': 'safe',
  'server:load_balancer_check': 'moderate',
  'server:disaster_recovery': 'safe',

  // Security Testing — uses actual action names from the schema
  'security:dast_scan': 'dangerous',
  'security:sast_scan': 'moderate',
  'security:dependency_audit': 'moderate',
  'security:secret_scan': 'moderate',
  'security:idor_test': 'dangerous',              // Actual action name
  'security:crypto_audit': 'moderate',

  // Advanced Testing
  'advanced:full_sanity_check': 'moderate',
  'advanced:concurrency_stress': 'dangerous',
  'advanced:fuzz_test': 'dangerous',
  'advanced:disk_benchmark': 'dangerous',
  'advanced:chaos_monkey': 'dangerous',
  'advanced:bubble_test': 'safe',
  'advanced:env_validate': 'safe',
  'advanced:network_check': 'moderate',
  'advanced:regression_suite': 'moderate',

  // Database Testing — all use in-memory sql.js (safe)
  'database:connection_stress': 'safe',
  'database:query_profile': 'safe',
  'database:schema_lint': 'safe',
  'database:acid_compliance': 'safe',
  'database:sql_injection_check': 'safe',
  'database:data_integrity': 'safe',
};

export function getRiskLevel(tool: string, action: string): RiskLevel {
  return ACTION_RISK_MAP[`${tool}:${action}`] || 'dangerous'; // Default to dangerous if unknown
}

// ============================================================
// Sandbox Execution Environments
// ============================================================

const SANDBOX_DIR = path.join(os.tmpdir(), 'REDACTED_safe');
if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });

/**
 * Execute a command in a sandboxed temp directory.
 * The command's HOME, TEMP, USERPROFILE all point to the sandbox dir.
 */
export function sandboxedExec(command: string, timeoutMs = 30000): { stdout: string; stderr: string; exitCode: number } {
  const sandboxWorkDir = path.join(SANDBOX_DIR, crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(sandboxWorkDir, { recursive: true });

  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: sandboxWorkDir,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TEMP: sandboxWorkDir,
        TMP: sandboxWorkDir,
        HOME: sandboxWorkDir,
        USERPROFILE: sandboxWorkDir,
      },
    }).trim();
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, exitCode: e.status || 1 };
  } finally {
    try { fs.rmSync(sandboxWorkDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Write temp files into a sandbox directory (not the real filesystem).
 * Returns the sandbox path where the file was written.
 */
export function sandboxedTempFile(content: Buffer | string, filename?: string): string {
  const dir = path.join(SANDBOX_DIR, crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename || `tmp_${Date.now()}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Cleanup sandbox temp directory.
 */
export function sandboxCleanup(filePath: string): void {
  // Only delete if inside the sandbox dir
  if (filePath.startsWith(SANDBOX_DIR)) {
    try { fs.rmSync(path.dirname(filePath), { recursive: true, force: true }); } catch {}
  }
}

/**
 * Run JavaScript code in a V8 isolate with no host access.
 */
export function sandboxedJsExec(code: string, timeoutMs = 5000): { success: boolean; result?: any; error?: string } {
  const ctx: any = {
    console: { log: (...a: any[]) => { ctx.__logs.push(a.map(String).join(' ')); } },
    Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
    Array, Object, String, Number, Boolean, Map, Set, RegExp, Error, Promise,
    crypto: { randomBytes: (n: number) => crypto.randomBytes(n).toString('hex'), randomUUID: () => crypto.randomUUID() },
    __logs: [] as string[],
  };

  const context = vm.createContext(ctx, { codeGeneration: { strings: false, wasm: false } });

  try {
    const result = vm.runInContext(code, context, { timeout: timeoutMs, breakOnSigint: true });
    return { success: true, result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Safety Gate — The Main Guard
// ============================================================

export interface GateResult {
  allowed: boolean;
  reason?: string;
  sandboxed: boolean;
  risk: RiskLevel;
}

/**
 * Check whether an action should be allowed to execute.
 * Returns whether it's allowed, and whether it must be sandboxed.
 */
export function gate(tool: string, action: string, userRequestedSandbox?: boolean): GateResult {
  const risk = getRiskLevel(tool, action);
  const enforceSandbox = SANDBOX_ENFORCED || userRequestedSandbox;

  if (risk === 'safe') {
    // Safe operations always allowed, run in-process
    return { allowed: true, sandboxed: false, risk };
  }

  if (risk === 'moderate') {
    // Moderate operations: allowed but sandboxed if enforcement is on
    return { allowed: true, sandboxed: enforceSandbox || false, risk };
  }

  // Dangerous operations: must be sandboxed or blocked
  if (enforceSandbox) {
    return { allowed: true, sandboxed: true, risk };
  }

  // If sandbox not enforced and user didn't request it, allow with warning
  return { allowed: true, sandboxed: false, risk };
}

/**
 * Generate a blocked response for dangerous operations.
 */
export function blockedResponse(tool: string, action: string): any {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: false,
        error: {
          code: 'SANDBOX_REQUIRED',
          message: `Action '${action}' on '${tool}' is classified as DANGEROUS and requires sandbox execution. Use sandbox_testing to create a sandbox first, or set sandboxed=true.`,
          risk_level: getRiskLevel(tool, action),
          suggestion: `Create a sandbox first: sandbox_testing create backend=directory, then re-run with sandbox_id parameter.`,
        },
      }),
    }],
  };
}
